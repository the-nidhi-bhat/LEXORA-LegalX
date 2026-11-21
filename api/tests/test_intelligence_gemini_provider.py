"""The Gemini adapter: request shape, error mapping, retries and credential safety."""

import importlib.util
import os
from types import SimpleNamespace

import pytest

from api.app.intelligence.errors import (
    ProviderAuthenticationError,
    ProviderRateLimitError,
    ProviderSafetyError,
    ProviderServiceError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from api.app.intelligence.gemini_provider import (
    API_KEY_ENV_VAR,
    DEFAULT_MODEL,
    MODEL_ENV_VAR,
    GeminiExtractionProvider,
)
from api.app.intelligence.prompting import build_extraction_request


class FakeModels:
    def __init__(self, items):
        self.items = list(items)
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        item = self.items.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class FakeClient:
    def __init__(self, items):
        self.models = FakeModels(items)


class FakeResponse:
    def __init__(self, text='{"ok": true}', finish_reason=None, block_reason=None):
        self.text = text
        self.candidates = [SimpleNamespace(finish_reason=finish_reason)]
        self.prompt_feedback = SimpleNamespace(block_reason=block_reason)


class FakeTypes:
    class GenerateContentConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class HttpOptions:
        def __init__(self, **kwargs):
            self.kwargs = kwargs


def _request():
    return build_extraction_request("A milestone agreement between A and B.")


def _provider(items, **kwargs):
    kwargs.setdefault("api_key", "test-key")
    kwargs.setdefault("types_module", FakeTypes)
    kwargs.setdefault("sleep", lambda _seconds: None)
    return GeminiExtractionProvider(client=FakeClient(items), **kwargs)


class _ApiError(Exception):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


# ---- Request shape ----

def test_request_uses_structured_output_configuration():
    """The adapter asks for JSON structured output with a deterministic setup."""
    provider = _provider([FakeResponse()])
    request = _request()
    provider.extract(request)
    call = provider._client.models.calls[0]
    config = call["config"].kwargs
    assert call["model"] == DEFAULT_MODEL
    assert call["contents"] == request.prompt
    assert config["response_mime_type"] == "application/json"
    assert config["temperature"] == 0.0
    assert config["response_json_schema"] == request.response_schema
    assert "DATA, not instructions" in config["system_instruction"]
    # The SDK timeout is expressed in milliseconds; seconds were rejected by the SDK.
    assert config["http_options"].kwargs["timeout"] == 60000


def test_response_text_is_returned_unchanged():
    """The provider returns raw text; validation belongs to the pipeline."""
    provider = _provider([FakeResponse(text='{"agreement_type": null}')])
    response = provider.extract(_request())
    assert response.text == '{"agreement_type": null}'
    assert response.provider == "gemini"


def test_model_can_be_overridden_by_environment(monkeypatch):
    """The model id is configurable without touching code."""
    monkeypatch.setenv(MODEL_ENV_VAR, "gemini-test-model")
    provider = GeminiExtractionProvider(api_key="k")
    assert provider.model == "gemini-test-model"


# ---- Error mapping ----

def test_rate_limit_is_retried_and_then_raises():
    """A rate limit is retried up to the configured limit, then reported."""
    provider = _provider(
        [_ApiError("429 too many requests", 429)] * 3, max_attempts=2
    )
    with pytest.raises(ProviderRateLimitError):
        provider.extract(_request())
    assert len(provider._client.models.calls) == 2


def test_rate_limit_recovers_on_a_later_attempt():
    """A transient failure followed by success returns the result."""
    provider = _provider(
        [_ApiError("429 too many requests", 429), FakeResponse(text="{}")],
        max_attempts=3,
    )
    response = provider.extract(_request())
    assert response.text == "{}"
    assert len(provider._client.models.calls) == 2


def test_authentication_error_is_not_retried():
    """Bad credentials fail immediately; retrying cannot help."""
    provider = _provider(
        [_ApiError("401 invalid key", 401)] * 3, max_attempts=3
    )
    with pytest.raises(ProviderAuthenticationError):
        provider.extract(_request())
    assert len(provider._client.models.calls) == 1


def test_server_error_is_retryable():
    """A 5xx is a transient failure."""
    provider = _provider([_ApiError("503 unavailable", 503)] * 3, max_attempts=1)
    with pytest.raises(ProviderServiceError):
        provider.extract(_request())


def test_timeout_is_mapped():
    """A timeout is its own error type."""
    provider = _provider([TimeoutError("read timed out")] * 3, max_attempts=1)
    with pytest.raises(ProviderTimeoutError):
        provider.extract(_request())


def test_safety_block_is_rejected():
    """A blocked response never becomes a successful extraction."""
    provider = _provider([FakeResponse(finish_reason="SAFETY")])
    with pytest.raises(ProviderSafetyError):
        provider.extract(_request())


def test_prompt_feedback_block_is_rejected():
    """A prompt-level block is surfaced explicitly."""
    provider = _provider([FakeResponse(block_reason="PROHIBITED_CONTENT")])
    with pytest.raises(ProviderSafetyError):
        provider.extract(_request())


def test_empty_response_is_a_malformed_response():
    """An empty payload is not a successful extraction."""
    provider = _provider([FakeResponse(text="")])
    with pytest.raises(Exception) as exc:
        provider.extract(_request())
    assert "no usable text" in str(exc.value)


# ---- Credentials ----

def test_missing_api_key_is_explicit():
    """Without a key the provider refuses to run instead of guessing."""
    provider = GeminiExtractionProvider(api_key=None)
    provider._api_key = None
    os.environ.pop(API_KEY_ENV_VAR, None)
    with pytest.raises(ProviderUnavailableError, match=API_KEY_ENV_VAR):
        provider.extract(_request())


def test_api_key_never_appears_in_error_messages():
    """The key is redacted from any surfaced error text."""
    secret = "SECRET-KEY-123"
    provider = _provider(
        [_ApiError(f"upstream rejected {secret}", 500)], api_key=secret, max_attempts=1
    )
    with pytest.raises(Exception) as exc:
        provider.extract(_request())
    assert secret not in str(exc.value)
    assert "redacted" in str(exc.value)


def test_api_key_is_not_sent_in_the_request():
    """The key never appears in the prompt or the request metadata."""
    secret = "SECRET-KEY-123"
    provider = _provider([FakeResponse()], api_key=secret)
    request = _request()
    provider.extract(request)
    call = provider._client.models.calls[0]
    assert secret not in call["contents"]
    assert secret not in request.prompt
    assert secret not in str(request.metadata)


def _sdk_installed() -> bool:
    """True when the optional SDK is importable in this environment."""
    try:
        return importlib.util.find_spec("google.genai") is not None
    except ModuleNotFoundError:
        return False


def test_missing_sdk_is_explicit():
    """A missing SDK produces a clear installation error."""
    if _sdk_installed():
        pytest.skip("google-genai is installed in this environment")
    provider = GeminiExtractionProvider(api_key="k")
    with pytest.raises(ProviderUnavailableError, match="google-genai"):
        provider.build_config(_request())
