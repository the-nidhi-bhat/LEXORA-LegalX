"""Agreement endpoints (P0-04) — API_CONTRACTS.md §4.

Routes
------
``GET    /api/v1/agreements``                list (agreement:view)
``POST   /api/v1/agreements``                create (agreement:create, Idempotency-Key)
``GET    /api/v1/agreements/{id}``           detail (agreement:view)
``PATCH  /api/v1/agreements/{id}``           partial update (agreement:edit)

Scoping rule: rows are always loaded with ``organization_id = session org`` so
a cross-workspace id can only ever produce ``404 NOT_FOUND`` (§1.6), never a
403 that would confirm existence. Membership is checked before permission by
construction: the session context *is* the membership.
"""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session as DbSession

from api.app.db import get_db
from api.app.deps import SessionContext, require
from api.app.errors import ApiError, field_detail
from api.app.hashing import canonical_sha256, sha256_hex
from api.app.models.agreements import (
    ActivityEvent,
    Agreement,
    AgreementParty,
    AgreementVersion,
    IdempotencyKey,
    Milestone,
    VersionApproval,
)
from api.app.schemas.agreement import CreateAgreementRequest, PatchAgreementRequest
from api.app.timeutil import to_wire, utcnow
from api.app.validation import (
    client_only_requires_client_detail,
    validate_create_agreement,
    validate_patch_agreement,
)

router = APIRouter(prefix="/api/v1", tags=["agreements"])

_IDEMPOTENCY_WINDOW_SECONDS = 86400  # 24 h (contract §1.4)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _encode_cursor(created_at: datetime, agreement_id: str) -> str:
    raw = f"{created_at.isoformat(timespec='microseconds')}|{agreement_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        iso, agreement_id = raw.split("|", 1)
        return datetime.fromisoformat(iso), agreement_id
    except Exception as exc:  # noqa: BLE001 - any malformed cursor is a 422
        raise ApiError.validation(
            "The pagination cursor is not valid.",
            [field_detail("cursor", "VALUE_ERROR", "Invalid cursor")],
        ) from exc


def _load_agreement(db: DbSession, agreement_id: str, ctx: SessionContext) -> Agreement:
    row = db.scalar(
        select(Agreement).where(
            Agreement.id == agreement_id,
            Agreement.organization_id == ctx.organization_id,
        )
    )
    if row is None:
        # Cross-workspace and unknown ids are deliberately indistinguishable.
        raise ApiError.not_found("Agreement not found.")
    return row


def _current_version(db: DbSession, agreement: Agreement) -> Optional[AgreementVersion]:
    if agreement.current_version_id:
        row = db.get(AgreementVersion, agreement.current_version_id)
        if row is not None:
            return row
    return db.scalar(
        select(AgreementVersion)
        .where(AgreementVersion.agreement_id == agreement.id)
        .order_by(AgreementVersion.version.desc())
    )


def _party_dicts(parties: Sequence[AgreementParty]) -> List[Dict[str, str]]:
    return [{"role": p.role, "name": p.name, "email": p.email} for p in parties]


def _milestone_dicts(milestones: Sequence[Milestone]) -> List[Dict[str, Any]]:
    return [
        {
            "seq": m.seq,
            "name": m.name,
            "amount_minor": m.amount_minor,
            "due_date": m.due_date.isoformat(),
            "acceptance_criteria": m.acceptance_criteria,
            "status": m.status,
        }
        for m in milestones
    ]


def _item(
    agreement: Agreement,
    parties: Sequence[AgreementParty],
    current_version_number: Optional[int],
) -> Dict[str, Any]:
    return {
        "id": agreement.id,
        "title": agreement.title,
        "status": agreement.status,
        "currency": agreement.currency,
        "total_amount_minor": agreement.total_amount_minor,
        "current_version": current_version_number,
        "approval_policy": agreement.approval_policy,
        "parties": _party_dicts(parties),
        "created_at": to_wire(agreement.created_at),
        "updated_at": to_wire(agreement.updated_at),
    }


