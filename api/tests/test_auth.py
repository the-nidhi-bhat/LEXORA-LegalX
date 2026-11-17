"""P0-03 authentication tests — API_CONTRACTS.md §3.

Covers: valid login, invalid login, session expiry (sliding + absolute),
identity/permissions coming only from the server, rate limiting, and the
production configuration rules (secure cookies, no SQLite in production).
"""

from __future__ import annotations

from datetime import timedelta

from api.app.models.auth import SessionRow
from api.app.security import hash_token
from api.app.timeutil import utcnow

# Approved D-01 matrix (EXECUTION_PLAN.md §3.1) — written out independently so
# a change to either copy fails this test.
EXPECTED_MATRIX = {
    "owner": {
        "agreement:create", "agreement:view", "agreement:edit", "agreement:suggest",
        "agreement:approve", "escrow:fund", "escrow:view_financials",
        "milestone:submit", "milestone:approve", "ir:read", "verification:read",
        "verification:run", "activity:read", "trust:export",
    },
    "freelancer": {
        "agreement:view", "agreement:suggest", "agreement:approve",
        "escrow:view_financials", "milestone:submit", "activity:read", "trust:export",
    },
    "legal_reviewer": {
        "agreement:view", "agreement:suggest", "agreement:approve_legal",
        "ir:read", "verification:read", "verification:run", "trust:export",
    },
    "org_admin": {"agreement:view", "workspace:manage", "activity:read"},
    "technical_auditor": {
        "agreement:view", "ir:read", "verification:read", "activity:read",
        "audit:read_global", "trust:export",
    },
}


def _sign_in(client, email, password):
    return client.post("/api/v1/auth/session", json={"email": email, "password": password})


def test_valid_login_sets_secure_session_cookie(client):
    response = _sign_in(client, "owner@legalx.demo", "legalx-demo-2026")
    assert response.status_code == 200, response.text

    set_cookies = response.headers.get_list("set-cookie")
    session_cookie = next(c for c in set_cookies if c.startswith("lx_session="))
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie
    assert "Path=/" in session_cookie
    # APP_ENV=test → not production, so Secure is not required; production is
    # asserted separately in test_production_configuration_rules.
    assert "Secure" not in session_cookie

    body = response.json()
    assert set(body.keys()) == {"user", "permissions", "csrf_token", "expires_at"}
    assert body["user"]["email"] == "owner@legalx.demo"
    assert body["user"]["role"] == "owner"
    assert body["user"]["organization_name"] == "Acme Digital"
    assert set(body["permissions"]) == EXPECTED_MATRIX["owner"]
    assert body["expires_at"].endswith("Z")
    # No credential or raw session token material in the body.
    raw_text = response.text
    assert "legalx-demo-2026" not in raw_text
    assert "password" not in raw_text
    assert body["csrf_token"]


def test_invalid_password_returns_invalid_credentials(client):
    response = _sign_in(client, "owner@legalx.demo", "wrong-password")
    assert response.status_code == 401
    error = response.json()["error"]
    assert error["code"] == "INVALID_CREDENTIALS"
    assert error["details"] == []
    assert error["request_id"]


def test_unknown_email_is_indistinguishable_from_wrong_password(client):
    unknown = _sign_in(client, "nobody@legalx.demo", "whatever")
    wrong = _sign_in(client, "owner@legalx.demo", "whatever")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["error"]["code"] == wrong.json()["error"]["code"]
    assert unknown.json()["error"]["message"] == wrong.json()["error"]["message"]


def test_missing_email_is_validation_failed(client):
    response = client.post("/api/v1/auth/session", json={"password": "x"})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_FAILED"
    assert any(d["field"] == "email" for d in error["details"])


def test_malformed_email_is_validation_failed(client):
    response = client.post(
        "/api/v1/auth/session", json={"email": "not-an-email", "password": "x"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_me_requires_session(client):
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_me_returns_server_computed_permissions(sessions, client):
    handle = sessions.login("freelancer@legalx.demo")
    response = client.get("/api/v1/me")
    assert response.status_code == 200
    body = response.json()
    assert set(body["permissions"]) == EXPECTED_MATRIX["freelancer"]
    assert body["user"]["role"] == "freelancer"


def test_client_supplied_role_claims_are_ignored(sessions, client):
    """Role tampering via headers/query/body changes nothing (H1 regression)."""
    sessions.login("freelancer@legalx.demo")
    for kwargs in (
        {"headers": {"X-Role": "owner", "X-Workspace-Id": "acme-digital"}},
        {"params": {"role": "owner", "workspace_id": "acme-digital"}},
        {"json": {"role": "owner", "permissions": ["agreement:create"]}},
    ):
        response = client.request("GET", "/api/v1/me", **kwargs)
        assert response.status_code == 200
        assert response.json()["user"]["role"] == "freelancer"
        assert set(response.json()["permissions"]) == EXPECTED_MATRIX["freelancer"]


def test_sliding_session_expiry_rejects_old_sessions(sessions, client, db):
    handle = sessions.login("owner@legalx.demo")
    row = db.get(SessionRow, hash_token(handle.cookie_value))
    assert row is not None
    row.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()

    sessions.switch(handle)
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_absolute_session_cap_rejects_even_extended_sessions(sessions, client, db):
    handle = sessions.login("owner@legalx.demo")
    row = db.get(SessionRow, hash_token(handle.cookie_value))
    row.expires_at = utcnow() + timedelta(hours=11)  # sliding window still valid…
    row.absolute_expires_at = utcnow() - timedelta(seconds=1)  # …but the cap has passed
    db.commit()

    sessions.switch(handle)
    response = client.get("/api/v1/me")
    assert response.status_code == 401


def test_sliding_window_extends_on_activity(sessions, client, db):
    handle = sessions.login("owner@legalx.demo")
    row = db.get(SessionRow, hash_token(handle.cookie_value))
    original = row.expires_at
    row.expires_at = utcnow() + timedelta(minutes=5)  # nearly expired
    db.commit()

    sessions.switch(handle)
    response = client.get("/api/v1/me")
    assert response.status_code == 200
    db.refresh(row)
    assert row.expires_at > original  # extended beyond the nearly-expired value
    assert row.expires_at <= row.absolute_expires_at


def test_login_rate_limit(client):
    for _ in range(5):
        assert _sign_in(client, "owner@legalx.demo", "wrong").status_code == 401
    blocked = _sign_in(client, "owner@legalx.demo", "legalx-demo-2026")
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    assert blocked.headers.get("Retry-After")


def test_production_configuration_rules():
    from api.app.config import ConfigError, load_settings

    # Production refuses SQLite…
    try:
        load_settings({"APP_ENV": "production", "DATABASE_URL": "sqlite:///./x.db"})
    except ConfigError as exc:
        assert "postgresql" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("production accepted SQLite")

    # …requires secure cookies once it has Postgres…
    prod = load_settings(
        {"APP_ENV": "production", "DATABASE_URL": "postgresql+psycopg://u:p@h/db"}
    )
    assert prod.cookie_secure is True

    # …and the demo tamper endpoint may never be on in production (N-05).
    try:
        load_settings(
            {
                "APP_ENV": "production",
                "DATABASE_URL": "postgresql+psycopg://u:p@h/db",
                "DEMO_TAMPER_ENDPOINT": "true",
            }
        )
    except ConfigError as exc:
        assert "DEMO_TAMPER_ENDPOINT" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("production accepted DEMO_TAMPER_ENDPOINT=true")

    dev = load_settings({"APP_ENV": "dev"})
    assert dev.cookie_secure is False
