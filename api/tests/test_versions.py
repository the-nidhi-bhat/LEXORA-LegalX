"""P0-05 tests: versions, canonical hashing, approvals (API_CONTRACTS.md §5).

Proves: monotonic version numbers, byte-for-byte text immutability, the
canonical SHA-256 rules (EXECUTION_PLAN §7), the approval permission +
required-party rule, D-06 computed ``is_fully_approved``, 409
``ALREADY_APPROVED``, 422 ``HASH_MISMATCH``, and the lifecycle transition
draft → active when the *current* version becomes fully approved.
"""

from __future__ import annotations

from helpers import post_agreement, valid_payload

from api.app.hashing import canonical_sha256

VERSION_KEYS = {
    "version_id",
    "version",
    "status",
    "sha256",
    "hash_algorithm",
    "canonical_length",
    "created_at",
    "created_by",
    "is_fully_approved",
    "required_approvals",
    "approvals",
}

APPROVAL_KEYS = {"party_role", "actor_name", "approved_at", "confirmed_sha256"}

ITEM_KEYS = {
    "version",
    "status",
    "sha256",
    "created_at",
    "created_by",
    "is_fully_approved",
    "approvals",
}


def _create_agreement(sessions, **overrides) -> dict:
    body = valid_payload(**overrides)
    response = post_agreement(sessions, body)
    assert response.status_code == 201, response.text
    return response.json()


def _create_v2(sessions, agreement_id: str, text: str = "1. Scope\n2. Payment\n"):
    return sessions.post(
        f"/api/v1/agreements/{agreement_id}/versions",
        json={"text": text, "change_summary": "First real draft"},
    )


def _approve(sessions, agreement_id: str, version: int, sha256: str):
    return sessions.post(
        f"/api/v1/agreements/{agreement_id}/versions/{version}/approve",
        json={"confirm_sha256": sha256},
    )


# ---------------------------------------------------------------------------
# POST …/versions
# ---------------------------------------------------------------------------


def test_create_version_happy_path(sessions, client, db):
    from api.app.models.auth import User
    from sqlalchemy import select

    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)

    response = _create_v2(sessions, agreement["id"])
    assert response.status_code == 201, response.text
    body = response.json()

    assert set(body.keys()) == VERSION_KEYS
    assert body["version"] == 2  # v1 was created with the agreement
    assert body["status"] == "draft"
    assert body["hash_algorithm"] == "sha256"
    assert body["is_fully_approved"] is False
    assert body["required_approvals"] == ["client", "provider"]
    assert body["approvals"] == []
    assert body["created_at"].endswith("Z")

    expected_sha, expected_len = canonical_sha256("1. Scope\n2. Payment\n")
    assert body["sha256"] == expected_sha
    assert body["canonical_length"] == expected_len

    owner = db.scalar(select(User).where(User.email == "owner@legalx.demo"))
    assert body["created_by"] == owner.id
    assert len(body["created_by"]) == 36


def test_new_version_becomes_current_and_restamps_milestones(sessions, client, db):
    from api.app.models.agreements import Milestone
    from sqlalchemy import select

    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)

    created = _create_v2(sessions, agreement["id"]).json()

    detail = client.get(f"/api/v1/agreements/{agreement['id']}").json()
    assert detail["current_version"] == 2
    assert detail["current_version_id"] == created["version_id"]

    stamps = db.scalars(
        select(Milestone.version_id).where(Milestone.agreement_id == agreement["id"])
    ).all()
    assert stamps and set(stamps) == {created["version_id"]}


def test_version_numbers_are_monotonic_never_reused(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)

    v2 = _create_v2(sessions, agreement["id"], text="draft two").json()
    v3 = _create_v2(sessions, agreement["id"], text="draft three").json()
    assert (v2["version"], v3["version"]) == (2, 3)

    listing = client.get(f"/api/v1/agreements/{agreement['id']}/versions").json()
    assert [i["version"] for i in listing["items"]] == [3, 2, 1]


def test_canonical_hash_normalizes_crlf_trailing_space_and_blank_lines(sessions, client):
    """CRLF→LF, per-line trailing whitespace stripped, outer blanks trimmed."""
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)

    messy = "\r\n1. Scope  \r\n2. Payment\t\r\n\r\n\r\n"
    clean = "1. Scope\n2. Payment"

    messy_body = _create_v2(sessions, agreement["id"], text=messy).json()
    clean_body = _create_v2(sessions, agreement["id"], text=clean).json()

    assert messy_body["sha256"] == clean_body["sha256"]
    expected_sha, expected_len = canonical_sha256(messy)
    assert messy_body["sha256"] == expected_sha
    assert messy_body["canonical_length"] == expected_len