def _detail(
    agreement: Agreement,
    parties: Sequence[AgreementParty],
    version: Optional[AgreementVersion],
    milestones: Sequence[Milestone],
) -> Dict[str, Any]:
    body = _item(agreement, parties, version.version if version else None)
    body.update(
        {
            "milestones": _milestone_dicts(milestones),
            "extra_terms": agreement.extra_terms,
            "current_version_id": agreement.current_version_id,
        }
    )
    return body


def _record_event(
    db: DbSession, agreement_id: str, ctx: SessionContext, event_type: str, payload: Dict
) -> None:
    db.add(
        ActivityEvent(
            id=str(uuid.uuid4()),
            agreement_id=agreement_id,
            actor_user_id=ctx.user_id,
            event_type=event_type,
            payload=json.dumps(payload, sort_keys=True),
        )
    )


def _required_approvals(
    agreement: Agreement, parties: Sequence[AgreementParty]
) -> List[str]:
    if agreement.approval_policy == "client_only":
        return ["client"] if any(p.role == "client" for p in parties) else []
    seen: List[str] = []
    for party in parties:
        if party.role not in seen:
            seen.append(party.role)
    return seen


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


# ---------------------------------------------------------------------------
# Idempotency (contract §1.4)
# ---------------------------------------------------------------------------


def _idempotency_key(request: Request) -> Optional[str]:
    raw = request.headers.get("Idempotency-Key", "").strip()
    if not raw:
        return None
    try:
        uuid.UUID(raw)
    except ValueError as exc:
        raise ApiError.validation(
            "Idempotency-Key must be a UUID.",
            [field_detail("Idempotency-Key", "VALUE_ERROR", "must be a UUID")],
        ) from exc
    return raw


def _idempotent_replay(
    db: DbSession, ctx: SessionContext, key: Optional[str], endpoint: str, request_hash: str
):
    if key is None:
        return None
    row = db.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.key == key,
            IdempotencyKey.user_id == ctx.user_id,
            IdempotencyKey.endpoint == endpoint,
        )
    )
    if row is None:
        return None
    if (utcnow() - row.created_at).total_seconds() > _IDEMPOTENCY_WINDOW_SECONDS:
        db.delete(row)  # window elapsed: the key is reusable
        db.flush()
        return None
    if row.request_hash != request_hash:
        raise ApiError.conflict(
            "CONFLICT",
            "This Idempotency-Key was already used with a different payload.",
            [field_detail("Idempotency-Key", "CONFLICT", "reused with a different body")],
        )
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=row.response_status, content=json.loads(row.response_body)
    )


