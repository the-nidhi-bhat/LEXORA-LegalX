"""P0-04 authorization, tenant isolation and idempotency tests.

Endpoint-level enforcement of the D-01 matrix on the agreement routes
(section 2 rows 5-8) plus the 1.4 Idempotency-Key contract.
"""

from __future__ import annotations

import uuid

from helpers import post_agreement, valid_payload


# ---------------------------------------------------------------------------
# Permission matrix on the agreement endpoints (§2)
# ---------------------------------------------------------------------------


def test_unauthenticated_is_401_everywhere(client):
    created_id = "00000000-0000-4000-8000-000000000000"
    assert client.get("/api/v1/agreements").status_code == 401
    assert client.get(f"/api/v1/agreements/{created_id}").status_code == 401
    assert client.post("/api/v1/agreements", json=valid_payload()).status_code == 401
    assert (
        client.patch(f"/api/v1/agreements/{created_id}", json={"title": "x"}).status_code
        == 401
    )


def test_only_owner_can_create(sessions, client):
    sessions.login("owner@legalx.demo")
    assert post_agreement(sessions, valid_payload()).status_code == 201

    for email in (
        "freelancer@legalx.demo",
        "lawyer@legalx.demo",
        "admin@legalx.demo",
        "auditor@legalx.demo",
    ):
        sessions.login(email)
        response = post_agreement(sessions, valid_payload(title=f"By {email}"))
        assert response.status_code == 403, f"{email} must not create"
        assert response.json()["error"]["code"] == "FORBIDDEN"


def test_every_role_with_agreement_view_can_list(sessions, client):
    """D-01: all five roles hold agreement:view — listing works for all."""
    sessions.login("owner@legalx.demo")
    post_agreement(sessions, valid_payload())

    for email in (
        "freelancer@legalx.demo",
        "lawyer@legalx.demo",
        "admin@legalx.demo",
        "auditor@legalx.demo",
    ):
        sessions.login(email)
        response = client.get("/api/v1/agreements")
        assert response.status_code == 200, f"{email} must be able to view"
        assert len(response.json()["items"]) == 1


def test_create_requires_csrf(sessions, client):
    sessions.login("owner@legalx.demo")
    response = client.post("/api/v1/agreements", json=valid_payload())  # no CSRF header
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_FAILED"


def test_wrong_role_claim_in_body_cannot_create(sessions, client):
    """H1 regression: body claims are rejected as unknown fields, not honoured.

    Two independent checks:

    1. an *authorized* caller still gets 422 for forged ``role`` /
       ``permissions`` keys — ``extra="forbid"`` refuses them before any write;
    2. an *unauthorized* freelancer whose body claims owner permissions is
       refused with 403 — the session decides, never the payload.
    """
    # (1) owner session: forged claims are unknown fields, so 422 wins here.
    sessions.login("owner@legalx.demo")
    payload = valid_payload()
    payload["role"] = "owner"
    payload["permissions"] = ["agreement:create"]
    response = sessions.post("/api/v1/agreements", json=payload)
    assert response.status_code == 422  # extra="forbid" — claims never reach authz
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    rejected = {d["field"] for d in response.json()["error"]["details"]}
    assert {"role", "permissions"} <= rejected

    # (2) freelancer session: claiming owner permissions in the body changes
    # nothing — permission is resolved from the session membership row.
    sessions.login("freelancer@legalx.demo")
    forged = valid_payload(title="Freelancer with forged claims")
    forged["role"] = "owner"
    forged["permissions"] = ["agreement:create"]
    denied = sessions.post("/api/v1/agreements", json=forged)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "FORBIDDEN"


# ---------------------------------------------------------------------------
# Tenant isolation (§1.6: cross-workspace is 404, never 403)
# ---------------------------------------------------------------------------


