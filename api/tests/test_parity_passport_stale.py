"""H-04: a stale trust passport must not be presented as ``passed``.

The passport is evidence-only and re-derived on every read. When a bound legal
fact changes after verification, the stored run may still carry ``passed=True``;
reporting that alongside ``stale=True`` misleadingly suggests the evidence is
still valid. The execution gate is independent and is not changed here.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select

from api.app.models.agreements import Agreement, AgreementVersion, VersionApproval
from api.app.ratelimit import limiter
from api.app.timeutil import utcnow

EP_MATCH = {"execution_parameters": {"dispute_behavior": "mediate", "governing_law": "India"}}


def _create_agreement(sessions) -> str:
    from api.tests.helpers import post_agreement, valid_payload

    response = post_agreement(
        sessions,
        valid_payload(
            title="Stale passport project",
            approval_policy="client_only",
            dispute_behavior="mediate",
            governing_law="India",
        ),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _post_verify(sessions, agreement_id: str):
    return sessions.client.post(
        f"/api/v1/agreements/{agreement_id}/versions/1/verify",
        json=EP_MATCH,
        headers=dict(sessions.csrf_headers),
    )


def _get_passport(sessions, agreement_id: str):
    return sessions.client.get(f"/api/v1/agreements/{agreement_id}/trust-passport")


def test_stale_trust_passport_is_not_marked_passed(sessions, db):
    limiter.reset()
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    agreement = db.scalar(select(Agreement).where(Agreement.id == agreement_id))
    version = db.scalar(
        select(AgreementVersion).where(AgreementVersion.agreement_id == agreement_id)
    )
    # Make the stored run genuinely passing (no blocking diffs + all approvals).
    db.add(
        VersionApproval(
            id=str(uuid.uuid4()),
            version_id=version.id,
            party_role="client",
            actor_user_id=agreement.created_by,
            actor_name="Test Client",
            confirmed_sha256=version.sha256,
            approved_at=utcnow(),
        )
    )
    db.commit()

    verified = _post_verify(sessions, agreement_id)
    assert verified.status_code == 200, verified.text
    assert verified.json()["passed"] is True

    fresh = _get_passport(sessions, agreement_id)
    assert fresh.status_code == 200, fresh.text
    assert fresh.json()["stale"] is False
    assert fresh.json()["passed"] is True

    # Mutate a bound legal fact without re-verifying: the stored pass is stale.
    agreement = db.scalar(select(Agreement).where(Agreement.id == agreement_id))
    agreement.dispute_behavior = "arbitrate"
    db.commit()

    stale = _get_passport(sessions, agreement_id)
    assert stale.status_code == 200, stale.text
    body = stale.json()
    assert body["stale"] is True
    assert body["overall_status"] == "stale"
    assert body["passed"] is False, "stale evidence must not be reported as passed"