def _store_idempotent(
    db: DbSession,
    ctx: SessionContext,
    key: Optional[str],
    endpoint: str,
    request_hash: str,
    status: int,
    body: Dict[str, Any],
) -> None:
    if key is None:
        return
    db.add(
        IdempotencyKey(
            id=str(uuid.uuid4()),
            key=key,
            user_id=ctx.user_id,
            endpoint=endpoint,
            request_hash=request_hash,
            response_status=status,
            response_body=json.dumps(body, sort_keys=True),
        )
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/agreements")
def list_agreements(
    status: Optional[str] = Query(None, pattern="^(draft|active|completed)$"),
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = None,
    ctx: SessionContext = Depends(require("agreement:view")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    stmt = select(Agreement).where(Agreement.organization_id == ctx.organization_id)
    if status:
        stmt = stmt.where(Agreement.status == status)
    if cursor:
        created_at, agreement_id = _decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                Agreement.created_at < created_at,
                and_(Agreement.created_at == created_at, Agreement.id < agreement_id),
            )
        )
    stmt = stmt.order_by(Agreement.created_at.desc(), Agreement.id.desc()).limit(limit + 1)
    rows = list(db.scalars(stmt).all())

    has_more = len(rows) > limit
    rows = rows[:limit]
    ids = [row.id for row in rows]

    parties_by_agreement: Dict[str, List[AgreementParty]] = {i: [] for i in ids}
    if ids:
        for party in db.scalars(
            select(AgreementParty).where(AgreementParty.agreement_id.in_(ids))
        ).all():
            parties_by_agreement.setdefault(party.agreement_id, []).append(party)

    versions_by_agreement: Dict[str, AgreementVersion] = {}
    if ids:
        for version in db.scalars(
            select(AgreementVersion).where(AgreementVersion.agreement_id.in_(ids))
        ).all():
            current = versions_by_agreement.get(version.agreement_id)
            if current is None or version.version > current.version:
                versions_by_agreement[version.agreement_id] = version

    items: List[Dict[str, Any]] = []
    for row in rows:
        version = None
        if row.current_version_id:
            version = next(
                (
                    v
                    for v in [db.get(AgreementVersion, row.current_version_id)]
                    if v is not None
                ),
                None,
            )
        if version is None:
            version = versions_by_agreement.get(row.id)
        items.append(_item(row, parties_by_agreement.get(row.id, []), version.version if version else None))

    next_cursor = _encode_cursor(rows[-1].created_at, rows[-1].id) if (has_more and rows) else None
    return {"items": items, "next_cursor": next_cursor}


@router.post("/agreements", status_code=201)
def create_agreement(
    payload: CreateAgreementRequest,
    request: Request,
    ctx: SessionContext = Depends(require("agreement:create")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    data = payload.model_dump()
    details = validate_create_agreement(data)
    client_only = client_only_requires_client_detail(
        data["approval_policy"], [p["role"] for p in data["parties"]]
    )
    if client_only:
        details.append(client_only)
    if details:
        raise ApiError(
            422,
            "VALIDATION_FAILED",
            details[0]["message"],
            details,
        )

    key = _idempotency_key(request)
    request_hash = sha256_hex(json.dumps(data, sort_keys=True, separators=(",", ":")))
    replay = _idempotent_replay(db, ctx, key, "POST /agreements", request_hash)
    if replay is not None:
        return replay

    agreement_id = str(uuid.uuid4())
    sha256, canonical_length = canonical_sha256(data["text"])
    version = AgreementVersion(
        id=str(uuid.uuid4()),
        agreement_id=agreement_id,
        version=1,
        status="draft",
        text=data["text"],
        sha256=sha256,
        canonical_length=canonical_length,
        change_summary="Initial version",
        created_by=ctx.user_id,
    )
    agreement = Agreement(
        id=agreement_id,
        organization_id=ctx.organization_id,
        created_by=ctx.user_id,
        title=data["title"].strip(),
        agreement_type=data["agreement_type"],
        currency=data["currency"],
        total_amount_minor=data["total_amount_minor"],
        approval_policy=data["approval_policy"],
        status="draft",
        review_period_days=data["review_period_days"],
        review_period_basis=data["review_period_basis"],
        extra_terms=data.get("extra_terms", ""),
        dispute_behavior=data.get("dispute_behavior"),
        governing_law=data.get("governing_law"),
        current_version_id=version.id,
    )
    db.add(agreement)
    db.add(version)

    # Link parties to existing users by email (approval identity later on).
    emails = [p["email"] for p in data["parties"]]
    users_by_email = {}
    if emails:
        from api.app.models.auth import User

        for user in db.scalars(select(User).where(User.email.in_(emails))).all():
            users_by_email[user.email] = user.id

    for party in data["parties"]:
        db.add(
            AgreementParty(
                id=str(uuid.uuid4()),
                agreement_id=agreement_id,
                role=party["role"],
                name=party["name"],
                email=party["email"],
                user_id=users_by_email.get(party["email"]),
            )
        )

    for milestone in data["milestones"]:
        from datetime import date as _date

        db.add(
            Milestone(
                id=str(uuid.uuid4()),
                agreement_id=agreement_id,
                version_id=version.id,
                seq=milestone["seq"],
                name=milestone["name"],
                amount_minor=milestone["amount_minor"],
                due_date=_date.fromisoformat(milestone["due_date"]),
                acceptance_criteria=milestone.get("acceptance_criteria", ""),
                status="pending",
            )
        )

    _record_event(
        db,
        agreement_id,
        ctx,
        "agreement.created",
        {"title": agreement.title, "created_version": 1},
    )
    db.flush()

    parties = list(
        db.scalars(
            select(AgreementParty).where(AgreementParty.agreement_id == agreement_id)
        ).all()
    )
    milestones = list(
        db.scalars(
            select(Milestone)
            .where(Milestone.agreement_id == agreement_id)
            .order_by(Milestone.seq)
        ).all()
    )
    body = _detail(agreement, parties, version, milestones)
    body["created_version"] = 1
    _store_idempotent(db, ctx, key, "POST /agreements", request_hash, 201, body)
    return body


@router.get("/agreements/{agreement_id}")
def get_agreement(
    agreement_id: str,
    ctx: SessionContext = Depends(require("agreement:view")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    agreement = _load_agreement(db, agreement_id, ctx)
    parties = list(
        db.scalars(
            select(AgreementParty)
            .where(AgreementParty.agreement_id == agreement.id)
            .order_by(AgreementParty.created_at)
        ).all()
    )
    milestones = list(
        db.scalars(
            select(Milestone)
            .where(Milestone.agreement_id == agreement.id)
            .order_by(Milestone.seq)
        ).all()
    )
    version = _current_version(db, agreement)
    return _detail(agreement, parties, version, milestones)


@router.patch("/agreements/{agreement_id}")
def patch_agreement(
    agreement_id: str,
    payload: PatchAgreementRequest,
    ctx: SessionContext = Depends(require("agreement:edit")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    agreement = _load_agreement(db, agreement_id, ctx)
    parties = list(
        db.scalars(
            select(AgreementParty)
            .where(AgreementParty.agreement_id == agreement.id)
            .order_by(AgreementParty.created_at)
        ).all()
    )
    version = _current_version(db, agreement)

    # §4.4: once the current version carries any approval, edits are a
    # contractual change and must go through POST …/versions.
    if _approval_count(db, version) > 0:
        raise ApiError.conflict(
            "CONFLICT",
            "The current version already has approvals. Create a new version "
            "with POST /api/v1/agreements/{id}/versions to propose changes.",
            [field_detail("current_version_id", "CONFLICT", "version has approvals")],
        )

    present = list(payload.model_dump(exclude_unset=True).keys())
    data = payload.model_dump(exclude_unset=True)
    details = validate_patch_agreement(
        data, current_total=agreement.total_amount_minor, present=present
    )
    if "approval_policy" in present:
        client_only = client_only_requires_client_detail(
            data["approval_policy"], [p.role for p in parties]
        )
        if client_only:
            details.append(client_only)
    if details:
        raise ApiError(422, "VALIDATION_FAILED", details[0]["message"], details)

    changed: List[str] = []
    for field_name in (
        "title",
        "review_period_days",
        "review_period_basis",
        "approval_policy",
        "dispute_behavior",
        "governing_law",
    ):
        if field_name in present:
            value = data[field_name]
            if field_name == "title":
                value = value.strip()
            if getattr(agreement, field_name) != value:
                setattr(agreement, field_name, value)
                changed.append(field_name)

    if "milestones" in present:
        from datetime import date as _date

        # Pre-approval only (guard above), so no released milestone can exist;
        # the set is replaced wholesale and re-stamped with the current version.
        for existing in list(
            db.scalars(
                select(Milestone).where(Milestone.agreement_id == agreement.id)
            ).all()
        ):
            db.delete(existing)
        db.flush()
        for milestone in data["milestones"]:
            db.add(
                Milestone(
                    id=str(uuid.uuid4()),
                    agreement_id=agreement.id,
                    version_id=agreement.current_version_id,
                    seq=milestone["seq"],
                    name=milestone["name"],
                    amount_minor=milestone["amount_minor"],
                    due_date=_date.fromisoformat(milestone["due_date"]),
                    acceptance_criteria=milestone.get("acceptance_criteria", ""),
                    status="pending",
                )
            )
        changed.append("milestones")

    if changed:
        agreement.updated_at = utcnow()
        _record_event(db, agreement.id, ctx, "agreement.updated", {"fields": changed})
        db.flush()

    milestones = list(
        db.scalars(
            select(Milestone)
            .where(Milestone.agreement_id == agreement.id)
            .order_by(Milestone.seq)
        ).all()
    )
    return _detail(agreement, parties, version, milestones)
