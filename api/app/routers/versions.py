"""Version and approval endpoints (P0-05) — API_CONTRACTS.md §5.

Routes
------
``GET  /api/v1/agreements/{id}/versions``               list (agreement:view)
``POST /api/v1/agreements/{id}/versions``               create next draft (agreement:edit, Idempotency-Key)
``POST /api/v1/agreements/{id}/versions/{v}/approve``   approve (agreement:approve AND required party)

Contract rules enforced here (§5.1/§5.2):
- version numbers are monotonic per agreement, never reused or renumbered;
- text is immutable after creation — stored byte-for-byte, SHA-256 computed
  over the canonical form (hashing.py, EXECUTION_PLAN §7);
- approval requires ``confirm_sha256 == version.sha256`` else 422
  ``HASH_MISMATCH`` (a rendered hash can only ever be a confirmation of a
  server-issued hash — §1.4);
- one approval row per (version, party role) — duplicate → 409
  ``ALREADY_APPROVED`` (D-06, also UNIQUE at the DB level);
- the caller must hold ``agreement:approve`` **and** be a required party for
  the agreement's approval policy, else 403;
- ``is_fully_approved`` is computed from rows on every response (D-06),
  never stored as one boolean standing in for multiple parties.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from api.app.approvals import approvals_for_version, compute_approval_state
from api.app.db import get_db
from api.app.deps import SessionContext, require
from api.app.errors import ApiError, field_detail
from api.app.hashing import canonical_sha256, is_sha256, sha256_hex
from api.app.models.agreements import (
    Agreement,
    AgreementParty,
    AgreementVersion,
    Milestone,
    VersionApproval,
)
from api.app.routers.agreements import (
    _current_version,
    _idempotency_key,
    _idempotent_replay,
    _load_agreement,
    _record_event,
    _store_idempotent,
)
from api.app.schemas.version import ApproveRequest, CreateVersionRequest
from api.app.timeutil import to_wire, utcnow

router = APIRouter(prefix="/api/v1", tags=["versions"])


# ---------------------------------------------------------------------------
# Response builders
# ---------------------------------------------------------------------------


def _approval_dicts(rows: List[VersionApproval]) -> List[Dict[str, Any]]:
    return [
        {
            "party_role": row.party_role,
            "actor_name": row.actor_name,
            "approved_at": to_wire(row.approved_at),
            "confirmed_sha256": row.confirmed_sha256,
        }
        for row in rows
    ]


def _version_body(
    db: DbSession,
    agreement: Agreement,
    version: AgreementVersion,
) -> Dict[str, Any]:
    required, _approved, fully = compute_approval_state(db, agreement, version)
    return {
        "version_id": version.id,
        "version": version.version,
        "status": version.status,
        "sha256": version.sha256,
        "hash_algorithm": "sha256",
        "canonical_length": version.canonical_length,
        "created_at": to_wire(version.created_at),
        "created_by": version.created_by,
        "is_fully_approved": fully,
        "required_approvals": required,
        "approvals": _approval_dicts(approvals_for_version(db, version.id)),
    }


def _load_version(
    db: DbSession, agreement: Agreement, version_number: int
) -> AgreementVersion:
    version = db.scalar(
        select(AgreementVersion).where(
            AgreementVersion.agreement_id == agreement.id,
            AgreementVersion.version == version_number,
        )
    )
    if version is None:
        raise ApiError.not_found("Version not found.")
    return version


def _required_party_check(
    db: DbSession,
    agreement: Agreement,
    ctx: SessionContext,
    required: List[str],
) -> AgreementParty:
    """The caller must be a *required* party (contract §5.2, row 11 of §2)."""
    parties = db.scalars(
        select(AgreementParty).where(AgreementParty.agreement_id == agreement.id)
    ).all()
    for party in parties:
        if party.email == ctx.email and party.role in required:
            return party
    raise ApiError(
        403,
        "FORBIDDEN",
        "Caller is not a required party for this agreement's approval policy.",
        [field_detail("confirm_sha256", "FORBIDDEN", "caller is not a required party")],
    )


# ---------------------------------------------------------------------------
# GET /agreements/{id}/versions
# ---------------------------------------------------------------------------


@router.get("/agreements/{agreement_id}/versions")
def list_versions(
    agreement_id: str,
    ctx: SessionContext = Depends(require("agreement:view")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    agreement = _load_agreement(db, agreement_id, ctx)
    versions = db.scalars(
        select(AgreementVersion)
        .where(AgreementVersion.agreement_id == agreement.id)
        .order_by(AgreementVersion.version.desc())
    ).all()

    items: List[Dict[str, Any]] = []
    for version in versions:
        required, _approved, fully = compute_approval_state(db, agreement, version)
        items.append(
            {
                "version": version.version,
                "status": version.status,
                "sha256": version.sha256,
                "created_at": to_wire(version.created_at),
                "created_by": version.created_by,
                "is_fully_approved": fully,
                "approvals": _approval_dicts(approvals_for_version(db, version.id)),
            }
        )
    # ``required_approvals`` is intentionally not part of the §5.3 item shape.
    return {"items": items}


# ---------------------------------------------------------------------------
# POST /agreements/{id}/versions
# ---------------------------------------------------------------------------


@router.post("/agreements/{agreement_id}/versions", status_code=201)
def create_version(
    agreement_id: str,
    payload: CreateVersionRequest,
    request: Request,
    ctx: SessionContext = Depends(require("agreement:edit")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    agreement = _load_agreement(db, agreement_id, ctx)

    data = payload.model_dump()
    request_hash = sha256_hex(
        json.dumps(
            {"agreement_id": agreement.id, **data}, sort_keys=True, separators=(",", ":")
        )
    )
    key = _idempotency_key(request)
    replay = _idempotent_replay(db, ctx, key, "POST /agreements/{id}/versions", request_hash)
    if replay is not None:
        return replay

    latest = db.scalar(
        select(func.max(AgreementVersion.version)).where(
            AgreementVersion.agreement_id == agreement.id
        )
    )
    next_number = int(latest or 0) + 1

    sha256, canonical_length = canonical_sha256(data["text"])
    version = AgreementVersion(
        id=str(uuid.uuid4()),
        agreement_id=agreement.id,
        version=next_number,
        status="draft",
        text=data["text"],
        sha256=sha256,
        canonical_length=canonical_length,
        change_summary=data["change_summary"],
        created_by=ctx.user_id,
    )
    db.add(version)
    try:
        db.flush()  # surfaces the UNIQUE(agreement_id, version) race as 409
    except IntegrityError as exc:
        raise ApiError.conflict(
            "CONFLICT",
            "A concurrent request created this version number; retry.",
            [field_detail("version", "CONFLICT", "version number already used")],
        ) from exc

    # The new draft becomes current; milestones are carried forward and
    # re-stamped so the execution gate only accepts the current version.
    for milestone in db.scalars(
        select(Milestone).where(Milestone.agreement_id == agreement.id)
    ).all():
        milestone.version_id = version.id

    agreement.current_version_id = version.id
    agreement.updated_at = utcnow()
    if agreement.status == "active":
        # Lifecycle: a fresh (unapproved) current version re-opens the
        # agreement to draft until the new version is fully approved.
        agreement.status = "draft"

    _record_event(
        db,
        agreement.id,
        ctx,
        "version.created",
        {"version": next_number, "sha256": sha256, "change_summary": data["change_summary"]},
    )
    db.flush()

    body = _version_body(db, agreement, version)
    _store_idempotent(db, ctx, key, "POST /agreements/{id}/versions", request_hash, 201, body)
    return body


# ---------------------------------------------------------------------------
# POST /agreements/{id}/versions/{version}/approve
# ---------------------------------------------------------------------------


@router.post("/agreements/{agreement_id}/versions/{version_number}/approve", status_code=201)
def approve_version(
    agreement_id: str,
    version_number: int,
    payload: ApproveRequest,
    ctx: SessionContext = Depends(require("agreement:approve")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    agreement = _load_agreement(db, agreement_id, ctx)
    version = _load_version(db, agreement, version_number)

    # §5.2: the rendered hash is only ever a confirmation of a server-issued
    # hash — anything else is a mismatch.
    if not is_sha256(payload.confirm_sha256):
        raise ApiError.validation(
            "confirm_sha256 must be 64 lowercase hex characters.",
            [field_detail("confirm_sha256", "TYPE_ERROR", "expected 64 hex chars")],
        )
    if payload.confirm_sha256 != version.sha256:
        # §5.2 / §1.6: envelope code HASH_MISMATCH (422) — the text changed
        # since the client rendered it (or the client confirmed the wrong hash).
        raise ApiError(
            422,
            "HASH_MISMATCH",
            "confirm_sha256 does not match this version's current hash.",
            [field_detail("confirm_sha256", "HASH_MISMATCH", "hash does not match version")],
        )

    required, approved, fully = compute_approval_state(db, agreement, version)
    party = _required_party_check(db, agreement, ctx, required)
    if party.role in approved or fully:
        # §5.2: 409 ALREADY_APPROVED — this party already approved this exact
        # version (unique (version_id, party_role)); a fully approved version
        # is frozen, so any repeat is the same outcome for a required party.
        raise ApiError.conflict(
            "ALREADY_APPROVED",
            f"The {party.role} party has already approved this version.",
            [field_detail("party_role", "ALREADY_APPROVED", "duplicate approval")],
        )
    if version.status == "approved":
        # Safety net: frozen by another party's approval (D-06 recompute).
        raise ApiError.conflict(
            "CONFLICT",
            "This version is already fully approved.",
            [field_detail("version", "CONFLICT", "version already approved")],
        )

    approval = VersionApproval(
        id=str(uuid.uuid4()),
        version_id=version.id,
        party_role=party.role,
        actor_user_id=ctx.user_id,
        actor_name=ctx.name,
        confirmed_sha256=payload.confirm_sha256,
        approved_at=utcnow(),
    )
    db.add(approval)
    try:
        db.flush()  # UNIQUE(version_id, party_role) — D-06 backstop
    except IntegrityError as exc:
        raise ApiError.conflict(
            "CONFLICT",
            f"The {party.role} party has already approved this version.",
            [field_detail("party_role", "ALREADY_APPROVED", "duplicate approval")],
        ) from exc

    # Recompute (never trust the pre-insert snapshot for the final answer).
    required, approved, fully = compute_approval_state(db, agreement, version)
    event_payload: Dict[str, Any] = {"version": version.version, "party_role": party.role}

    if fully:
        version.status = "approved"
        event_payload["fully_approved"] = True
        if agreement.current_version_id == version.id and agreement.status == "draft":
            # Lifecycle: active once the current version is fully approved.
            agreement.status = "active"
        agreement.updated_at = utcnow()

    _record_event(db, agreement.id, ctx, "version.approved", event_payload)
    db.flush()

    return {
        "version": version.version,
        "approvals": _approval_dicts(approvals_for_version(db, version.id)),
        "required_approvals": required,
        "is_fully_approved": fully,
    }
