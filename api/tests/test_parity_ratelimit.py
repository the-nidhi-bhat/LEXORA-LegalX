"""R1.1 — rate limiting on POST /verify (OMEGA FRS).

Uses the real app/TestClient and the shared ``api.app.ratelimit`` limiter. A
legitimate single call still returns the unchanged 200 result envelope; once
the configured threshold is crossed the handler returns 429 + Retry-After and
appends no further verification rows.
"""

from __future__ import annotations

from sqlalchemy import func, select

from api.app.config import get_settings
from api.app.models.verification import VerificationRun

EP_MATCH = {"execution_parameters": {"dispute_behavior": "mediate", "governing_law": "India"}}


def _create_agreement(sessions) -> str:
    from api.tests.helpers import post_agreement, valid_payload

    response = post_agreement(
        sessions,
        valid_payload(
            title="Rate-limit parity project",
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


def _verify_row_count(db) -> int:
    return int(db.scalar(select(func.count()).select_from(VerificationRun)) or 0)


def test_verify_single_call_succeeds_with_unchanged_envelope(sessions, db):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = _post_verify(sessions, agreement_id)
    assert response.status_code == 200, response.text
    body = response.json()
    # Response/status contract is unchanged by rate limiting.
    assert set(body) == {
        "result", "verification_run_id", "approvals_complete", "passed", "stale"
    }
    assert body["result"]["overall_status"] == "match"
    assert body["result"]["is_blocked"] is False
    assert _verify_row_count(db) == 1


def test_verify_exceeding_threshold_is_429_with_retry_after(sessions, db):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)
    threshold = get_settings().login_rate_limit_attempts

    for _ in range(threshold):
        response = _post_verify(sessions, agreement_id)
        assert response.status_code == 200, response.text

    rows_at_threshold = _verify_row_count(db)
    assert rows_at_threshold == threshold

    blocked = _post_verify(sessions, agreement_id)
    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    assert blocked.headers.get("Retry-After")
    # The 429 is emitted before any engine work: no extra rows were appended.
    assert _verify_row_count(db) == rows_at_threshold
