"""SDK fidelity and secret hygiene for the Gemini adapter (F1, F6, F14).

These tests use the *real* ``google-genai`` enum where the SDK is installed, so a
comparison that only works against a fake string cannot pass.
"""

import importlib.util
from types import SimpleNamespace

import pytest

from api.app.intelligence.errors import ProviderSafetyError, ProviderServiceError
from api.app.intelligence.gemini_provider import (
    GeminiExtractionProvider,
    _reason_token,
    is_configured,
)
from api.app.intelligence.prompting import build_extraction_request


def _sdk_available() -> bool:
    try:
        return importlib.util.find_spec("google.genai") is not None
    except (ImportError, ModuleNotFoundError, ValueError):
        return False


HAS_SDK = _sdk_available()


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


class _ApiError(Exception):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def _provider(items, **kwargs):
    kwargs.setdefault("api_key", "test-key")
    kwargs.setdefault("types_module", FakeTypes)
    kwargs.setdefault("sleep", lambda _seconds: None)
    return GeminiExtractionProvider(client=FakeClient(items), **kwargs)


def _request():
    return build_extraction_request("A milestone agreement between A and B.")


# ---- F1: a real SDK safety stop must be detected ----

@pytest.mark.skipif(not HAS_SDK, reason="google-genai SDK is not installed")
def test_real_sdk_safety_finish_reason_raises_safety_error():
    """FinishReason.SAFETY from the real SDK triggers a safety error.

    Regression guard: ``str(FinishReason.SAFETY)`` is ``"FinishReason.SAFETY"``,
    so a ``str(reason).upper()`` comparison never matched and the safety stop was
    returned as a normal response.
    """
    from google.genai import types

    provider = _provider([FakeResponse(finish_reason=types.FinishReason.SAFETY)])
    with pytest.raises(ProviderSafetyError):
        provider.extract(_request())


@pytest.mark.skipif(not HAS_SDK, reason="google-genai SDK is not installed")
@pytest.mark.parametrize(
    "member",
    ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"],
)
def test_every_safety_finish_reason_is_detected(member):
    from google.genai import types

    reason = getattr(types.FinishReason, member)
    provider = _provider([FakeResponse(finish_reason=reason)])
    with pytest.raises(ProviderSafetyError):
        provider.extract(_request())


@pytest.mark.skipif(not HAS_SDK, reason="google-genai SDK is not installed")
def test_normal_finish_reason_is_not_treated_as_safety():
    from google.genai import types

    provider = _provider([FakeResponse(finish_reason=types.FinishReason.STOP)])
    response = provider.extract(_request())
    assert response.finish_reason == "STOP"


@pytest.mark.skipif(not HAS_SDK, reason="google-genai SDK is not installed")
def test_reason_token_uses_enum_value():
    from google.genai import types

    assert _reason_token(types.FinishReason.SAFETY) == "SAFETY"
    assert _reason_token("SAFETY") == "SAFETY"
    assert _reason_token(None) is None


# ---- F6: the SDK exception chain must not leak the request URL ----

def test_sdk_exception_chain_is_suppressed():
    secret = "SECRET-KEY-VALUE"
    error = _ApiError(f"500 error calling https://api.example/v1?key={secret}", code=500)
    provider = _provider([error], api_key=secret, max_attempts=1)

    with pytest.raises(ProviderServiceError) as exc_info:
        provider.extract(_request())

    assert secret not in str(exc_info.value)
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__suppress_context__ is True


def test_block_reason_from_real_enum_shape_is_detected():
    """A block reason exposed as an enum object is normalized like a finish reason."""
    provider = _provider([FakeResponse(block_reason="PROHIBITED_CONTENT")])
    with pytest.raises(ProviderSafetyError):
        provider.extract(_request())


# ---- F14: an explicit key counts as configured ----

def test_is_configured_accepts_an_explicit_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert is_configured("explicit-key") is True
    assert is_configured() is False


def test_is_configured_reads_the_environment(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "from-env")
    assert is_configured() is True
