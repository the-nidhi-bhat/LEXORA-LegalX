"""B-12: successful sign-in purges this user's expired session rows.

Sessions were only ever revoked or left to expire; expired rows were never
deleted, so the table grew without bound. Cleanup is scoped to the signing-in
user and happens in the same transaction as the new session row.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, select

from api.app.models.auth import Membership, SessionRow, User
from api.app.security import hash_token
from api.app.timeutil import utcnow

PASSWORD = "legalx-demo-2026"
SLIDING_EXPIRED = "cleanup-sliding-expired"
ABSOLUTE_EXPIRED = "cleanup-absolute-expired"
STILL_LIVE = "cleanup-still-live"


def test_successful_login_prunes_expired_sessions(client, db):
    user = db.scalar(select(User).where(User.email == "owner@legalx.demo"))
    org_id = db.scalar(
        select(Membership.organization_id).where(Membership.user_id == user.id)
    )
    now = utcnow()
    db.add_all(
        [
            SessionRow(
                token_hash=hash_token(SLIDING_EXPIRED),
                user_id=user.id,
                organization_id=org_id,
                csrf_token="c-sliding",
                created_at=now - timedelta(days=1),
                expires_at=now - timedelta(seconds=1),
                absolute_expires_at=now + timedelta(days=1),
            ),
            SessionRow(
                token_hash=hash_token(ABSOLUTE_EXPIRED),
                user_id=user.id,
                organization_id=org_id,
                csrf_token="c-absolute",
                created_at=now - timedelta(days=8),
                expires_at=now + timedelta(hours=1),
                absolute_expires_at=now - timedelta(seconds=1),
            ),
            SessionRow(
                token_hash=hash_token(STILL_LIVE),
                user_id=user.id,
                organization_id=org_id,
                csrf_token="c-live",
                created_at=now,
                expires_at=now + timedelta(hours=1),
                absolute_expires_at=now + timedelta(days=1),
            ),
        ]
    )
    db.commit()
    new_hash = None
    try:
        response = client.post(
            "/api/v1/auth/session",
            json={"email": "owner@legalx.demo", "password": PASSWORD},
        )
        assert response.status_code == 200, response.text

        new_hash = hash_token(client.cookies.get("lx_session"))
        db.expire_all()
        assert db.get(SessionRow, hash_token(SLIDING_EXPIRED)) is None
        assert db.get(SessionRow, hash_token(ABSOLUTE_EXPIRED)) is None
        assert db.get(SessionRow, hash_token(STILL_LIVE)) is not None
        assert db.get(SessionRow, new_hash) is not None
    finally:
        hashes = [hash_token(t) for t in (SLIDING_EXPIRED, ABSOLUTE_EXPIRED, STILL_LIVE)]
        if new_hash:
            hashes.append(new_hash)
        db.execute(delete(SessionRow).where(SessionRow.token_hash.in_(hashes)))
        db.commit()
