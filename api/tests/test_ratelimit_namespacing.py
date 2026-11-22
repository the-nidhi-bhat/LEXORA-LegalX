"""H-01: parity and execution rate-limit keys must use distinct namespaces.

Both endpoints share the single in-memory ``limiter``. An identical
``(user, agreement)`` tuple would let verification traffic consume the bucket
that guards execution (and vice versa), producing a spurious 429 on the other
endpoint. These tests exercise the real routers and the real limiter.
"""

from __future__ import annotations

import inspect

from api.app.config import get_settings
from api.app.ratelimit import limiter
from api.app.routers import execution as execution_router
from api.app.routers import parity as parity_router

EP_MATCH = {"execution_parameters": {"dispute_behavior": "mediate", "governing_law": "India"}}


def _create_agreement(sessions) -> str:
    from api.tests.helpers import post_agreement, valid_payload

    response = post_agreement(
        sessions,
        valid_payload(
            title="Namespaced rate-limit project",
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


def _post_execution(sessions, agreement_id: str):
    return sessions.client.post(
        f"/api/v1/agreements/{agreement_id}/execution",
        headers=dict(sessions.csrf_headers),
    )


def test_router_keys_are_namespaced():
    """The two endpoints must build different tuples for the same identity."""
    assert 'key = (f"parity:{ctx.user_id}", agreement_id)' in inspect.getsource(
        parity_router.verify_version
    )
    assert 'key = (f"execution:{ctx.user_id}", agreement_id)' in inspect.getsource(
        execution_router.attempt_execution
    )


def test_failure_on_parity_key_does_not_block_execution_key():
    limiter.reset()
    try:
        user, agreement_id = "user-1", "agreement-1"
        parity_key = (f"parity:{user}", agreement_id)
        execution_key = (f"execution:{user}", agreement_id)
        assert parity_key != execution_key

        for _ in range(get_settings().login_rate_limit_attempts):
            limiter.record_failure(parity_key)

        assert limiter.check(parity_key)[0] is False
        assert limiter.check(execution_key)[0] is True
    finally:
        limiter.reset()


def test_parity_traffic_does_not_rate_limit_execution(sessions):
    limiter.reset()
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)
    threshold = get_settings().login_rate_limit_attempts

    for _ in range(threshold):
        response = _post_verify(sessions, agreement_id)
        assert response.status_code == 200, response.text

    # The execution gate still applies its own approval rules (403), but the
    # shared limiter must not have been exhausted by verification traffic.
    execution = _post_execution(sessions, agreement_id)
    assert execution.status_code == 403, execution.text
    assert execution.json()["error"]["code"] == "FORBIDDEN"


def test_execution_traffic_does_not_rate_limit_parity(sessions):
    limiter.reset()
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)
    threshold = get_settings().login_rate_limit_attempts

    for _ in range(threshold):
        response = _post_execution(sessions, agreement_id)
        assert response.status_code == 403, response.text
        assert response.json()["error"]["code"] == "FORBIDDEN"

    verify = _post_verify(sessions, agreement_id)
    assert verify.status_code == 200, verify.text
