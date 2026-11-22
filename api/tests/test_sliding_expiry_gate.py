"""B-13: a forbidden request must not extend the sliding session expiry.

The sliding window is advanced only after both authentication and the
permission gate succeed. Otherwise a caller without the required permission
could keep a denied session alive indefinitely by repeatedly receiving 403s.
"""

from __future__ import annotations

from datetime import timedelta

from api.app.models.auth import SessionRow
from api.app.security import hash_token
from api.app.timeutil import utcnow
from api.tests.helpers import post_agreement, valid_payload


def test_forbidden_request_does_not_extend_expiry(sessions, client, db):
    handle = sessions.login("freelancer@legalx.demo")  # lacks agreement:create
    row = db.get(SessionRow, hash_token(handle.cookie_value))
    near_expiry = utcnow() + timedelta(minutes=5)
    row.expires_at = near_expiry
    db.commit()

    response = post_agreement(sessions, valid_payload(title="Forbidden extension probe"))
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "FORBIDDEN"

    db.refresh(row)
    assert row.expires_at == near_expiry, "a 403 extended the sliding window"

    # A genuinely successful authenticated request still extends it.
    assert client.get("/api/v1/me").status_code == 200
    db.refresh(row)
    assert row.expires_at > near_expiry
    assert row.expires_at <= row.absolute_expires_at
