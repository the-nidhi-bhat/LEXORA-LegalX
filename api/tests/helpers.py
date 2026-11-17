"""Shared payload builders for the agreement test suite."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def future_date(days: int = 30) -> str:
    """A date `days` ahead in UTC — always valid for the 'not in the past' rule."""
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def past_date(days: int = 30) -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=days)).isoformat()


def valid_payload(**overrides) -> dict:
    """A contract-shaped payload that creates cleanly (sum 5,000,000 = total)."""
    base = {
        "title": "Website project",
        "agreement_type": "service_agreement",
        "currency": "INR",
        "total_amount_minor": 5000000,
        "approval_policy": "all_parties",
        "parties": [
            {"role": "client", "name": "Priya Nair", "email": "owner@legalx.demo"},
            {"role": "provider", "name": "Rahul Mehta", "email": "freelancer@legalx.demo"},
        ],
        "milestones": [
            {
                "seq": 1,
                "name": "Design sign-off",
                "amount_minor": 2000000,
                "due_date": future_date(10),
                "acceptance_criteria": "Figma file approved",
            },
            {
                "seq": 2,
                "name": "Build complete",
                "amount_minor": 3000000,
                "due_date": future_date(25),
                "acceptance_criteria": "Staging URL signed off",
            },
        ],
        "review_period_days": 5,
        "review_period_basis": "business",
    }
    base.update(overrides)
    return base


def post_agreement(sessions, payload: dict, headers: dict | None = None):
    """POST /agreements with the current session's CSRF header attached."""
    merged = dict(sessions.csrf_headers)
    merged.update(headers or {})
    return sessions.client.post("/api/v1/agreements", json=payload, headers=merged)
