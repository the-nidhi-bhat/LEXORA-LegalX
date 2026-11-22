"""B-33: party email matching in the execution gate must ignore case."""

from __future__ import annotations

import uuid

from sqlalchemy import select

from api.app.models.agreements import Agreement, AgreementParty, AgreementVersion, VersionApproval
from api.app.models.auth import User
from api.app.timeutil import utcnow


def test_party_email_match_is_case_insensitive(sessions, client, db):
    from api.tests.helpers import post_agreement, valid_payload

    sessions.login("owner@legalx.demo")
    created = post_agreement(
        sessions,
        valid_payload(title="Email case party", approval_policy="client_only"),
    )
    assert created.status_code == 201, created.text
    agreement_id = created.json()["id"]

    owner = db.scalar(select(User).where(User.email == "owner@legalx.demo"))
    admin = db.scalar(select(User).where(User.email == "admin@legalx.demo"))
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
    # Store the party email with different casing than the session email.
    client_party = db.scalar(
        select(AgreementParty).where(
            AgreementParty.agreement_id == agreement_id,
            AgreementParty.role == "client",
        )
    )
    client_party.email = "OWNER@LEGALX.DEMO"
    # Ensure the creator shortcut cannot satisfy the party check: the caller
    # must be recognized as a party by email alone.
    agreement = db.get(Agreement, agreement_id)
    agreement.created_by = admin.id
    db.commit()

    response = client.post(
        f"/api/v1/agreements/{agreement_id}/execution",
        headers={**dict(sessions.csrf_headers), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "executed"
