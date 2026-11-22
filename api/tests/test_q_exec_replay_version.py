"""B-31: an Idempotency-Key replay must return the stored response verbatim.

The replay path used to re-synthesize the response from the agreement's
*current* state. If a newer version was created after the first successful
execution, the replay reported that newer version instead of the one the
client actually executed.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select

from api.app.hashing import sha256_hex
from api.app.models.agreements import Agreement, AgreementVersion, VersionApproval
from api.app.models.auth import User
from api.app.timeutil import utcnow


def _post_execution(sessions, agreement_id: str, key: str):
    headers = dict(sessions.csrf_headers)
    headers["Idempotency-Key"] = key
    return sessions.client.post(
        f"/api/v1/agreements/{agreement_id}/execution", headers=headers
    )


def test_idempotent_replay_returns_stored_version_after_new_version(sessions, db):
    from api.tests.helpers import post_agreement, valid_payload

    sessions.login("owner@legalx.demo")
    created = post_agreement(
        sessions,
        valid_payload(title="Replay version drift", approval_policy="client_only"),
    )
    assert created.status_code == 201, created.text
    agreement_id = created.json()["id"]

    owner = db.scalar(select(User).where(User.email == "owner@legalx.demo"))
    version = db.scalar(
        select(AgreementVersion).where(AgreementVersion.agreement_id == agreement_id)
    )
    db.add(
        VersionApproval(
            id=str(uuid.uuid4()),
            version_id=version.id,
            party_role="client",
            actor_user_id=owner.id,
            actor_name="Test Client",
            confirmed_sha256=version.sha256,
            approved_at=utcnow(),
        )
    )
    db.commit()

    key = str(uuid.uuid4())
    first = _post_execution(sessions, agreement_id, key)
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["version"] == 1

    # Move the agreement on to a second version after the original execution.
    text_v2 = "Second version text"
    v2 = AgreementVersion(
        id=str(uuid.uuid4()),
        agreement_id=agreement_id,
        version=2,
        status="draft",
        text=text_v2,
        sha256=sha256_hex(text_v2),
        canonical_length=len(text_v2),
        created_by=owner.id,
        created_at=utcnow(),
    )
    db.add(v2)
    db.flush()
    agreement = db.get(Agreement, agreement_id)
    agreement.current_version_id = v2.id
    db.commit()

    replay = _post_execution(sessions, agreement_id, key)
    assert replay.status_code == 200, replay.text
    body = replay.json()

    assert body["status"] == "idempotent_replay"
    # The replay must describe the original execution, not the current version.
    assert body["version"] == first_body["version"] == 1
    assert body["executed_at"] == first_body["executed_at"]
    assert body["agreement_id"] == first_body["agreement_id"]