def test_cross_workspace_list_contains_only_own_rows(sessions, client):
    sessions.login("owner@legalx.demo")
    acme_agreement = post_agreement(sessions, valid_payload(title="Acme only")).json()

    sessions.login("outsider@lexora.demo")
    assert post_agreement(sessions, valid_payload(title="Lexora only")).status_code == 201

    listing = client.get("/api/v1/agreements").json()
    titles = [i["title"] for i in listing["items"]]
    assert titles == ["Lexora only"]
    assert acme_agreement["id"] not in [i["id"] for i in listing["items"]]

    # Reading Acme's row from Lexora is a 404 even though the outsider is an
    # owner with every permission — membership is checked first.
    response = client.get(f"/api/v1/agreements/{acme_agreement['id']}")
    assert response.status_code == 404


def test_cross_workspace_writes_are_404_not_403(sessions, client):
    sessions.login("owner@legalx.demo")
    created = post_agreement(sessions, valid_payload()).json()

    sessions.login("outsider@lexora.demo")
    patch = sessions.patch(f"/api/v1/agreements/{created['id']}", json={"title": "x"})
    assert patch.status_code == 404
    # A non-existent id produces the identical response — no oracle.
    missing = sessions.patch(
        "/api/v1/agreements/00000000-0000-4000-8000-000000000000", json={"title": "x"}
    )
    assert missing.status_code == 404
    assert patch.json()["error"]["code"] == missing.json()["error"]["code"]


def test_session_org_decides_tenant_not_body(sessions, client):
    """The workspace comes from the session row; a body org id cannot redirect it."""
    sessions.login("outsider@lexora.demo")
    payload = valid_payload()
    payload["organization_id"] = "acme-digital"  # would be an attempt, but:
    response = sessions.post("/api/v1/agreements", json=payload)
    assert response.status_code == 422  # unknown field — refused before any write

    # With no injected field the row lands in the caller's own workspace.
    clean = post_agreement(sessions, valid_payload(title="Lexora row")).json()
    sessions.login("owner@legalx.demo")
    assert client.get(f"/api/v1/agreements/{clean['id']}").status_code == 404
    listing = client.get("/api/v1/agreements").json()
    assert all(i["id"] != clean["id"] for i in listing["items"])


# ---------------------------------------------------------------------------
# Idempotency-Key (§1.4)
# ---------------------------------------------------------------------------


def test_idempotent_replay_returns_original_response(sessions, client, db):
    from api.app.models.agreements import Agreement
    from sqlalchemy import func, select

    sessions.login("owner@legalx.demo")
    key = str(uuid.uuid4())
    headers = {"Idempotency-Key": key}

    first = post_agreement(sessions, valid_payload(), headers=headers)
    second = post_agreement(sessions, valid_payload(), headers=headers)
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    count = db.scalar(select(func.count()).select_from(Agreement))
    assert count == 1  # no duplicate row


def test_idempotency_key_with_different_body_conflicts(sessions, client):
    sessions.login("owner@legalx.demo")
    key = str(uuid.uuid4())
    headers = {"Idempotency-Key": key}

    assert post_agreement(sessions, valid_payload(), headers=headers).status_code == 201
    conflict = post_agreement(
        sessions, valid_payload(title="Different title"), headers=headers
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "CONFLICT"


def test_idempotency_key_must_be_a_uuid(sessions, client):
    sessions.login("owner@legalx.demo")
    response = post_agreement(sessions, valid_payload(), headers={"Idempotency-Key": "abc"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_without_idempotency_key_creates_are_independent(sessions, client):
    sessions.login("owner@legalx.demo")
    first = post_agreement(sessions, valid_payload())
    second = post_agreement(sessions, valid_payload())
    assert first.json()["id"] != second.json()["id"]


def test_idempotency_key_is_scoped_per_user(sessions, client):
    """The same key from a different user must not replay someone else's row."""
    key = str(uuid.uuid4())
    headers = {"Idempotency-Key": key}

    sessions.login("owner@legalx.demo")
    first = post_agreement(sessions, valid_payload(), headers=headers)
    assert first.status_code == 201

    sessions.login("outsider@lexora.demo")
    second = post_agreement(sessions, valid_payload(), headers=headers)
    assert second.status_code == 201
    assert second.json()["id"] != first.json()["id"]
