"""P0-08 execution gate and verification tests.

Covers: execution endpoint, approval verification, workspace isolation,
stale approvals, invalid states, idempotency, and audit events.
"""

from __future__ import annotations

import json
import uuid
from datetime import timedelta

import pytest

from api.app.timeutil import utcnow

from sqlalchemy import select, update
from api.app.models.agreements import (
    Agreement,
    ActivityEvent,
    IdempotencyKey,
    VersionApproval,
)


def _assert_execution_envelope(response) -> dict:
    """Check the execution response has the expected top-level keys."""
    assert response.status_code in (200, 401, 403, 404, 429), response.text
    body = response.json()
    # Execution response envelope
    assert set(body.keys()) in (
        {"status", "agreement_id", "version", "approval_policy",
         "triggered_by", "executed_at", "idempotent"},
        {"error", "code", "message", "details", "request_id"},
    ), body
    return body


# Helper: post execution using sessions fixture CSRF-aware client
def _post_execution(sessions, agreement_id: str, headers: dict | None = None) -> any:
    """POST /agreements/{id}/execution with the current session's CSRF header attached."""
    from api.tests.helpers import post_agreement
    merged = dict(sessions.csrf_headers)
    merged.update(headers or {})
    return sessions.client.post(f"/api/v1/agreements/{agreement_id}/execution", headers=merged)


def test_execution_requires_authentication(client):
    """Unauthenticated execution attempt returns 401."""
    response = client.post("/api/v1/agreements/nonexistent/execution")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_execution_nonexistent_agreement_404(sessions, client):
    """Execution of a non-existent agreement returns 404."""
    sessions.login("owner@legalx.demo")
    response = _post_execution(sessions, "00000000-0000-4000-8000-000000000000")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_execution_cross_workspace_404(sessions, client):
    """Execution of an agreement from a different workspace returns 404."""
    from api.tests.helpers import valid_payload, post_agreement

    sessions.login("owner@legalx.demo")
    agreement = post_agreement(sessions, valid_payload(title="Acme project"))
    agreement_id = agreement.json()["id"]

    # Switch to outsider workspace
    sessions.login("outsider@lexora.demo")
    response = _post_execution(sessions, agreement_id)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_execution_blocks_non_draft(sessions, client):
    """Execution of a non-draft agreement is blocked."""
    from api.tests.helpers import valid_payload, post_agreement

    sessions.login("owner@legalx.demo")
    agreement = post_agreement(sessions, valid_payload(title="Test project"))
    agreement_id = agreement.json()["id"]

    # Mark agreement as active (simulate it's past draft)
    _ = client.patch(
        f"/api/v1/agreements/{agreement_id}",
        json={"status": "active"},
    )

    response = _post_execution(sessions, agreement_id)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_execution_without_approvals_blocks(sessions, client, db):
    """Execution without required approvals on the current version is blocked."""
    from api.tests.helpers import valid_payload, post_agreement

    sessions.login("owner@legalx.demo")
    agreement = post_agreement(sessions, valid_payload(title="No approval project"))
    agreement_id = agreement.json()["id"]

    response = _post_execution(sessions, agreement_id)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def _add_client_approval(db, agreement_id):
    """Add a client approval for the agreement's current version."""
    from api.app.models.agreements import AgreementVersion
    from api.app.models.auth import User

    version = db.scalar(
        select(AgreementVersion).where(AgreementVersion.agreement_id == agreement_id)
    )
    if not version:
        return

    # The seeded owner's real id (uuid5) — a hardcoded placeholder would
    # violate the users FK.
    owner = db.scalar(select(User).where(User.email == "owner@legalx.demo"))

    approval = VersionApproval(
        id=str(uuid.uuid4()),
        version_id=version.id,
        party_role="client",
        actor_user_id=owner.id if owner else None,
        actor_name="Test Client",
        # Must confirm the exact current hash — the gate rejects stale
        # approvals (contract: HASH_MISMATCH / stale SHA-256 rule).
        confirmed_sha256=version.sha256,
        approved_at=utcnow(),
    )
    db.add(approval)
    db.commit()


def test_execution_idempotent_replay(sessions, client, db):
    """Execution with the same Idempotency-Key returns the prior result."""
    from api.tests.helpers import valid_payload, post_agreement

    sessions.login("owner@legalx.demo")
    # Use client_only approval policy so execution can succeed with just a client approval
    agreement = post_agreement(sessions, valid_payload(title="Idempotent project", approval_policy="client_only"))
    agreement_id = agreement.json()["id"]

    # Add a client approval on the current version so execution can proceed
    _add_client_approval(db, agreement_id)

    # First execution
    key = str(uuid.uuid4())
    headers = {"Idempotency-Key": key}
    response1 = _post_execution(sessions, agreement_id, headers=headers)
    assert response1.status_code == 200

    # Second execution with same key
    response2 = _post_execution(sessions, agreement_id, headers=headers)
    assert response2.status_code == 200
    # Should be idempotent replay — the agreement is NOT executed twice.
    body2 = response2.json()
    assert body2.get("status") == "idempotent_replay" or body2.get("idempotent") is True

    # A fresh repeated request (different key) cannot execute the agreement
    # twice: it is now active, so execution is blocked.
    fresh_headers = {"Idempotency-Key": str(uuid.uuid4())}
    response3 = _post_execution(sessions, agreement_id, headers=fresh_headers)
    assert response3.status_code == 403
    assert response3.json()["error"]["code"] == "FORBIDDEN"


def test_execution_idempotent_window_expires(sessions, client, db):
    """Execution idempotency key becomes reusable after the 24h window.

    Once the window elapses, the same key is NOT replayed; a fresh execution
    attempt is made instead (contract §1.4).
    """
    from api.tests.helpers import valid_payload, post_agreement

    sessions.login("owner@legalx.demo")
    # Use client_only approval policy so execution can succeed
    agreement = post_agreement(sessions, valid_payload(title="Window expiry project", approval_policy="client_only"))
    agreement_id = agreement.json()["id"]

    # Add a client approval on the current version so execution can proceed
    _add_client_approval(db, agreement_id)

    key = str(uuid.uuid4())
    headers = {"Idempotency-Key": key}

    # First execution
    response1 = _post_execution(sessions, agreement_id, headers=headers)
    assert response1.status_code == 200
    assert response1.json().get("idempotent") is False

    # Locate the stored idempotency record and backdate it so its 24h window
    # has elapsed (just past the boundary).
    row = db.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.key == key,
            IdempotencyKey.endpoint == "POST /agreements/{agreement_id}/execution",
        )
    )
    assert row is not None
    row.created_at = utcnow() - timedelta(seconds=86401)
    db.commit()

    # Reset the agreement to draft so the fresh (post-expiry) execution can
    # genuinely proceed instead of being rejected on the state gate.
    db.execute(
        update(Agreement)
        .where(Agreement.id == agreement_id)
        .values(status="draft", updated_at=utcnow())
    )
    db.commit()

    # Second execution with the same (now expired) key: a fresh execution,
    # not an idempotent replay.
    sessions.login("owner@legalx.demo")
    response2 = _post_execution(sessions, agreement_id, headers=headers)
    assert response2.status_code == 200
    body2 = response2.json()
    assert body2.get("idempotent") is False
    assert body2.get("status") == "executed"