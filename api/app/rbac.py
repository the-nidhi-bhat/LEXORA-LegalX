"""Server-side RBAC policy and authorization helpers (P0-01 port, P0-03 authority).

This is the Python port of the repository's former ``server/authorization.ts``
(dead TypeScript code outside ``tsconfig``) and the server-side home of the
**approved** permission model.

Policy source: ``docs/EXECUTION_PLAN.md`` §3.1 (decision **D-01** —
least-privilege, resource-scoped). The frontend still carries the pre-P0-02
matrix until Iffa's ``fix/p0-02-owner-parity-access`` lands; the server table
below is authoritative for every API decision and must not be broadened
without a recorded lead decision.

Rules encoded here (unchanged from the TypeScript original):
- workspace/organization membership is checked before any permission;
- resource scope = owner, assignee, or an observer role (org_admin / auditor);
- financial visibility and agreement edits are separate capabilities.

Nothing in this module reads anything a client supplied: callers pass the
identity resolved from the session row.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, List, Optional, Sequence, Set

# ---------------------------------------------------------------------------
# Roles and permissions (D-01 approved matrix, EXECUTION_PLAN.md §3.1)
# ---------------------------------------------------------------------------

Role = str  # one of ROLE_PERMISSIONS keys

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "owner": frozenset({
        "agreement:create", "agreement:view", "agreement:edit", "agreement:suggest",
        "agreement:approve", "escrow:fund", "escrow:view_financials",
        "milestone:submit", "milestone:approve", "ir:read", "verification:read",
        "verification:run", "activity:read", "trust:export",
    }),
    "freelancer": frozenset({
        "agreement:view", "agreement:suggest", "agreement:approve",
        "escrow:view_financials", "milestone:submit", "activity:read", "trust:export",
    }),
    "legal_reviewer": frozenset({
        "agreement:view", "agreement:suggest", "agreement:approve_legal",
        "ir:read", "verification:read", "verification:run", "trust:export",
    }),
    "org_admin": frozenset({
        "agreement:view", "workspace:manage", "activity:read",
    }),
    "technical_auditor": frozenset({
        "agreement:view", "ir:read", "verification:read", "activity:read",
        "audit:read_global", "trust:export",
    }),
}

# Retired by D-01 / N-06: present only so drift is detectable in tests.
RETIRED_PERMISSIONS = frozenset({"audit:view", "workspace:view_activity", "agreement:approve_parity"})

ROLES: frozenset[str] = frozenset(ROLE_PERMISSIONS)


class AuthorizationError(Exception):
    """Base class for authorization failures (mirrors the TS ``throw`` codes)."""

    code = "FORBIDDEN"

    def __init__(self, code: Optional[str] = None, detail: str = "") -> None:
        self.code = code or self.code
        self.detail = detail
        super().__init__(f"{self.code}:{detail}" if detail else self.code)


class ForbiddenWorkspace(AuthorizationError):
    code = "FORBIDDEN_WORKSPACE"


class ForbiddenResourceScope(AuthorizationError):
    code = "FORBIDDEN_RESOURCE_SCOPE"


class ForbiddenPermission(AuthorizationError):
    code = "FORBIDDEN_PERMISSION"


# ---------------------------------------------------------------------------
# Context and resource shapes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AuthContext:
    """Identity resolved server-side from the session — never from the client."""

    user_id: str
    organization_id: str
    roles: Sequence[str] = field(default_factory=tuple)


@dataclass(frozen=True)
class Resource:
    organization_id: str
    owner_id: Optional[str] = None
    assigned_user_ids: Sequence[str] = field(default_factory=tuple)


# ---------------------------------------------------------------------------
# Helpers (ported from server/authorization.ts, semantics unchanged)
# ---------------------------------------------------------------------------


def has_permission(role: str, permission: str) -> bool:
    if permission in RETIRED_PERMISSIONS:
        return False
    return permission in ROLE_PERMISSIONS.get(role, frozenset())


def permissions_for_roles(roles: Iterable[str]) -> List[str]:
    """Union of the permissions granted by any of ``roles``, sorted for stability."""
    granted: Set[str] = set()
    for role in roles:
        granted |= ROLE_PERMISSIONS.get(role, frozenset())
    granted -= RETIRED_PERMISSIONS
    return sorted(granted)


def require_workspace(context: AuthContext, resource: Resource) -> None:
    if context.organization_id != resource.organization_id:
        raise ForbiddenWorkspace()


def _require_agreement_scope(context: AuthContext, resource: Resource) -> None:
    require_workspace(context, resource)
    is_owner = resource.owner_id == context.user_id
    is_assignee = context.user_id in resource.assigned_user_ids
    is_workspace_observer = any(role in {"org_admin", "technical_auditor"} for role in context.roles)
    if not is_owner and not is_assignee and not is_workspace_observer:
        raise ForbiddenResourceScope()


def require_permission(context: AuthContext, permission: str, resource: Resource) -> None:
    require_workspace(context, resource)
    if not any(has_permission(role, permission) for role in context.roles):
        raise ForbiddenPermission(detail=permission)


def can_read_financials(context: AuthContext, resource: Resource) -> bool:
    _require_agreement_scope(context, resource)
    return any(has_permission(role, "escrow:view_financials") for role in context.roles)


def can_edit_agreement(context: AuthContext, resource: Resource) -> bool:
    _require_agreement_scope(context, resource)
    return resource.owner_id == context.user_id and any(
        has_permission(role, "agreement:edit") for role in context.roles
    )


def authorize_agreement_read(context: AuthContext, resource: Resource) -> tuple[str, str]:
    """API contract: invoke before every read, then apply the same predicate in SQL."""
    _require_agreement_scope(context, resource)
    if not any(has_permission(role, "agreement:view") for role in context.roles):
        raise ForbiddenPermission(detail="agreement:view")
    return context.user_id, context.organization_id
