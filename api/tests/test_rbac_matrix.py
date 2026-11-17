"""P0-03 authorization tests — approved D-01 matrix (EXECUTION_PLAN.md §3.1).

Two layers are asserted here:
1. the pure policy table (roles × permissions) matches the approved matrix
   exactly, including that retired permissions grant nothing;
2. the HTTP layer never trusts client-supplied identity claims — permissions
   come from the ``memberships`` row resolved server-side from the session.

Endpoint-level enforcement (agreement endpoints) lands with P0-04 and is
tested there; this file pins the policy and the identity plumbing.
"""

from __future__ import annotations

import pytest

from api.app.rbac import (
    RETIRED_PERMISSIONS,
    ROLE_PERMISSIONS,
    AuthContext,
    ForbiddenPermission,
    ForbiddenResourceScope,
    ForbiddenWorkspace,
    Resource,
    authorize_agreement_read,
    can_edit_agreement,
    can_read_financials,
    has_permission,
    permissions_for_roles,
    require_permission,
    require_workspace,
)

# The approved matrix, written out independently of the implementation.
EXPECTED_MATRIX = {
    "owner": {
        "agreement:create", "agreement:view", "agreement:edit", "agreement:suggest",
        "agreement:approve", "escrow:fund", "escrow:view_financials",
        "milestone:submit", "milestone:approve", "ir:read", "verification:read",
        "verification:run", "activity:read", "trust:export",
    },
    "freelancer": {
        "agreement:view", "agreement:suggest", "agreement:approve",
        "escrow:view_financials", "milestone:submit", "activity:read", "trust:export",
    },
    "legal_reviewer": {
        "agreement:view", "agreement:suggest", "agreement:approve_legal",
        "ir:read", "verification:read", "verification:run", "trust:export",
    },
    "org_admin": {"agreement:view", "workspace:manage", "activity:read"},
    "technical_auditor": {
        "agreement:view", "ir:read", "verification:read", "activity:read",
        "audit:read_global", "trust:export",
    },
}

ALL_PERMISSIONS = sorted({p for perms in EXPECTED_MATRIX.values() for p in perms})


# --------------------------------------------------------------------------
# 1. Policy table
# --------------------------------------------------------------------------


def test_role_permission_table_matches_approved_d01_matrix():
    assert set(ROLE_PERMISSIONS) == set(EXPECTED_MATRIX)
    for role, expected in EXPECTED_MATRIX.items():
        assert set(ROLE_PERMISSIONS[role]) == expected, f"role {role} drifted from D-01"


def test_full_role_permission_cell_matrix():
    """Every (role, permission) cell against the approved table (17 × 5 = 85)."""
    for role in EXPECTED_MATRIX:
        for permission in ALL_PERMISSIONS:
            expected = permission in EXPECTED_MATRIX[role]
            assert has_permission(role, permission) is expected, (
                f"cell ({role}, {permission}) should be {expected}"
            )


def test_retired_permissions_grant_nothing():
    assert RETIRED_PERMISSIONS  # the list is non-empty
    for role in EXPECTED_MATRIX:
        for permission in RETIRED_PERMISSIONS:
            assert has_permission(role, permission) is False


def test_unknown_role_has_no_permissions():
    assert has_permission("superuser", "agreement:create") is False
    assert permissions_for_roles(["superuser", "nonsense"]) == []


def test_permissions_for_roles_is_a_union():
    union = permissions_for_roles(["freelancer", "legal_reviewer"])
    assert set(union) == EXPECTED_MATRIX["freelancer"] | EXPECTED_MATRIX["legal_reviewer"]
    assert union == sorted(union)


# --------------------------------------------------------------------------
# 2. Authorization helpers (ported from server/authorization.ts)
# --------------------------------------------------------------------------


OWNER = AuthContext(user_id="user-owner", organization_id="org-a", roles=("owner",))
FREELANCER = AuthContext(user_id="user-free", organization_id="org-a", roles=("freelancer",))
REVIEWER = AuthContext(user_id="user-review", organization_id="org-a", roles=("legal_reviewer",))
ADMIN = AuthContext(user_id="user-admin", organization_id="org-a", roles=("org_admin",))
OUTSIDER = AuthContext(user_id="user-other", organization_id="org-b", roles=("owner",))

OWNED_BY_OWNER = Resource(organization_id="org-a", owner_id="user-owner")
ASSIGNED_TO_FREELANCER = Resource(
    organization_id="org-a", owner_id="user-owner", assigned_user_ids=("user-free",)
)


