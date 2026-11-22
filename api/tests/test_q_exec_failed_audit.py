"""B-35: a blocked execution attempt must leave an append-only audit event."""

from __future__ import annotations

import json

from sqlalchemy import select

from api.app.models.agreements import ActivityEvent
from api.app.models.auth import User


def test_failed_execution_gate_records_audit_event(sessions, client, db):
    from api.tests.helpers import post_agreement, valid_payload

    sessions.login("owner@legalx.demo")
    created = post_agreement(
        sessions,
        valid_payload(title="Failed attempt audit", approval_policy="client_only"),
    )
    assert created.status_code == 201, created.text
    agreement_id = created.json()["id"]

    # No approval on the current version -> the approval gate blocks the
    # attempt with 403. The gate outcome itself must not change.
    response = client.post(
        f"/api/v1/agreements/{agreement_id}/execution",
        headers=dict(sessions.csrf_headers),
    )
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "FORBIDDEN"

    # End the test session's read transaction so the API's committed rows are
    # visible to these assertions.
    db.commit()
    failures = db.scalars(
        select(ActivityEvent).where(
            ActivityEvent.agreement_id == agreement_id,
            ActivityEvent.event_type == "agreement.execution_failed",
        )
    ).all()
    assert len(failures) == 1, "the blocked attempt was not audited"

    payload = json.loads(failures[0].payload)
    assert payload["version"] == 1
    assert payload["approval_policy"] == "client_only"
    assert "approval" in payload["reason"]
    owner = db.scalar(select(User).where(User.email == "owner@legalx.demo"))
    assert failures[0].actor_user_id == owner.id

    # Append-only: the pre-existing creation event is still present and
    # unchanged; nothing was rewritten by the failure path.
    created_events = db.scalars(
        select(ActivityEvent).where(
            ActivityEvent.agreement_id == agreement_id,
            ActivityEvent.event_type == "agreement.created",
        )
    ).all()
    assert len(created_events) == 1
