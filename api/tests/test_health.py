"""P0-01 health endpoint tests — API_CONTRACTS.md §10."""

from __future__ import annotations


def test_health_is_public_and_shape_is_exact(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    # Exactly these keys: no configuration values, no PII, no stack traces.
    assert set(body.keys()) == {"status", "version", "db"}
    assert body["status"] == "ok"
    assert body["db"] in {"ok", "unavailable"}
    assert isinstance(body["version"], str) and body["version"]


def test_health_carries_request_id(client):
    response = client.get("/api/health")
    assert response.headers.get("X-Request-Id")


def test_health_echoes_incoming_request_id(client):
    response = client.get("/api/health", headers={"X-Request-Id": "req-abc-123"})
    assert response.headers.get("X-Request-Id") == "req-abc-123"


def test_unknown_route_uses_error_envelope(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "NOT_FOUND"
    assert isinstance(error["details"], list)
    assert error["request_id"]


def test_no_wildcard_cors_is_configured():
    """API_CONTRACTS.md §1.1: allow_origins=['*'] may never appear."""
    from api.app.config import load_settings

    settings = load_settings({"APP_ENV": "test", "CORS_ORIGINS": ""})
    assert settings.cors_origins == []

    try:
        load_settings({"APP_ENV": "test", "CORS_ORIGINS": "*"})
    except Exception as exc:  # noqa: BLE001 - any rejection is acceptable
        assert "wildcard" in str(exc).lower() or "*" in str(exc)
    else:  # pragma: no cover - guard against silent acceptance
        raise AssertionError("wildcard CORS origin was accepted")
