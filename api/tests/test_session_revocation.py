"""P0-03 session revocation and token storage tests — API_CONTRACTS.md §3.2/§1.2.

- sign-out revokes the server row (cookie replay afterwards → 401);
- only the SHA-256 of the raw token is ever stored;
- an already-revoked session cannot be "signed out" again.
"""

from __future__ import annotations

from api.app.models.auth import SessionRow
from api.app.security import hash_token
from api.app.timeutil import utcnow


def test_sign_out_revokes_row_and_blocks_replay(sessions, client, db):
    handle = sessions.login("owner@legalx.demo")
    row = db.get(SessionRow, hash_token(handle.cookie_value))
    assert row is not None and row.revoked_at is None

    sessions.logout(handle)
    db.expire_all()
    row = db.get(SessionRow, hash_token(handle.cookie_value))
    assert row.revoked_at is not None
    assert row.revoked_at <= utcnow()

    # Replaying the raw cookie after revocation must fail.
    client.cookies.set("lx_session", handle.cookie_value)
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_sign_out_clears_the_cookie(sessions, client):
    handle = sessions.login("owner@legalx.demo")
    sessions.switch(handle)
    response = client.delete(
        "/api/v1/auth/session", headers={"X-CSRF-Token": handle.csrf_token}
    )
    assert response.status_code == 204
    clearing = next(
        (c for c in response.headers.get_list("set-cookie") if c.startswith("lx_session=")),
        None,
    )
    assert clearing is not None, "logout must emit a cookie-clearing Set-Cookie"
    assert "Max-Age=0" in clearing


def test_second_sign_out_fails_because_session_is_dead(sessions, client):
    handle = sessions.login("owner@legalx.demo")
    sessions.logout(handle)

    # Put the cookie back and try again with a (now meaningless) CSRF token.
    client.cookies.set("lx_session", handle.cookie_value)
    response = client.delete(
        "/api/v1/auth/session", headers={"X-CSRF-Token": handle.csrf_token}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_only_the_hash_of_the_token_is_stored(db, sessions):
    handle = sessions.login("owner@legalx.demo")
    row = db.get(SessionRow, hash_token(handle.cookie_value))

    assert row is not None
    assert row.token_hash != handle.cookie_value
    assert len(row.token_hash) == 64
    assert all(c in "0123456789abcdef" for c in row.token_hash)
    assert row.token_hash == hash_token(handle.cookie_value)


def test_csrf_token_is_random_per_session(sessions):
    first = sessions.login("owner@legalx.demo")
    second = sessions.login("owner@legalx.demo")
    assert first.csrf_token != second.csrf_token
    assert first.cookie_value != second.cookie_value


def test_revocation_is_per_session_not_per_user(sessions, client):
    """Revoking one session must not kill the user's other live session."""
    first = sessions.login("owner@legalx.demo")
    second = sessions.login("owner@legalx.demo")  # a second device/session

    sessions.logout(first)

    sessions.switch(second)
    assert client.get("/api/v1/me").status_code == 200

    sessions.switch(first)
    assert client.get("/api/v1/me").status_code == 401
