"""P0-03 CSRF tests — API_CONTRACTS.md §1.3.

Every non-GET request that carries a live session must present
``X-CSRF-Token`` bound to that session row. There are no exemptions for
authenticated writes; the only CSRF-free write is sign-in itself, which by
definition has no session yet.
"""

from __future__ import annotations


def test_unsafe_method_without_csrf_header_is_rejected(sessions, client):
    handle = sessions.login("owner@legalx.demo")
    response = client.delete("/api/v1/auth/session")  # no X-CSRF-Token
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_FAILED"


def test_wrong_csrf_token_is_rejected(sessions, client):
    handle = sessions.login("owner@legalx.demo")
    response = client.delete(
        "/api/v1/auth/session", headers={"X-CSRF-Token": "not-the-token"}
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_FAILED"

    # The session itself was not harmed by the failed attempt.
    sessions.switch(handle)
    assert client.get("/api/v1/me").status_code == 200


def test_csrf_failure_does_not_revoke_the_session(sessions, client, db):
    from api.app.models.auth import SessionRow
    from api.app.security import hash_token
    from api.app.timeutil import utcnow

    handle = sessions.login("owner@legalx.demo")
    client.delete("/api/v1/auth/session")  # 403, no header
    row = db.get(SessionRow, hash_token(handle.cookie_value))
    assert row.revoked_at is None
    assert row.expires_at > utcnow()


def test_valid_csrf_token_allows_the_write(sessions, client):
    handle = sessions.login("owner@legalx.demo")
    response = client.delete(
        "/api/v1/auth/session", headers={"X-CSRF-Token": handle.csrf_token}
    )
    assert response.status_code == 204


def test_get_requests_never_require_csrf(sessions, client):
    sessions.login("owner@legalx.demo")
    assert client.get("/api/v1/me").status_code == 200  # no CSRF header sent


def test_sign_in_is_exempt_only_because_no_session_exists(client):
    """Contract §3.1: login carries no session, so there is nothing to bind."""
    response = client.post(
        "/api/v1/auth/session",
        json={"email": "owner@legalx.demo", "password": "legalx-demo-2026"},
    )
    assert response.status_code == 200
    assert response.json()["csrf_token"]


def test_csrf_token_is_bound_to_one_session(sessions, client):
    """A token minted for session A must not authorise a write from session B."""
    owner = sessions.login("owner@legalx.demo")
    freelancer = sessions.login("freelancer@legalx.demo")

    # Freelancer session tries to sign out using the owner's CSRF token.
    sessions.switch(freelancer)
    response = client.delete(
        "/api/v1/auth/session", headers={"X-CSRF-Token": owner.csrf_token}
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_FAILED"

    # Both sessions remain live.
    sessions.switch(owner)
    assert client.get("/api/v1/me").status_code == 200
    sessions.switch(freelancer)
    assert client.get("/api/v1/me").status_code == 200