def test_version_text_is_stored_verbatim_and_never_returned(sessions, client, db):
    from api.app.models.agreements import AgreementVersion
    from sqlalchemy import select

    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    original = "A\r\nB  \r\n"
    created = _create_v2(sessions, agreement["id"], text=original).json()

    # Stored byte-for-byte (CRLF intact), while the hash used the canonical form.
    row = db.get(AgreementVersion, created["version_id"])
    assert row.text == original
    assert row.sha256 == canonical_sha256(original)[0]

    # The listing never exposes text (§5.3: only roles that may read it).
    listing = client.get(f"/api/v1/agreements/{agreement['id']}/versions").json()
    for item in listing["items"]:
        assert "text" not in item
        assert "change_summary" not in item


def test_create_version_permission_matrix(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    path = f"/api/v1/agreements/{agreement['id']}/versions"
    payload = {"text": "x" * 10, "change_summary": "s"}

    for email in (
        "freelancer@legalx.demo",
        "lawyer@legalx.demo",
        "admin@legalx.demo",
        "auditor@legalx.demo",
    ):
        sessions.login(email)
        response = sessions.post(path, json=payload)
        assert response.status_code == 403, f"{email} must not create versions"
        assert response.json()["error"]["code"] == "FORBIDDEN"


def test_create_version_unauthenticated_csrf_and_cross_workspace(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    path = f"/api/v1/agreements/{agreement['id']}/versions"
    payload = {"text": "1. Scope", "change_summary": "s"}

    # No session at all.
    client.cookies.clear()
    assert client.post(path, json=payload).status_code == 401

    # Session but no CSRF header.
    sessions.login("owner@legalx.demo")
    no_csrf = client.post(path, json=payload)
    assert no_csrf.status_code == 403
    assert no_csrf.json()["error"]["code"] == "CSRF_FAILED"

    # Cross-workspace id → 404 (indistinguishable from unknown).
    sessions.login("outsider@lexora.demo")
    cross = sessions.post(path, json=payload)
    assert cross.status_code == 404
    assert cross.json()["error"]["code"] == "NOT_FOUND"


def test_create_version_validation(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    path = f"/api/v1/agreements/{agreement['id']}/versions"

    blank = sessions.post(path, json={"text": "   ", "change_summary": "s"})
    assert blank.status_code == 422
    assert blank.json()["error"]["code"] == "VALIDATION_FAILED"

    missing = sessions.post(path, json={"text": "1. Scope"})
    assert missing.status_code == 422

    extra = sessions.post(
        path, json={"text": "1. Scope", "change_summary": "s", "version": 7}
    )
    assert extra.status_code == 422


def test_create_version_idempotency(sessions, client, db):
    import uuid

    from api.app.models.agreements import AgreementVersion
    from sqlalchemy import func, select

    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    key = str(uuid.uuid4())
    headers = {"Idempotency-Key": key}
    path = f"/api/v1/agreements/{agreement['id']}/versions"
    payload = {"text": "1. Scope", "change_summary": "s"}

    first = sessions.post(path, json=payload, headers=headers)
    second = sessions.post(path, json=payload, headers=headers)
    assert first.status_code == second.status_code == 201
    assert first.json()["version_id"] == second.json()["version_id"]

    count = db.scalar(
        select(func.count())
        .select_from(AgreementVersion)
        .where(AgreementVersion.agreement_id == agreement["id"])
    )
    assert count == 2  # v1 + exactly one new version

    conflict = sessions.post(
        path, json={"text": "different body", "change_summary": "s"}, headers=headers
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "CONFLICT"


# ---------------------------------------------------------------------------
# GET …/versions
# ---------------------------------------------------------------------------


def test_list_versions_shape_order_and_cross_workspace(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    _create_v2(sessions, agreement["id"])
    _create_v2(sessions, agreement["id"], text="third draft")

    response = client.get(f"/api/v1/agreements/{agreement['id']}/versions")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"items"}
    assert [i["version"] for i in body["items"]] == [3, 2, 1]
    for item in body["items"]:
        assert set(item.keys()) == ITEM_KEYS
        assert item["approvals"] == []
        assert item["is_fully_approved"] is False
        assert len(item["sha256"]) == 64
        assert item["created_at"].endswith("Z")

    # Cross-workspace and unknown ids are both 404.
    sessions.login("outsider@lexora.demo")
    assert (
        client.get(f"/api/v1/agreements/{agreement['id']}/versions").status_code == 404
    )
    sessions.login("owner@legalx.demo")
    assert (
        client.get(
            "/api/v1/agreements/00000000-0000-4000-8000-000000000000/versions"
        ).status_code
        == 404
    )


# ---------------------------------------------------------------------------
# POST …/approve
# ---------------------------------------------------------------------------


def test_approve_requires_matching_hash(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    created = _create_v2(sessions, agreement["id"]).json()

    wrong = _approve(sessions, agreement["id"], 2, "0" * 64)
    assert wrong.status_code == 422
    assert wrong.json()["error"]["code"] == "HASH_MISMATCH"

    # Confirming with another version's server-issued hash is also a mismatch.
    v1_sha = client.get(f"/api/v1/agreements/{agreement['id']}/versions").json()[
        "items"
    ][-1]["sha256"]
    mismatched = _approve(sessions, agreement["id"], 2, v1_sha)
    assert mismatched.status_code == 422
    assert mismatched.json()["error"]["code"] == "HASH_MISMATCH"

    # …while the server-issued hash of that exact version succeeds.
    ok = _approve(sessions, agreement["id"], 2, created["sha256"])
    assert ok.status_code == 201


def test_approve_response_shape_and_computed_approval_state(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    created = _create_v2(sessions, agreement["id"]).json()

    first = _approve(sessions, agreement["id"], 2, created["sha256"])
    assert first.status_code == 201, first.text
    body = first.json()
    assert set(body.keys()) == {"version", "approvals", "required_approvals", "is_fully_approved"}
    assert body["version"] == 2
    assert body["required_approvals"] == ["client", "provider"]
    assert body["is_fully_approved"] is False  # provider has not approved yet
    assert len(body["approvals"]) == 1
    approval = body["approvals"][0]
    assert set(approval.keys()) == APPROVAL_KEYS
    assert approval["party_role"] == "client"
    assert approval["confirmed_sha256"] == created["sha256"]
    assert approval["approved_at"].endswith("Z")
    assert approval["actor_name"]  # server-side identity, not client-supplied


def test_full_approval_activates_current_version(sessions, client, db):
    from api.app.models.agreements import Agreement, ActivityEvent
    from sqlalchemy import select

    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    created = _create_v2(sessions, agreement["id"]).json()

    # Client (owner@) approves first — still incomplete.
    assert _approve(sessions, agreement["id"], 2, created["sha256"]).status_code == 201

    # Provider (freelancer@) approves the same version — now complete.
    sessions.login("freelancer@legalx.demo")
    second = _approve(sessions, agreement["id"], 2, created["sha256"])
    assert second.status_code == 201
    assert second.json()["is_fully_approved"] is True

    # D-06: the flag is computed from rows and reflected everywhere.
    listing = client.get(f"/api/v1/agreements/{agreement['id']}/versions").json()
    v2 = next(i for i in listing["items"] if i["version"] == 2)
    assert v2["status"] == "approved"
    assert v2["is_fully_approved"] is True
    assert len(v2["approvals"]) == 2

    # Lifecycle: the agreement becomes active once the current version is fully approved.
    detail = client.get(f"/api/v1/agreements/{agreement['id']}").json()
    assert detail["status"] == "active"

    db.expire_all()
    stored = db.get(Agreement, agreement["id"])
    assert stored.status == "active"

    events = db.scalars(
        select(ActivityEvent.event_type).where(
            ActivityEvent.agreement_id == agreement["id"]
        )
    ).all()
    assert "version.created" in events
    assert "version.approved" in events


def test_duplicate_approval_is_409_ALREADY_APPROVED(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    created = _create_v2(sessions, agreement["id"]).json()

    assert _approve(sessions, agreement["id"], 2, created["sha256"]).status_code == 201
    duplicate = _approve(sessions, agreement["id"], 2, created["sha256"])
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ALREADY_APPROVED"


def test_non_required_party_cannot_approve(sessions, client):
    """agreement:approve held, but the caller is not a party (§2 row 11)."""
    sessions.login("owner@legalx.demo")
    # provider is the lawyer, so the freelancer holds permission but no seat.
    agreement = _create_agreement(
        sessions,
        parties=[
            {"role": "client", "name": "Priya Nair", "email": "owner@legalx.demo"},
            {"role": "provider", "name": "Legal Reviewer", "email": "lawyer@legalx.demo"},
        ],
    )
    created = _create_v2(sessions, agreement["id"]).json()

    sessions.login("freelancer@legalx.demo")  # has agreement:approve, not a party
    response = _approve(sessions, agreement["id"], 2, created["sha256"])
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_approve_requires_permission_and_session(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    created = _create_v2(sessions, agreement["id"]).json()
    path = f"/api/v1/agreements/{agreement['id']}/versions/2/approve"
    payload = {"confirm_sha256": created["sha256"]}

    for email in ("admin@legalx.demo", "auditor@legalx.demo"):
        sessions.login(email)
        response = sessions.post(path, json=payload)
        assert response.status_code == 403, f"{email} lacks agreement:approve"

    client.cookies.clear()
    assert client.post(path, json=payload).status_code == 401

    sessions.login("owner@legalx.demo")
    no_csrf = client.post(path, json=payload)
    assert no_csrf.status_code == 403
    assert no_csrf.json()["error"]["code"] == "CSRF_FAILED"


def test_approve_unknown_version_and_cross_workspace(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    created = _create_v2(sessions, agreement["id"]).json()

    missing = _approve(sessions, agreement["id"], 99, created["sha256"])
    assert missing.status_code == 404

    sessions.login("outsider@lexora.demo")
    cross = _approve(sessions, agreement["id"], 2, created["sha256"])
    assert cross.status_code == 404
    assert cross.json()["error"]["code"] == "NOT_FOUND"


def test_approve_payload_validation(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    path = f"/api/v1/agreements/{agreement['id']}/versions/1/approve"

    bad_hex = sessions.post(path, json={"confirm_sha256": "Z" * 64})
    assert bad_hex.status_code == 422
    assert bad_hex.json()["error"]["code"] == "VALIDATION_FAILED"

    short = sessions.post(path, json={"confirm_sha256": "abc"})
    assert short.status_code == 422

    extra = sessions.post(path, json={"confirm_sha256": "0" * 64, "note": "hi"})
    assert extra.status_code == 422


def test_client_only_policy_needs_single_approval(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions, approval_policy="client_only")
    created = _create_v2(sessions, agreement["id"]).json()
    assert created["required_approvals"] == ["client"]

    # The provider is not required under client_only → 403.
    sessions.login("freelancer@legalx.demo")
    assert _approve(sessions, agreement["id"], 2, created["sha256"]).status_code == 403

    # The client alone completes the policy.
    sessions.login("owner@legalx.demo")
    final = _approve(sessions, agreement["id"], 2, created["sha256"])
    assert final.status_code == 201
    assert final.json()["is_fully_approved"] is True


def test_full_approval_blocks_patch_but_allows_new_version(sessions, client):
    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)

    # Fully approve the *current* version (v1, empty text) in place.
    v1_sha = client.get(f"/api/v1/agreements/{agreement['id']}/versions").json()[
        "items"
    ][0]["sha256"]
    assert _approve(sessions, agreement["id"], 1, v1_sha).status_code == 201
    sessions.login("freelancer@legalx.demo")
    assert _approve(sessions, agreement["id"], 1, v1_sha).status_code == 201

    # §4.4: the approved version is frozen for edits…
    sessions.login("owner@legalx.demo")
    patch = sessions.patch(
        f"/api/v1/agreements/{agreement['id']}", json={"title": "Renamed"}
    )
    assert patch.status_code == 409
    assert patch.json()["error"]["code"] == "CONFLICT"

    # …but a new draft version re-opens editing (§5.1 flow).
    created = _create_v2(sessions, agreement["id"]).json()
    assert created["version"] == 2
    detail = client.get(f"/api/v1/agreements/{agreement['id']}").json()
    assert detail["status"] == "draft"  # re-opened by the new current version
    assert detail["current_version"] == 2

    again = sessions.patch(
        f"/api/v1/agreements/{agreement['id']}", json={"title": "Renamed"}
    )
    assert again.status_code == 200

    # The old version keeps its approvals and approved status (immutability).
    listing = client.get(f"/api/v1/agreements/{agreement['id']}/versions").json()
    v1 = next(i for i in listing["items"] if i["version"] == 1)
    assert v1["status"] == "approved"
    assert v1["is_fully_approved"] is True
    assert len(v1["approvals"]) == 2


def test_approving_non_current_version_does_not_activate(sessions, client, db):
    from api.app.models.agreements import Agreement

    sessions.login("owner@legalx.demo")
    agreement = _create_agreement(sessions)
    v1_sha = client.get(f"/api/v1/agreements/{agreement['id']}/versions").json()[
        "items"
    ][-1]["sha256"]

    # Move current to v2 first.
    _create_v2(sessions, agreement["id"])

    # Fully approve the *older* v1 — the agreement must stay draft because
    # the current version (v2) has no approvals.
    assert _approve(sessions, agreement["id"], 1, v1_sha).status_code == 201
    sessions.login("freelancer@legalx.demo")
    assert _approve(sessions, agreement["id"], 1, v1_sha).status_code == 201

    sessions.login("owner@legalx.demo")
    detail = client.get(f"/api/v1/agreements/{agreement['id']}").json()
    assert detail["status"] == "draft"
    assert detail["current_version"] == 2

    listing = client.get(f"/api/v1/agreements/{agreement['id']}/versions").json()
    v1 = next(i for i in listing["items"] if i["version"] == 1)
    assert v1["is_fully_approved"] is True
