"""R1.2/R1.3 — execution rate-limit reachability + truthful race message.

Uses real app/TestClient behavior against the shared ``api.app.ratelimit``
limiter (no mocks). Attempts are recorded so the 429 + Retry-After path becomes
reachable, and the conditional-UPDATE race branch reports the true persisted
condition instead of a stale cached 'draft' state.
"""

from __future__ import annotations

import inspect
import uuid

from sqlalchemy import event, select

from api.app.config import get_settings
from api.app.routers import execution as execution_router
from api.app.timeutil import utcnow


def _create_agreement(sessions) -> str:
    from api.tests.helpers import post_agreement, valid_payload

    # client_only + no approvals: attempts pass the limiter but are blocked on
    # the approval gate (403), which is the repeated-attempt scenario under test.
    response = post_agreement(
        sessions, valid_payload(title="Rate-limit execution project", approval_policy="client_only")
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _post_execution(sessions, agreement_id: str, headers: dict | None = None):
    merged = dict(sessions.csrf_headers)
    merged.update(headers or {})
    return sessions.client.post(f"/api/v1/agreements/{agreement_id}/execution", headers=merged)


def test_execution_module_records_attempts():
    """Guard: execution.py must call limiter.record_failure (R1.2)."""
    assert "record_failure" in inspect.getsource(execution_router)


def test_repeated_execution_attempts_reach_429_with_retry_after(sessions):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)
    threshold = get_settings().login_rate_limit_attempts

    # Each attempt crosses the limiter check and is recorded; the approval gate
    # then rejects it with 403. After `threshold` recorded attempts the next
    # check denies with 429 + Retry-After.
    for _ in range(threshold):
        response = _post_execution(sessions, agreement_id)
        assert response.status_code == 403, response.text
        assert response.json()["error"]["code"] == "FORBIDDEN"

    blocked = _post_execution(sessions, agreement_id)
    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    assert blocked.headers.get("Retry-After")


def test_concurrent_status_change_message_is_truthful(sessions, db, engine):
    """R1.3: the rowcount==0 branch must not report a stale 'draft' state.

    A real conditional UPDATE is intercepted with a before_cursor_execute
    listener that flips the persisted row to 'active' immediately beforehand,
    so the handler's own UPDATE matches zero rows and enters the race branch.
    This arranges genuine DB state; it does not mock the branch under test.
    """
    from api.app.models.agreements import AgreementVersion, VersionApproval
    from api.app.models.auth import User

    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    version = db.scalar(
        select(AgreementVersion).where(AgreementVersion.agreement_id == agreement_id)
    )
    owner = db.scalar(select(User).where(User.email == "owner@legalx.demo"))
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
    db.commit()

    flipped = {"done": False}

    def _flip_before_conditional_update(conn, cursor, statement, parameters, context, executemany):
        if flipped["done"]:
            return
        if "UPDATE agreements SET status" in statement:
            flipped["done"] = True
            conn.exec_driver_sql(
                "UPDATE agreements SET status='active' WHERE id = ?", (agreement_id,)
            )

    event.listen(engine, "before_cursor_execute", _flip_before_conditional_update)
    try:
        response = _post_execution(
            sessions, agreement_id, headers={"Idempotency-Key": str(uuid.uuid4())}
        )
    finally:
        event.remove(engine, "before_cursor_execute", _flip_before_conditional_update)

    assert flipped["done"], "conditional UPDATE was never intercepted"
    assert response.status_code == 403, response.text
    error = response.json()["error"]
    assert error["code"] == "FORBIDDEN"
    message = error["message"]
    assert "no longer in 'draft'" in message
    assert "changed to 'draft' concurrently" not in message
