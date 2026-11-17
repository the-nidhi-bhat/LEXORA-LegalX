"""P0-09 activity endpoint tests.

Covers: activity reading, workspace isolation, ordering and
cross-workspace 404 behaviour.
"""

from __future__ import annotations

import json

import pytest

from api.app.models.agreements import ActivityEvent


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