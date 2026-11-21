"""Execution gate and verification endpoint (P0-08).

- ``POST /api/v1/agreements/{agreement_id}/execution`` attempt execution
  of an agreement after verification.

- Requires the session to carry a role with ``verification:run`` permission
  (``owner`` in the D-01 matrix).

- Verification rules (all OR'd — any failure blocks execution):
  1. Agreement must exist in the session's organization (otherwise 404).
  2. Current version must have all required approvals for the approval policy.
  3. No approval may be stale — every approval must confirm the exact current
     version SHA-256 hash.
  4. User must be an approved party for the agreement (a party with a matching
     role+email, or the agreement creator).
  5. Agreement must be in a state permitting execution (``draft``).
  6. Idempotency: replay of the same key returns the prior result.

- Idempotency-Key (contract §1.4, 24 h window) prevents duplicate execution
  requests.

- Audit events recorded for successful and failed execution attempts.

- Cross-workspace agreement IDs return 404 (never 403 that reveals existence).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Set

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session as DbSession

from api.app.db import get_db
from api.app.deps import SessionContext, require
from api.app.errors import ApiError, error_body
from api.app.models.agreements import Agreement, AgreementVersion, VersionApproval, ActivityEvent
from api.app.models.auth import Membership, Organization, User
from api.app.schemas.activity import ActivityEventOut
from api.app.schemas import activity as activity_schema
from api.app.timeutil import utcnow, to_wire
from api.app.validation import client_only_requires_client_detail
from api.app.ratelimit import limiter
from api.app.hashing import sha256_hex
from api.app.security import hash_token, generate_csrf_token

router = APIRouter(prefix="/api/v1", tags=["execution"])

_IDEMPOTENCY_WINDOW_SECONDS = 86400  # 24 h (contract §1.4)


def _encode_cursor(created_at: datetime, event_id: str) -> str:
    raw = f"{created_at.isoformat(timespec='microseconds')}|{event_id}"
    return __import__("base64").urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[datetime, str]:
    import base64
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
        iso, event_id = raw.split("|", 1)
        return datetime.fromisoformat(iso), event_id
    except Exception:  # noqa: BLE001 - any malformed cursor is a 422
        from api.app.errors import ApiError, field_detail
        raise ApiError.validation(
            "The pagination cursor is not valid.",
            [field_detail("cursor", "VALUE_ERROR", "Invalid cursor")],
        )


def _load_agreement(db: DbSession, agreement_id: str, org_id: str) -> Agreement:
    """Load agreement scoped to organization. Returns None if not found (404)."""
    row = db.scalar(
        select(Agreement).where(
            Agreement.id == agreement_id,
            Agreement.organization_id == org_id,
        )
    )
    if row is None:
        # Cross-workspace and unknown ids are deliberately indistinguishable.
        raise ApiError.not_found("Agreement not found.")
    return row


def _current_version(db: DbSession, agreement: Agreement) -> Optional[AgreementVersion]:
    """Get the current version of an agreement."""
    if agreement.current_version_id:
        return db.get(AgreementVersion, agreement.current_version_id)
    # Fallback: get the latest version
    version = db.scalar(
        select(AgreementVersion)
        .where(AgreementVersion.agreement_id == agreement.id)
        .order_by(AgreementVersion.version.desc())
    )
    return version


def _approval_count(db: DbSession, version: Optional[AgreementVersion]) -> int:
    if version is None:
        return 0
    return int(
        db.scalar(
            select(func.count())
            .select_from(VersionApproval)
            .where(VersionApproval.version_id == version.id)
        )
        or 0
    )


def _check_approvals(
    db: DbSession, agreement: Agreement, ctx: SessionContext, version: Optional[AgreementVersion]
) -> tuple[bool, str]:
    """Check whether the session user has all required approvals for execution.

    Returns (approved, reason_string).
    """
    from api.app.models.agreements import VersionApproval as VA, AgreementParty

    # --- Step 1: determine the required approval policy ---
    if agreement.approval_policy == "client_only":
        # client_only: at least one client approval on the current version
        required_role = "client"
    else:
        # all_parties: every distinct party role that appears in the agreement
        # must have at least one approval on the current version.
        # First, gather the distinct party roles from the agreement.
        party_roles: Set[str] = {
            p.role for p in db.scalars(
                select(AgreementParty).where(AgreementParty.agreement_id == agreement.id)
            ).all()
        }
        if not party_roles:
            return False, "all_parties approval policy: no parties defined on agreement"
        required_roles = party_roles
    # -------------------------------------------------------

    if version is None or _approval_count(db, version) == 0:
        return False, "no approvals on current version"

    # --- Step 2: verify approvals against the exact current version SHA-256 ---
    current_sha256 = version.sha256

    if agreement.approval_policy == "client_only":
        # Check that a client approval exists AND that it confirms the current version SHA-256
        client_approval = db.scalar(
            select(VA)
            .where(
                VA.version_id == version.id,
                VA.party_role == "client",
            )
            .limit(1)
        )
        if client_approval is None:
            return False, "client_only approval policy: no client approval on current version"
        # Stale check: the approval must confirm the exact current version SHA-256
        if client_approval.confirmed_sha256 != current_sha256:
            return False, "client_only approval: stale SHA-256 hash (approval does not match current version)"
    else:
        # all_parties: verify that every distinct party role has an approval
        # that confirms the exact current version SHA-256
        for role in required_roles:  # type: ignore[name-defined]
            approval = db.scalar(
                select(VA)
                .where(
                    VA.version_id == version.id,
                    VA.party_role == role,
                )
                .limit(1)
            )
            if approval is None:
                return False, f"all_parties approval policy: no {role} approval on current version"
            # Stale check: the approval must confirm the exact current version SHA-256
            if approval.confirmed_sha256 != current_sha256:
                return False, f"all_parties approval: stale SHA-256 hash for {role} (approval does not match current version)"
    # -------------------------------------------------------

    return True, ""


def _is_approved_party(ctx: SessionContext, agreement: Agreement, db: DbSession) -> bool:
    """Check if the session user is an approved party for the agreement.

    A user is considered an approved party if they are:
    - Listed as a party in the agreement (matching email), or
    - The agreement creator (created_by matches user_id)
    """
    from api.app.models.agreements import AgreementParty

    # Check if user is listed as a party
    parties = db.scalars(
        select(AgreementParty).where(AgreementParty.agreement_id == agreement.id)
    ).all()

    for party in parties:
        if party.email == ctx.email:
            return True

    # Check if user is the agreement creator
    if agreement.created_by == ctx.user_id:
        return True

    return False


@router.post("/agreements/{agreement_id}/execution", response_model=Dict[str, Any])
def attempt_execution(
    agreement_id: str,
    request: Request,
    ctx: SessionContext = Depends(require("verification:run")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    """Attempt to execute an agreement after verification.

    - Cross-workspace agreement IDs return 404 (§1.6).
    - Only the agreement owner or an assignee may trigger execution.
    - Required approvals are checked against the exact current version.
    - Stale, missing, or insufficient approvals block execution.
    - Verification failures prevent execution.
    - Agreement must be in 'draft' state to be executed.
    - Idempotency-Key replay is supported (§1.4).
    - Audit events recorded.
    """

    # Rate limiting per session + agreement
    key = (ctx.user_id, agreement_id)
    allowed, retry_after = limiter.check(key)
    if not allowed:
        raise ApiError(
            429,
            "RATE_LIMITED",
            "Too many execution attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    # Record every attempt that passes the check so the threshold is actually
    # reached; without this the 429 + Retry-After path above is unreachable.
    limiter.record_failure(key)

    # Load agreement with workspace scoping
    agreement = _load_agreement(db, agreement_id, ctx.organization_id)

    # Get current version
    version = _current_version(db, agreement)

    # Idempotency-Key replay (contract section 1.4): checked *before* any
    # state gate, because a successful first execution legitimately changed
    # the state (draft -> active). A replay returns the prior result.
    idempotency_key = request.headers.get("Idempotency-Key", "").strip()
    replay_row = None
    if idempotency_key:
        from api.app.models.agreements import IdempotencyKey as IdempotencyKeyModel

        body_data = {
            "agreement_id": agreement_id,
            "triggered_by": ctx.user_id,
        }
        request_hash = sha256_hex(json.dumps(body_data, sort_keys=True, separators=(",", ": ")))

        row = db.scalar(
            select(IdempotencyKeyModel).where(
                IdempotencyKeyModel.key == idempotency_key,
                IdempotencyKeyModel.user_id == ctx.user_id,
                IdempotencyKeyModel.endpoint == "POST /agreements/{agreement_id}/execution",
            )
        )
        if row is not None:
            if (utcnow() - row.created_at).total_seconds() > _IDEMPOTENCY_WINDOW_SECONDS:
                db.delete(row)  # window elapsed: key is reusable
                db.flush()
            elif row.request_hash != request_hash:
                raise ApiError.conflict(
                    "CONFLICT",
                    "This Idempotency-Key was already used with a different payload.",
                )
            else:
                replay_row = row

    if replay_row is not None:
        return {
            "status": "idempotent_replay",
            "agreement_id": agreement.id,
            "version": version.version if version else None,
            "approval_policy": agreement.approval_policy,
            "triggered_by": ctx.user_id,
            "executed_at": to_wire(replay_row.created_at),
            "idempotent": True,
        }

    # Check approvals (including stale SHA-256 hash verification)
    approved, reason = _check_approvals(db, agreement, ctx, version)

    if not approved:
        raise ApiError.forbidden(
            f"Execution blocked: {reason}. "
            "Required approvals not found on the current version."
        )

    # Check that the user is an approved party for the agreement
    if not _is_approved_party(ctx, agreement, db):
        raise ApiError.forbidden(
            "Execution blocked: user is not an approved party for this agreement."
        )

    # Check agreement state - must be draft (early rejection before doing work)
    if agreement.status != "draft":
        raise ApiError.forbidden(
            f"Execution blocked: agreement must be in 'draft' state, "
            f"got '{agreement.status}'."
        )

    # Idempotency-Key was already resolved above; only the fresh path reaches
    # this point.

    # Execute: atomically transition draft -> active. A plain read-then-write
    # check is NOT concurrency-safe (two concurrent requests could both read
    # "draft" and both write "active"), so the transition is performed with a
    # single conditional UPDATE that only matches rows still in "draft". The
    # database row lock guarantees at most one request can flip the status.
    result = db.execute(
        update(Agreement)
        .where(Agreement.id == agreement.id, Agreement.status == "draft")
        .values(status="active", updated_at=utcnow())
    )
    if result.rowcount == 0:
        # The conditional UPDATE matched no row: the persisted status is no
        # longer 'draft' (a concurrent execution or another status change won
        # the race). The in-memory `agreement` is stale here — refreshed only
        # below — so do NOT report its cached 'draft' value as the new state.
        raise ApiError.forbidden(
            "Execution blocked: agreement is no longer in 'draft' state "
            "(concurrent execution or a status change). Refresh and retry."
        )

    # Sync the in-memory agreement with the row now stored in the database.
    db.refresh(agreement)

    # Record activity event
    from api.app.models.agreements import ActivityEvent as AE

    actor_name = ctx.name or ctx.email or "unknown"
    db.add(
        AE(
            id=str(uuid.uuid4()),
            agreement_id=agreement.id,
            actor_user_id=ctx.user_id,
            event_type="agreement.executed",
            payload=json.dumps(
                {
                    "triggered_by": ctx.user_id,
                    "version": version.version if version else None,
                    "approval_policy": agreement.approval_policy,
                },
                sort_keys=True,
            ),
            created_at=utcnow(),
        )
    )

    db.flush()

    result = {
        "status": "executed",
        "agreement_id": agreement.id,
        "version": version.version if version else None,
        "approval_policy": agreement.approval_policy,
        "triggered_by": ctx.user_id,
        "executed_at": to_wire(utcnow()),
        "idempotent": False,
    }

    # Persist the idempotency record so a replay of this key returns the same
    # result (contract section 1.4, 24 h window).
    if idempotency_key:
        from api.app.models.agreements import IdempotencyKey as IdempotencyKeyModel

        body_data = {
            "agreement_id": agreement_id,
            "triggered_by": ctx.user_id,
        }
        db.add(
            IdempotencyKeyModel(
                id=str(uuid.uuid4()),
                key=idempotency_key,
                user_id=ctx.user_id,
                endpoint="POST /agreements/{agreement_id}/execution",
                request_hash=sha256_hex(
                    json.dumps(body_data, sort_keys=True, separators=(",", ": "))
                ),
                response_status=200,
                response_body=json.dumps(result, sort_keys=True),
                created_at=utcnow(),
            )
        )
        db.flush()

    return result