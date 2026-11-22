"""Gemini adapter for contract extraction.

Uses the official ``google-genai`` SDK (``from google import genai``). The SDK
is imported lazily so that the rest of the package — and its tests — work in an
environment where the optional dependency is not installed; only this adapter
fails, with an explicit error, when it is actually used.

Credential handling:

- the API key comes from the ``GEMINI_API_KEY`` environment variable or an
  explicit constructor argument, and is never logged, printed or echoed in an
  error message;
- the key is never placed in the prompt, the metadata or the request payload.

Failure handling:

- every provider failure is mapped onto a typed :class:`ProviderError` subclass
  so the caller can distinguish "retry later" from "fix the request";
- transient failures (429, 5xx, timeouts, transport errors) are retried a
  bounded number of times with a linear backoff;
- there is no silent fallback: if Gemini cannot be used, the call raises. A
  fabricated "successful" extraction is never produced.
"""

from __future__ import annotations

import importlib.util
import os
import time
from typing import Any, Callable, Optional

from api.app.intelligence.errors import (
    ProviderAuthenticationError,
    ProviderError,
    ProviderMalformedResponseError,
    ProviderRateLimitError,
    ProviderSafetyError,
    ProviderServiceError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from api.app.intelligence.provider import ExtractionRequest, ProviderResponse

#: Default structured-output model. Overridable with ``LEGALX_GEMINI_MODEL``.
DEFAULT_MODEL = "gemini-3.8-flash"

#: Environment variable holding the API key.
API_KEY_ENV_VAR = "GEMINI_API_KEY"

#: Environment variable overriding the model id.
MODEL_ENV_VAR = "LEGALX_GEMINI_MODEL"

_SAFETY_FINISH_REASONS = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"}

#: Truthful provider statuses. ``real`` means an actual Gemini SDK client is
#: configured, ``simulated`` means an injected non-SDK (test/demo) client, and
#: ``unavailable`` means no usable client can be resolved. A provider must never
#: report ``real`` just because an API key happens to be present.
STATUS_REAL = "real"
STATUS_SIMULATED = "simulated"
STATUS_UNAVAILABLE = "unavailable"


class GeminiExtractionProvider:
    """Extraction provider backed by the Gemini API."""

    name = "gemini"

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        client: Any = None,
        model: Optional[str] = None,
        timeout_seconds: float = 60.0,
        max_attempts: int = 3,
        backoff_seconds: float = 1.0,
        sleep: Optional[Callable[[float], None]] = None,
        types_module: Any = None,
        sdk_available: Optional[bool] = None,
    ):
        self._api_key = api_key or os.environ.get(API_KEY_ENV_VAR)
        self._client = client
        self._types = types_module
        # Explicit override for the status probe, so callers/tests can state
        # whether the optional SDK is installed without importing it.
        self._sdk_available = sdk_available
        self.model = model or os.environ.get(MODEL_ENV_VAR) or DEFAULT_MODEL
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max(1, int(max_attempts))
        self.backoff_seconds = backoff_seconds
        self._sleep = sleep or time.sleep

    # -- truthful status --------------------------------------------------

    @property
    def status(self) -> str:
        """What this provider can actually do, never an aspiration.

        - ``real``: an official Gemini SDK client is in use, or a key plus an
          installed SDK means real calls are possible.
        - ``simulated``: an injected non-SDK client (tests/demos) is in use.
        - ``unavailable``: no usable client or credentials are available.
        """
        if self._client is not None:
            return STATUS_REAL if _is_official_client(self._client) else STATUS_SIMULATED
        if is_configured(self._api_key) and self._sdk_is_installed():
            return STATUS_REAL
        return STATUS_UNAVAILABLE

    @property
    def is_available(self) -> bool:
        """True when the provider has a usable client (real or simulated)."""
        return self.status in (STATUS_REAL, STATUS_SIMULATED)

    @property
    def is_real(self) -> bool:
        """True only when backed by an actual Gemini SDK client/key."""
        return self.status == STATUS_REAL

    def _sdk_is_installed(self) -> bool:
        # Used only by the status probe; the actual client resolution imports
        # the SDK and raises a typed error if it is missing. An explicit
        # override keeps status reporting deterministic without the SDK.
        if self._sdk_available is not None:
            return self._sdk_available
        try:
            return importlib.util.find_spec("google.genai") is not None
        except (ImportError, ValueError):  # pragma: no cover - defensive
            return False

    # -- client / SDK -----------------------------------------------------

    def _resolve_types(self) -> Any:
        if self._types is None:
            try:
                from google.genai import types as genai_types  # type: ignore
            except ImportError as exc:  # pragma: no cover - depends on env
                raise ProviderUnavailableError(
                    "the google-genai SDK is not installed; install it with "
                    "'pip install google-genai' to use the Gemini provider",
                    provider=self.name,
                ) from exc
            self._types = genai_types
        return self._types

    def _resolve_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self._api_key:
            raise ProviderUnavailableError(
                f"{API_KEY_ENV_VAR} is not set; the Gemini provider cannot be used",
                provider=self.name,
            )
        try:
            from google import genai  # type: ignore
        except ImportError as exc:  # pragma: no cover - depends on env
            raise ProviderUnavailableError(
                "the google-genai SDK is not installed; install it with "
                "'pip install google-genai' to use the Gemini provider",
                provider=self.name,
            ) from exc
        self._client = genai.Client(api_key=self._api_key)
        return self._client

    # -- request ----------------------------------------------------------

    def build_config(self, request: ExtractionRequest) -> Any:
        """Build the structured-output configuration for one request."""
        types_module = self._resolve_types()
        return types_module.GenerateContentConfig(
            system_instruction=request.system_instruction,
            temperature=0.0,
            max_output_tokens=8192,
            candidate_count=1,
            response_mime_type="application/json",
            response_json_schema=request.response_schema,
            http_options=types_module.HttpOptions(
                api_version="v1",
                # The SDK expresses this timeout in milliseconds; passing seconds
                # through client_args used to leave the real timeout unset.
                timeout=int(self.timeout_seconds * 1000),
            ),
        )

    # -- extraction -------------------------------------------------------

    def extract(self, request: ExtractionRequest) -> ProviderResponse:
        """Call Gemini and return the raw structured output."""
        client = self._resolve_client()
        config = self.build_config(request)

        last_error: Optional[ProviderError] = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = client.models.generate_content(
                    model=self.model,
                    contents=request.prompt,
                    config=config,
                )
            except Exception as exc:  # noqa: BLE001 - mapped to typed errors
                error = self._classify(exc)
                if error.retryable and attempt < self.max_attempts:
                    self._sleep(self.backoff_seconds * attempt)
                    last_error = error
                    continue
                # `from None` suppresses the chained SDK exception: its message can
                # contain the request URL with the API key in it.
                raise error from None
            return self._read_response(response)

        raise last_error or ProviderServiceError(
            "gemini request failed", provider=self.name
        )

    def _read_response(self, response: Any) -> ProviderResponse:
        """Validate the provider response and return its raw text."""
        finish_reason = self._finish_reason(response)
        if finish_reason and finish_reason in _SAFETY_FINISH_REASONS:
            raise ProviderSafetyError(
                f"gemini blocked the request (finish_reason={finish_reason})",
                provider=self.name,
            )
        block_reason = self._block_reason(response)
        if block_reason:
            raise ProviderSafetyError(
                f"gemini blocked the request (block_reason={block_reason})",
                provider=self.name,
            )

        text = getattr(response, "text", None)
        if not text:
            raise ProviderMalformedResponseError(
                "gemini returned no usable text payload", provider=self.name
            )
        return ProviderResponse(
            text=text,
            model=self.model,
            provider=self.name,
            finish_reason=finish_reason,
        )

    @staticmethod
    def _finish_reason(response: Any) -> Optional[str]:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return None
        return _reason_token(getattr(candidates[0], "finish_reason", None))

    @staticmethod
    def _block_reason(response: Any) -> Optional[str]:
        feedback = getattr(response, "prompt_feedback", None)
        reason = getattr(feedback, "block_reason", None) if feedback else None
        return _reason_token(reason)

    # -- error mapping ----------------------------------------------------

    def _classify(self, exc: BaseException) -> ProviderError:
        """Map an SDK exception onto a typed provider error."""
        status_code = _status_code(exc)
        name = type(exc).__name__.lower()
        message = self._scrub(str(exc) or name)

        if "timeout" in name or "timeout" in message.lower():
            return ProviderTimeoutError(message, provider=self.name, status_code=status_code)
        if status_code in (401, 403):
            return ProviderAuthenticationError(
                message, provider=self.name, status_code=status_code
            )
        if status_code == 429:
            return ProviderRateLimitError(
                message, provider=self.name, status_code=status_code
            )
        if status_code is not None and 500 <= status_code < 600:
            return ProviderServiceError(
                message, provider=self.name, status_code=status_code
            )
        if any(token in name for token in ("connect", "network", "transport", "server")):
            return ProviderServiceError(message, provider=self.name, status_code=status_code)
        return ProviderError(message, provider=self.name, status_code=status_code)

    def _scrub(self, message: str) -> str:
        """Remove the API key from a message before it is surfaced."""
        if self._api_key and self._api_key in message:
            return message.replace(self._api_key, "***redacted***")
        return message


