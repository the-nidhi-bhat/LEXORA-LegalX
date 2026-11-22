"""B-29: the Gemini provider must report a truthful status.

The status must never claim a real/live AI backend when the provider is not
actually backed by one. These tests use injected fakes and an explicit SDK
availability flag; no real credential and no network access is involved.
"""

import pytest

from api.app.intelligence.gemini_provider import (
    STATUS_REAL,
    STATUS_SIMULATED,
    STATUS_UNAVAILABLE,
    API_KEY_ENV_VAR,
    GeminiExtractionProvider,
)


class _FakeClient:
    pass


def _provider(**kwargs):
    kwargs.setdefault("api_key", None)
    kwargs.setdefault("client", None)
    # Force the SDK-detection branch deterministically; no real SDK needed.
    kwargs.setdefault("sdk_available", False)
    return GeminiExtractionProvider(**kwargs)


def test_status_is_unavailable_without_a_key(monkeypatch):
    """No key and no SDK means the provider cannot make real calls."""
    monkeypatch.delenv(API_KEY_ENV_VAR, raising=False)
    provider = _provider()
    assert provider.status == STATUS_UNAVAILABLE
    assert provider.is_available is False
    assert provider.is_real is False


def test_status_is_unavailable_with_key_but_no_sdk(monkeypatch):
    """A key without the SDK still cannot call Gemini; status must not lie."""
    monkeypatch.delenv(API_KEY_ENV_VAR, raising=False)
    provider = _provider(api_key="fake-key", sdk_available=False)
    assert provider.status == STATUS_UNAVAILABLE
    assert provider.is_real is False


def test_status_is_real_when_key_and_sdk_are_present(monkeypatch):
    """A configured key plus an installed SDK is a real Gemini backend."""
    monkeypatch.delenv(API_KEY_ENV_VAR, raising=False)
    provider = _provider(api_key="fake-key", sdk_available=True)
    assert provider.status == STATUS_REAL
    assert provider.is_available is True
    assert provider.is_real is True


def test_status_is_simulated_for_an_injected_fake_client(monkeypatch):
    """An injected non-SDK client is simulated, never reported as real."""
    monkeypatch.delenv(API_KEY_ENV_VAR, raising=False)
    provider = _provider(api_key="fake-key", client=_FakeClient(), sdk_available=True)
    assert provider.status == STATUS_SIMULATED
    assert provider.is_available is True
    assert provider.is_real is False


def test_status_reads_the_environment_key(monkeypatch):
    """A key supplied via the environment counts as configured."""
    monkeypatch.setenv(API_KEY_ENV_VAR, "from-env")
    provider = GeminiExtractionProvider(sdk_available=True)
    assert provider.status == STATUS_REAL


@pytest.mark.parametrize("status", [STATUS_REAL, STATUS_SIMULATED, STATUS_UNAVAILABLE])
def test_status_values_are_stable_strings(status):
    """Status is a plain string suitable for reporting/serialization."""
    assert isinstance(status, str)
