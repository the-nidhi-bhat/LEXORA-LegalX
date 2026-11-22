"""Bounded parity HTTP surface (PHASE6 parity HTTP/UI integration).

Two routes only:

- ``POST /api/v1/agreements/{id}/versions/{version}/verify``
  ``verification:run`` + CSRF; engine-backed, append-only verification run.
- ``GET  /api/v1/agreements/{id}/trust-passport?version=<int>``
  ``verification:read``; evidence-only, rederived on every call.

Both load the agreement through the org-scoped helper so a cross-workspace or
unknown id is indistinguishable (404).
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session as DbSession

from api.app.db import get_db
from api.app.deps import SessionContext, require
from api.app.errors import ApiError
from api.app.parity.service import (
    build_trust_passport,
    resolve_target_version,
    run_verification,
)
from api.app.ratelimit import limiter
from api.app.routers.agreements import _load_agreement
from api.app.schemas.parity import ParityVerifyRequest

router = APIRouter(prefix="/api/v1", tags=["parity"])


@router.post("/agreements/{agreement_id}/versions/{version}/verify")
def verify_version(
    agreement_id: str,
    version: int,
    payload: ParityVerifyRequest,
    request: Request,
    ctx: SessionContext = Depends(require("verification:run")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    """Verify the target version against server-derived execution parameters."""
    # Rate limit per authenticated principal + agreement (reuses the shared
    # in-memory limiter from api.app.ratelimit; same pattern as auth.py). Each
    # verify call appends 3-4 DB rows, so every allowed attempt is recorded.
    key = (f"parity:{ctx.user_id}", agreement_id)
    allowed, retry_after = limiter.check(key)
    if not allowed:
        raise ApiError(
            429,
            "RATE_LIMITED",
            "Too many verification attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    limiter.record_failure(key)

    agreement = _load_agreement(db, agreement_id, ctx)
    target = resolve_target_version(db, agreement, version)
    return run_verification(
        db,
        agreement=agreement,
        version=target,
        clarification=payload.execution_parameters,
        ctx=ctx,
        request_id=getattr(request.state, "request_id", ""),
    )


@router.get("/agreements/{agreement_id}/trust-passport")
def trust_passport(
    agreement_id: str,
    version: Optional[int] = Query(default=None),
    ctx: SessionContext = Depends(require("verification:read")),
    db: DbSession = Depends(get_db),
) -> Dict[str, Any]:
    """Return version-specific parity evidence without private document text."""
    agreement = _load_agreement(db, agreement_id, ctx)
    target = resolve_target_version(db, agreement, version)
    return build_trust_passport(db, agreement=agreement, version=target, ctx=ctx)
