"""Authentication and authorization dependencies (P0-03).

The chain every protected request walks, in order:

1. **session**   — opaque cookie token → SHA-256 → ``sessions`` row
                   (missing / unknown / expired / revoked → ``401 UNAUTHENTICATED``);
2. **CSRF**      — every non-GET with a live session must present
                   ``X-CSRF-Token`` matching the row (``403 CSRF_FAILED``);
3. **membership**— the row's pinned ``organization_id`` + a real ``memberships``
                   row decide identity and role. Nothing a client sends
                   (query, body, header, localStorage) participates;
4. **permission**— role → D-01 permission table (``403 FORBIDDEN``);
5. **resource**  — routes load rows *scoped to the session organization* so a
                   cross-workspace id can only ever produce ``404 NOT_FOUND``
                   (API_CONTRACTS.md §1.6/§2).

The sliding expiry is extended here on every authenticated request, clamped to
the absolute cap set at sign-in.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional, Sequence

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from api.app.config import get_settings
from api.app.db import get_db
from api.app.errors import ApiError
from api.app.models.auth import Membership, Organization, SessionRow, User
from api.app.rbac import AuthContext, has_permission, permissions_for_roles
from api.app.security import hash_token, tokens_equal
from api.app.timeutil import utcnow, utcnow_offset

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


@dataclass(frozen=True)
class SessionContext:
    """Server-resolved identity for one request."""

    user_id: str
    email: str
    name: str
    initials: str
    organization_id: str
    organization_name: str
    roles: Sequence[str]
    csrf_token: str
    session: SessionRow

    @property
    def permissions(self) -> list[str]:
        return permissions_for_roles(self.roles)

    def has(self, permission: str) -> bool:
        return any(has_permission(role, permission) for role in self.roles)

    def to_auth_context(self) -> AuthContext:
        return AuthContext(
            user_id=self.user_id,
            organization_id=self.organization_id,
            roles=tuple(self.roles),
        )


def authenticate(request: Request, db: DbSession) -> Optional[SessionContext]:
    """Resolve the session cookie to a live identity, or ``None``.

    Raises :class:`ApiError` (CSRF) for a live session on an unsafe method
    without a valid token — the session itself is otherwise only *resolved*
    here so callers can decide how to report ``None``.
    """
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None

    row = db.get(SessionRow, hash_token(token))
    if row is None:
        return None
    if row.revoked_at is not None:
        return None

    now = utcnow()
    if now >= row.expires_at or now >= row.absolute_expires_at:
        return None

    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        return None

    membership = db.scalar(
        select(Membership).where(
            Membership.organization_id == row.organization_id,
            Membership.user_id == row.user_id,
        )
    )
    if membership is None:
        return None

    # CSRF: bound to the session row, compared in constant time.
    if request.method.upper() not in SAFE_METHODS:
        supplied = request.headers.get(settings.csrf_header_name, "")
        if not supplied or not tokens_equal(supplied, row.csrf_token):
            raise ApiError.csrf_failed()

    # Sliding window, clamped to the absolute cap from sign-in.
    extended = min(utcnow_offset(settings.session_ttl_seconds), row.absolute_expires_at)
    if extended > row.expires_at:
        row.expires_at = extended

    organization = db.get(Organization, row.organization_id)
    return SessionContext(
        user_id=user.id,
        email=user.email,
        name=user.name,
        initials=user.initials,
        organization_id=row.organization_id,
        organization_name=organization.name if organization else "",
        roles=(membership.role,),
        csrf_token=row.csrf_token,
        session=row,
    )


def require(permission: Optional[str] = None) -> Callable:
    """FastAPI dependency factory: live session (+ optional D-01 permission).

    Usage::

        @router.post("/things")
        def create(ctx: SessionContext = Depends(require("agreement:create"))):
            ...
    """

    def dependency(request: Request, db: DbSession = Depends(get_db)) -> SessionContext:
        ctx = authenticate(request, db)
        if ctx is None:
            raise ApiError.unauthenticated()
        if permission is not None and not ctx.has(permission):
            raise ApiError.forbidden(
                f"This action requires the '{permission}' permission."
            )
        return ctx

    return dependency


def require_any(*permissions: str) -> Callable:
    """Dependency factory granting access when the session holds any one of them."""

    def dependency(request: Request, db: DbSession = Depends(get_db)) -> SessionContext:
        ctx = authenticate(request, db)
        if ctx is None:
            raise ApiError.unauthenticated()
        if permissions and not any(ctx.has(p) for p in permissions):
            raise ApiError.forbidden(
                "This action requires one of: " + ", ".join(permissions)
            )
        return ctx

    return dependency
