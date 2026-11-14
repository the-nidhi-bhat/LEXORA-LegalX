"""The provider boundary for extraction.

The pipeline talks to a provider through one small protocol. That keeps the
deterministic parts of P1-04 independent of any vendor SDK, and lets tests
drive the pipeline deterministically with :class:`ScriptedProvider`.

A provider returns **raw structured text**. It does not decide whether the
extraction is acceptable: validation, provenance checking and clarification
requests are the pipeline's job.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

from api.app.intelligence.errors import ProviderError


@dataclass(frozen=True)
class ExtractionRequest:
    """Everything a provider needs for one extraction."""

    #: Normalized source text (NFC, newlines normalised, outer whitespace stripped).
    description: str
    #: Fully rendered user prompt (source text embedded in delimiters).
    prompt: str
    #: System instruction describing the extraction task.
    system_instruction: str
    #: JSON schema the provider must satisfy.
    response_schema: Dict[str, Any]
    #: Free-form metadata for logging and tracing. Never contains secrets.
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderResponse:
    """Raw provider output, before any validation."""

    text: str
    model: str
    provider: str
    finish_reason: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None


@runtime_checkable
class ExtractionProvider(Protocol):
    """Minimal provider contract."""

    name: str

    def extract(self, request: ExtractionRequest) -> ProviderResponse:
        """Return the raw structured output for ``request``.

        Implementations must raise a :class:`ProviderError` subclass on failure
        and must never return a fabricated result.
        """
        ...


class ScriptedProvider:
    """A deterministic provider for tests and pipeline self-checks.

    It replays prepared outputs (raw JSON strings or dicts) in order and
    records the requests it received. When the script is exhausted it raises a
    provider error instead of inventing an answer.
    """

    name = "scripted"

    def __init__(
        self,
        outputs: Optional[List[Any]] = None,
        *,
        model: str = "scripted-model",
        error: Optional[BaseException] = None,
        error_after: int = 0,
    ):
        self._outputs = list(outputs or [])
        self._model = model
        self._error = error
        self._error_after = error_after
        self.requests: List[ExtractionRequest] = []

    def extract(self, request: ExtractionRequest) -> ProviderResponse:
        self.requests.append(request)
        if self._error is not None and len(self.requests) > self._error_after:
            raise self._error
        if not self._outputs:
            raise ProviderError(
                "scripted provider has no further outputs", provider=self.name
            )
        output = self._outputs.pop(0)
        text = output if isinstance(output, str) else _to_json(output)
        return ProviderResponse(text=text, model=self._model, provider=self.name)

    @property
    def call_count(self) -> int:
        return len(self.requests)


def _to_json(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, sort_keys=True)


__all__ = [
    "ExtractionProvider",
    "ExtractionRequest",
    "ProviderResponse",
    "ScriptedProvider",
]
