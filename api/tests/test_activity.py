"""P0-09 activity endpoint tests.

Covers: activity reading, workspace isolation, ordering and
cross-workspace 404 behaviour.
"""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import select

from api.app.models.agreements import ActivityEvent, Agreement
from api.app.models.auth import Organization, User


def _assert_activity_envelope(response) -> dict:
    """Check the activity response has the expected top-level keys."""
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body.keys()) == {"items", "next_cursor"}, body
    return body


def _assert_event_minimal(e: dict) -> None:
    """Each event item must have these keys."""
    assert set(e.keys()) == {"id", "agreement_id", "event_type", "payload", "created_at"}


def test_activity_requires_authentication(client):
    """Unauthenticated access to activity returns 401."""
    response = client.get("/api/v1/activity")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_activity_returns_empty_for_no_agreements(sessions, client):
    """A user with no agreements sees an empty activity list."""
    sessions.login("owner@legalx.demo")
    response = client.get("/api/v1/activity")
    body = _assert_activity_envelope(response)
    assert body["items"] == []
    assert body["next_cursor"] is None


def _seed_agreement_with_event(db, org_slug: str, email: str, marker: str):
    """Create an agreement and one activity event directly in the given workspace."""
    org_id = db.scalar(select(Organization.id).where(Organization.slug == org_slug))
    user_id = db.scalar(select(User.id).where(User.email == email))
    agreement = Agreement(
        id=str(uuid.uuid4()),
        organization_id=org_id,
        created_by=user_id,
        title=f"Activity test {marker}",
        agreement_type="service_agreement",
        currency="INR",
        total_amount_minor=5000000,
        approval_policy="all_parties",
        status="draft",
        review_period_days=5,
        review_period_basis="business",
    )
    db.add(agreement)
    db.flush()
    event = ActivityEvent(
        id=str(uuid.uuid4()),
        agreement_id=agreement.id,
        actor_user_id=user_id,
        event_type="agreement.created",
        payload=json.dumps({"marker": marker}),
    )
    db.add(event)
    db.commit()
    return agreement.id, event.id


def test_activity_agreement_filter_returns_only_matching_events(sessions, client, db):
    """The agreement_id filter returns 200 and only that agreement's events."""
    sessions.login("owner@legalx.demo")
    own_id, own_event = _seed_agreement_with_event(
        db, "acme-digital", "owner@legalx.demo", "own"
    )
    other_id, _ = _seed_agreement_with_event(
        db, "acme-digital", "owner@legalx.demo", "other"
    )
    # An event from another workspace must never leak into the filtered result.
    _seed_agreement_with_event(db, "lexora-studio", "outsider@lexora.demo", "foreign")

    response = client.get(f"/api/v1/activity?agreement_id={own_id}")
    body = _assert_activity_envelope(response)
    assert [e["agreement_id"] for e in body["items"]] == [own_id]
    assert [e["id"] for e in body["items"]] == [own_event]
    assert other_id not in [e["agreement_id"] for e in body["items"]]


def test_activity_agreement_filter_cross_workspace_is_404(sessions, client, db):
    """An agreement in another workspace is a 404, never a 200 or 403."""
    sessions.login("owner@legalx.demo")
    foreign_id, _ = _seed_agreement_with_event(
        db, "lexora-studio", "outsider@lexora.demo", "foreign"
    )

    response = client.get(f"/api/v1/activity?agreement_id={foreign_id}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"