def _reason_token(reason: Any) -> Optional[str]:
    """Normalize an SDK enum reason to its plain upper-case token.

    ``str(types.FinishReason.SAFETY)`` is ``"FinishReason.SAFETY"`` because the
    enum replaces the string mixin's ``__str__``. Comparing ``str(reason).upper()``
    against ``{"SAFETY", ...}`` therefore never matched, and a safety stop was
    treated as a normal response. ``.value`` carries the plain token.
    """
    if reason is None:
        return None
    token = str(getattr(reason, "value", reason)).strip().upper()
    return token or None


def _status_code(exc: BaseException) -> Optional[int]:
    for attribute in ("code", "status_code"):
        value = getattr(exc, attribute, None)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return None


def is_configured(api_key: Optional[str] = None) -> bool:
    """True when an API key is available, explicitly or via the environment."""
    return bool(api_key or os.environ.get(API_KEY_ENV_VAR))


def _is_official_client(client: Any) -> bool:
    """True when ``client`` comes from the official ``google-genai`` SDK."""
    module = type(client).__module__ or ""
    return module == "google.genai.client" or module.startswith("google.genai.")


__all__ = [
    "API_KEY_ENV_VAR",
    "DEFAULT_MODEL",
    "MODEL_ENV_VAR",
    "STATUS_REAL",
    "STATUS_SIMULATED",
    "STATUS_UNAVAILABLE",
    "GeminiExtractionProvider",
    "is_configured",
]
