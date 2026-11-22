"""H-03: malformed Idempotency-Key headers produce a clean 4xx, never a 500.

The header is persisted into ``IdempotencyKey.key`` (String(128)). Without
validation an oversized or whitespace-only value either leaks through to the
database or reaches an unhandled error on strict backends. Validation happens
before the execution gate, so these requests cannot execute an agreement.
"""

from __future__ import annotations

import uuid

from api.app.ratelimit import limiter


def _create_agreement(sessions) -> str:
    from api.tests.helpers import post_agreement, valid_payload

    response = post_agreement(
        sessions,
        valid_payload(title="Idempotency validation project", approval_policy="client_only"),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _post_execution(sessions, agreement_id: str, key: str | None):
    headers = dict(sessions.csrf_headers)
    if key is not None:
        headers["Idempotency-Key"] = key
    return sessions.client.post(
        f"/api/v1/agreements/{agreement_id}/execution", headers=headers
    )


def test_blank_idempotency_key_returns_4xx(sessions):
    limiter.reset()
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = _post_execution(sessions, agreement_id, "   ")
    assert 400 <= response.status_code < 500, response.text
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_oversized_idempotency_key_returns_4xx(sessions):
    limiter.reset()
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = _post_execution(sessions, agreement_id, "x" * 500)
    assert 400 <= response.status_code < 500, response.text
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_valid_idempotency_key_still_reaches_execution_gate(sessions):
    limiter.reset()
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = _post_execution(sessions, agreement_id, str(uuid.uuid4()))
    # client_only with no approval: the unchanged approval gate rejects it.
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_absent_idempotency_key_is_still_allowed(sessions):
    limiter.reset()
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = _post_execution(sessions, agreement_id, None)
    assert response.status_code == 403, response.text