def test_cross_workspace_access_is_refused_before_anything_else():
    with pytest.raises(ForbiddenWorkspace):
        require_workspace(OUTSIDER, OWNED_BY_OWNER)
    with pytest.raises(ForbiddenWorkspace):
        authorize_agreement_read(OUTSIDER, OWNED_BY_OWNER)


def test_stranger_freelancer_fails_resource_scope():
    with pytest.raises(ForbiddenResourceScope):
        authorize_agreement_read(FREELANCER, OWNED_BY_OWNER)  # not owner/assignee


def test_assignee_passes_scope_and_holds_view_permission():
    assert authorize_agreement_read(FREELANCER, ASSIGNED_TO_FREELANCER) == (
        "user-free",
        "org-a",
    )


def test_observer_roles_pass_scope():
    admin_resource = Resource(organization_id="org-a", owner_id="user-owner")
    assert authorize_agreement_read(ADMIN, admin_resource) == ("user-admin", "org-a")


def test_missing_permission_raises_forbidden_permission():
    with pytest.raises(ForbiddenPermission):
        require_permission(FREELANCER, "agreement:create", ASSIGNED_TO_FREELANCER)
    # …while the owner has it:
    require_permission(OWNER, "agreement:create", OWNED_BY_OWNER)


def test_financial_visibility_is_a_separate_capability():
    # Assignee freelancer sees money…
    assert can_read_financials(FREELANCER, ASSIGNED_TO_FREELANCER) is True
    # …an org_admin observer has scope but not the money permission…
    assert can_read_financials(ADMIN, OWNED_BY_OWNER) is False
    # …and the viewer role does not exist in D-01 at all.
    viewer = AuthContext(user_id="u", organization_id="org-a", roles=("viewer",))
    with pytest.raises(ForbiddenResourceScope):
        can_read_financials(viewer, OWNED_BY_OWNER)


def test_editing_agreement_requires_ownership_and_permission():
    assert can_edit_agreement(OWNER, OWNED_BY_OWNER) is True
    # Assignee with no edit permission:
    assert can_edit_agreement(FREELANCER, ASSIGNED_TO_FREELANCER) is False
    # org_admin has neither agreement:edit nor ownership:
    assert can_edit_agreement(ADMIN, OWNED_BY_OWNER) is False


def test_legal_reviewer_special_approval_is_distinct():
    """`agreement:approve_legal` must not imply `agreement:approve` (D-01)."""
    assert has_permission("legal_reviewer", "agreement:approve_legal") is True
    assert has_permission("legal_reviewer", "agreement:approve") is False
    assert has_permission("owner", "agreement:approve") is True
    assert has_permission("owner", "agreement:approve_legal") is False


# --------------------------------------------------------------------------
# 3. HTTP layer: client claims never change identity
# --------------------------------------------------------------------------


def test_me_permissions_come_from_the_session_row(sessions, client):
    sessions.login("admin@legalx.demo")
    body = client.get(
        "/api/v1/me",
        headers={"X-Role": "owner", "X-Permissions": "agreement:create"},
        params={"role": "owner"},
    ).json()
    assert set(body["permissions"]) == EXPECTED_MATRIX["org_admin"]
    assert body["user"]["role"] == "org_admin"


def test_admin_cannot_escalate_by_claiming_owner_on_sign_in(sessions, client):
    """Even a crafted sign-in body cannot select a different role."""
    response = client.post(
        "/api/v1/auth/session",
        json={
            "email": "admin@legalx.demo",
            "password": "legalx-demo-2026",
            "role": "owner",
            "permissions": ["agreement:create"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["role"] == "org_admin"
    assert "agreement:create" not in body["permissions"]


def test_every_role_can_reach_me_but_nothing_else_without_permissions(sessions, client):
    """Sanity: /me is available to any live session, in all five roles."""
    for email, role in (
        ("owner@legalx.demo", "owner"),
        ("freelancer@legalx.demo", "freelancer"),
        ("lawyer@legalx.demo", "legal_reviewer"),
        ("admin@legalx.demo", "org_admin"),
        ("auditor@legalx.demo", "technical_auditor"),
    ):
        sessions.login(email)
        response = client.get("/api/v1/me")
        assert response.status_code == 200, email
        assert response.json()["user"]["role"] == role
        assert set(response.json()["permissions"]) == EXPECTED_MATRIX[role]
