"""Authentication endpoints (P0-03) — API_CONTRACTS.md §3.

- ``POST /api/v1/auth/session``  sign in (public, rate-limited, no CSRF needed
  because no session exists yet)
- ``DELETE /api/v1/auth/session`` sign out (revokes the row, clears the cookie)
- ``GET /api/v1/me``             server-computed identity + permissions
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session as DbSession

from api.app.config import get_settings
from api.app.db import get_db
from api.app.deps import SessionContext, require
from api.app.errors import ApiError
from api.app.models.auth import Membership, Organization, SessionRow, User
from api.app.ratelimit import limiter
from api.app.rbac import permissions_for_roles
from api.app.schemas.auth import SessionOut, SignInRequest, UserOut
from api.app.security import (
    dummy_verify,
    generate_csrf_token,
    generate_session_token,
    hash_token,
    verify_password,
)
from api.app.timeutil import to_wire, utcnow, utcnow_offset

router = APIRouter(prefix="/api/v1", tags=["auth"])


def _session_out(ctx: SessionContext, expires_at) -> SessionOut:
    return SessionOut(
        user=UserOut(
            id=ctx.user_id,
            email=ctx.email,
            name=ctx.name,
            initials=ctx.initials,
            role=ctx.roles[0] if ctx.roles else "",
            organization_id=ctx.organization_id,
            organization_name=ctx.organization_name,
        ),
        permissions=list(ctx.permissions),
        csrf_token=ctx.csrf_token,
        expires_at=to_wire(expires_at),
    )


@router.post("/auth/session", response_model=SessionOut, status_code=200)
def sign_in(
    payload: SignInRequest,
    request: Request,
    response: Response,
    db: DbSession = Depends(get_db),
) -> SessionOut:
    settings = get_settings()
    ip = request.client.host if request.client else "unknown"
    key = (payload.email, ip)
    # Namespaced so source-IP traffic can never collide with an email key.
    ip_key = ("__ip__", ip)

    # A second, higher budget on the same limiter bounds credential stuffing
    # across many email addresses from one source (B-07). Both gates consume
    # their slot atomically (B-09).
    ip_allowed, ip_retry_after, ip_stamp = limiter.check_and_record(
        ip_key, attempts=settings.login_ip_rate_limit_attempts
    )
    if not ip_allowed:
        raise ApiError(
            429,
            "RATE_LIMITED",
            "Too many sign-in attempts from this address. Please try again later.",
            headers={"Retry-After": str(ip_retry_after)},
        )

    allowed, retry_after, stamp = limiter.check_and_record(key)
    if not allowed:
        raise ApiError(
            429,
            "RATE_LIMITED",
            "Too many sign-in attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not user.is_active:
        dummy_verify(payload.password)
        raise ApiError.invalid_credentials()  # slot recorded by check_and_record
    if not verify_password(user.password_hash, payload.password):
        raise ApiError.invalid_credentials()  # slot recorded by check_and_record

    membership_row = db.execute(
        select(Membership, Organization)
        .join(Organization, Organization.id == Membership.organization_id)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at.asc())
    ).first()
    if membership_row is None:
        # Credentials were valid: this is an authorization outcome, not a
        # credential failure, so release the atomically consumed slots again
        # without clearing any earlier failures for these keys (B-11/B-07).
        limiter.unrecord(key, stamp)
        limiter.unrecord(ip_key, ip_stamp)
        raise ApiError.forbidden("Your account has no workspace membership.")
    membership, organization = membership_row

    token = generate_session_token()
    now = utcnow()
    # Bounded cleanup: a successful sign-in prunes only this user's expired
    # rows, in the same transaction as the new session. Without this the table
    # grows without bound from abandoned logins (B-12).
    db.execute(
        delete(SessionRow).where(
            SessionRow.user_id == user.id,
            or_(
                SessionRow.expires_at < now,
                SessionRow.absolute_expires_at < now,
            ),
        )
    )
    row = SessionRow(
        token_hash=hash_token(token),
        user_id=user.id,
        organization_id=organization.id,
        csrf_token=generate_csrf_token(),
        created_at=now,
        expires_at=utcnow_offset(settings.session_ttl_seconds),
        absolute_expires_at=utcnow_offset(settings.session_absolute_seconds),
    )
    db.add(row)
    db.commit()
    limiter.reset(key)
    limiter.reset(ip_key)

    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_absolute_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )

    return SessionOut(
        user=UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            initials=user.initials,
            role=membership.role,
            organization_id=organization.id,
            organization_name=organization.name,
        ),
        permissions=permissions_for_roles([membership.role]),
        csrf_token=row.csrf_token,
        expires_at=to_wire(row.expires_at),
    )


@router.delete("/auth/session", status_code=204)
def sign_out(
    ctx: SessionContext = Depends(require()),
    db: DbSession = Depends(get_db),
) -> Response:
    """Revoke the session row and clear the cookie (contract §3.2)."""
    settings = get_settings()
    ctx.session.revoked_at = utcnow()
    db.commit()  # revocation must persist before the response is sent
    response = Response(status_code=204)
    response.delete_cookie(key=settings.session_cookie_name, path="/")
    return response


@router.get("/me", response_model=SessionOut)
def me(ctx: SessionContext = Depends(require())) -> SessionOut:
    """The caller's identity and *server-computed* permissions (contract §3.3)."""
    return _session_out(ctx, ctx.session.expires_at)
