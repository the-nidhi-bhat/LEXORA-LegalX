"""B-11: only genuine credential failures may consume the sign-in budget.

A signed-in user whose account has no workspace membership gets ``403 FORBIDDEN``
— their password was correct, so that outcome is an authorization decision and
must not be charged against the per-email credential-failure budget.
"""

from __future__ import annotations

from api.app.models.auth import User
from api.app.security import hash_password

PASSWORD = "legalx-demo-2026"


def _sign_in(client, email: str, password: str):
    return client.post(
        "/api/v1/auth/session", json={"email": email, "password": password}
    )


def test_no_membership_is_not_charged_to_the_credential_budget(client, db):
    user = User(
        id="test-no-membership",
        email="no-membership@legalx.demo",
        name="No Membership",
        initials="NM",
        password_hash=hash_password(PASSWORD),
        is_active=True,
    )
    db.add(user)
    db.commit()
    try:
        # Correct password, no membership -> 403, not a credential failure.
        response = _sign_in(client, user.email, PASSWORD)
        assert response.status_code == 403, response.text
        assert response.json()["error"]["code"] == "FORBIDDEN"

        # Five genuine credential failures are still required before the
        # limiter blocks. If the 403 had consumed a slot, the fifth attempt
        # below would already be a 429.
        for _ in range(5):
            assert _sign_in(client, user.email, "wrong").status_code == 401
        blocked = _sign_in(client, user.email, "wrong")
        assert blocked.status_code == 429
        assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    finally:
        db.delete(user)
        db.commit()
