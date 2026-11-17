"""P0-04 behaviour tests: create, validation matrix, list, detail, patch.

Proves the §4.2 validation table end to end (the server is authoritative,
§13) and the §4.1/§4.3/§4.4 response contracts.
"""

from __future__ import annotations

from helpers import future_date, past_date, post_agreement, valid_payload

ITEM_KEYS = {
    "id",
    "title",
    "status",
    "currency",
    "total_amount_minor",
    "current_version",
    "approval_policy",
    "parties",
    "created_at",
    "updated_at",
}


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def test_create_agreement_happy_path(sessions, client):
    sessions.login("owner@legalx.demo")
    response = post_agreement(sessions, valid_payload())
    assert response.status_code == 201, response.text
    body = response.json()

    assert set(body.keys()) == ITEM_KEYS | {
        "milestones",
        "extra_terms",
        "current_version_id",
        "created_version",
    }
    assert body["created_version"] == 1
    assert body["current_version"] == 1
    assert body["status"] == "draft"
    assert body["currency"] == "INR"
    assert body["total_amount_minor"] == 5000000
    assert body["approval_policy"] == "all_parties"
    assert len(body["parties"]) == 2
    assert body["parties"][0] == {
        "role": "client",
        "name": "Priya Nair",
        "email": "owner@legalx.demo",
    }
    assert [m["seq"] for m in body["milestones"]] == [1, 2]
    assert all(m["status"] == "pending" for m in body["milestones"])
    assert body["created_at"].endswith("Z")
    assert body["updated_at"].endswith("Z")
    assert body["extra_terms"] == ""
    assert body["current_version_id"]


def test_create_always_creates_version_one(sessions, client, db):
    from api.app.models.agreements import Agreement, AgreementVersion

    sessions.login("owner@legalx.demo")
    body = post_agreement(sessions, valid_payload()).json()

    version = db.get(AgreementVersion, body["current_version_id"])
    assert version is not None
    assert version.version == 1
    assert version.status == "draft"
    assert version.sha256 and len(version.sha256) == 64
    assert version.canonical_length >= 0
    agreement = db.get(Agreement, body["id"])
    assert agreement.current_version_id == version.id


def test_create_writes_activity_event(sessions, client, db):
    from api.app.models.agreements import ActivityEvent, Agreement
    from sqlalchemy import select

    sessions.login("owner@legalx.demo")
    body = post_agreement(sessions, valid_payload()).json()
    events = db.scalars(
        select(ActivityEvent).where(ActivityEvent.agreement_id == body["id"])
    ).all()
    assert [e.event_type for e in events] == ["agreement.created"]
    agreement = db.get(Agreement, body["id"])
    assert agreement is not None


def test_create_requires_authentication(sessions):
    response = post_agreement(sessions, valid_payload())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


# ---------------------------------------------------------------------------
# Validation matrix (contract §4.2 table — the "rejection matrix" of §13)
# ---------------------------------------------------------------------------


def _assert_rejected(response, *, field=None, code=None):
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_FAILED"
    assert isinstance(error["details"], list) and error["details"], error
    assert error["request_id"]
    if field is not None:
        assert any(d["field"] == field for d in error["details"]), (
            f"expected field {field} in {error['details']}"
        )
    if code is not None:
        assert any(d["code"] == code for d in error["details"]), (
            f"expected code {code} in {error['details']}"
        )
    return error


def test_reject_missing_title(sessions, client):
    sessions.login("owner@legalx.demo")
    payload = valid_payload()
    del payload["title"]
    _assert_rejected(post_agreement(sessions, payload), field="title")


def test_reject_title_too_short(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(
        post_agreement(sessions, valid_payload(title="ab")), field="title", code="VALUE_ERROR"
    )


def test_reject_blank_title(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(
        post_agreement(sessions, valid_payload(title="   ")), field="title", code="VALUE_ERROR"
    )


def test_reject_single_party(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(
        post_agreement(sessions, valid_payload(parties=valid_payload()["parties"][:1])),
        field="parties",
    )


def test_reject_duplicate_role_email_pair(sessions, client):
    sessions.login("owner@legalx.demo")
    parties = [
        {"role": "client", "name": "A", "email": "owner@legalx.demo"},
        {"role": "client", "name": "B", "email": "owner@legalx.demo"},
    ]
    _assert_rejected(
        post_agreement(sessions, valid_payload(parties=parties)), field="parties[1].email"
    )


def test_reject_unknown_party_role(sessions, client):
    sessions.login("owner@legalx.demo")
    parties = [
        {"role": "owner", "name": "A", "email": "owner@legalx.demo"},
        {"role": "provider", "name": "B", "email": "freelancer@legalx.demo"},
    ]
    _assert_rejected(
        post_agreement(sessions, valid_payload(parties=parties)), field="parties[0].role"
    )


def test_reject_non_integer_money(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(
        post_agreement(sessions, valid_payload(total_amount_minor=50000.5)),
        field="total_amount_minor",
        code="TYPE_MISMATCH",
    )


def test_reject_string_money(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(
        post_agreement(sessions, valid_payload(total_amount_minor="5000000")),
        field="total_amount_minor",
        code="TYPE_MISMATCH",
    )


def test_reject_zero_money(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(post_agreement(sessions, valid_payload(total_amount_minor=0)))


def test_reject_non_inr_currency(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(
        post_agreement(sessions, valid_payload(currency="USD")), field="currency", code="VALUE_ERROR"
    )


def test_reject_agreement_type_outside_ir_enum(sessions, client):
    """Recorded divergence: 'services' (contract example) is not accepted."""
    sessions.login("owner@legalx.demo")
    _assert_rejected(
        post_agreement(sessions, valid_payload(agreement_type="services")),
        field="agreement_type",
        code="VALUE_ERROR",
    )


def test_reject_no_milestones(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(post_agreement(sessions, valid_payload(milestones=[])), field="milestones")


def test_reject_non_contiguous_seq(sessions, client):
    sessions.login("owner@legalx.demo")
    milestones = valid_payload()["milestones"]
    milestones[1]["seq"] = 3
    _assert_rejected(
        post_agreement(sessions, valid_payload(milestones=milestones)), field="milestones"
    )


def test_reject_duplicate_seq(sessions, client):
    sessions.login("owner@legalx.demo")
    milestones = valid_payload()["milestones"]
    milestones[1]["seq"] = 1
    _assert_rejected(
        post_agreement(sessions, valid_payload(milestones=milestones)), field="milestones"
    )


def test_reject_milestone_sum_mismatch(sessions, client):
    sessions.login("owner@legalx.demo")
    error = _assert_rejected(
        post_agreement(sessions, valid_payload(total_amount_minor=6000000)),
        code="SUM_MISMATCH",
    )
    detail = next(d for d in error["details"] if d["code"] == "SUM_MISMATCH")
    assert detail["field"] == "milestones"
    assert detail["message"] == "5000000 != 6000000"


def test_reject_negative_milestone_amount(sessions, client):
    sessions.login("owner@legalx.demo")
    milestones = valid_payload()["milestones"]
    milestones[0]["amount_minor"] = -100
    _assert_rejected(
        post_agreement(sessions, valid_payload(milestones=milestones)),
        field="milestones[0].amount_minor",
    )


def test_reject_past_due_date(sessions, client):
    sessions.login("owner@legalx.demo")
    milestones = valid_payload()["milestones"]
    milestones[0]["due_date"] = past_date(1)
    _assert_rejected(
        post_agreement(sessions, valid_payload(milestones=milestones)),
        field="milestones[0].due_date",
        code="VALUE_ERROR",
    )


def test_reject_malformed_due_date(sessions, client):
    sessions.login("owner@legalx.demo")
    milestones = valid_payload()["milestones"]
    milestones[0]["due_date"] = "05/12/2026"
    _assert_rejected(
        post_agreement(sessions, valid_payload(milestones=milestones)),
        field="milestones[0].due_date",
    )


def test_reject_review_period_out_of_range(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(post_agreement(sessions, valid_payload(review_period_days=0)))
    _assert_rejected(post_agreement(sessions, valid_payload(review_period_days=91)))


def test_reject_bad_review_period_basis(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(
        post_agreement(sessions, valid_payload(review_period_basis="weekly")),
        field="review_period_basis",
        code="VALUE_ERROR",
    )


def test_reject_bad_approval_policy(sessions, client):
    sessions.login("owner@legalx.demo")
    _assert_rejected(
        post_agreement(sessions, valid_payload(approval_policy="unanimous")),
        field="approval_policy",
        code="VALUE_ERROR",
    )


def test_reject_unknown_field(sessions, client):
    sessions.login("owner@legalx.demo")
    payload = valid_payload()
    payload["organization_id"] = "some-other-org"  # client-supplied scope: refused
    _assert_rejected(post_agreement(sessions, payload))


def test_reject_missing_required_fields(sessions, client):
    sessions.login("owner@legalx.demo")
    for field in ("parties", "milestones", "review_period_days", "approval_policy"):
        payload = valid_payload()
        del payload[field]
        _assert_rejected(post_agreement(sessions, payload), field=field)


def test_reject_client_only_without_client_party(sessions, client):
    sessions.login("owner@legalx.demo")
    parties = [
        {"role": "provider", "name": "A", "email": "freelancer@legalx.demo"},
        {"role": "witness", "name": "B", "email": "lawyer@legalx.demo"},
    ]
    _assert_rejected(
        post_agreement(sessions, valid_payload(parties=parties, approval_policy="client_only")),
        field="approval_policy",
        code="VALUE_ERROR",
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


def test_list_returns_contract_shape(sessions, client):
    sessions.login("owner@legalx.demo")
    post_agreement(sessions, valid_payload(title="First agreement"))
    response = client.get("/api/v1/agreements")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"items", "next_cursor"}
    assert body["next_cursor"] is None
    assert len(body["items"]) == 1
    assert set(body["items"][0].keys()) == ITEM_KEYS


def test_list_pagination_cursor(sessions, client):
    sessions.login("owner@legalx.demo")
    for index in range(3):
        assert post_agreement(sessions, valid_payload(title=f"Agreement {index}")).status_code == 201

    first = client.get("/api/v1/agreements", params={"limit": 2}).json()
    assert len(first["items"]) == 2
    assert first["next_cursor"]

    second = client.get(
        "/api/v1/agreements", params={"limit": 2, "cursor": first["next_cursor"]}
    ).json()
    assert len(second["items"]) == 1
    assert second["next_cursor"] is None

    # No overlap between pages, newest first.
    ids = [i["id"] for i in first["items"]] + [i["id"] for i in second["items"]]
    assert len(set(ids)) == 3
    created = [i["created_at"] for i in first["items"]]
    assert created == sorted(created, reverse=True)


def test_list_rejects_bad_cursor(sessions, client):
    sessions.login("owner@legalx.demo")
    response = client.get("/api/v1/agreements", params={"cursor": "not-a-cursor"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_list_filters_by_status(sessions, client, db):
    from api.app.models.agreements import Agreement
    from sqlalchemy import select

    sessions.login("owner@legalx.demo")
    body = post_agreement(sessions, valid_payload(title="Will be active")).json()

    draft_only = client.get("/api/v1/agreements", params={"status": "draft"}).json()
    assert any(i["id"] == body["id"] for i in draft_only["items"])

    agreement = db.get(Agreement, body["id"])
    agreement.status = "active"
    db.commit()

    active_only = client.get("/api/v1/agreements", params={"status": "active"}).json()
    assert [i["id"] for i in active_only["items"]] == [body["id"]]

    bad = client.get("/api/v1/agreements", params={"status": "bogus"})
    assert bad.status_code == 422


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


def test_detail_shape_and_milestones(sessions, client):
    sessions.login("owner@legalx.demo")
    created = post_agreement(sessions, valid_payload(extra_terms="Net 15 payment terms.")).json()

    response = client.get(f"/api/v1/agreements/{created['id']}")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == ITEM_KEYS | {"milestones", "extra_terms", "current_version_id"}
    assert body["extra_terms"] == "Net 15 payment terms."
    assert body["current_version_id"] == created["current_version_id"]
    assert len(body["milestones"]) == 2
    assert body["milestones"][0]["due_date"]  # YYYY-MM-DD string
    assert body["milestones"][0]["acceptance_criteria"] == "Figma file approved"


def test_detail_cross_workspace_is_404_not_403(sessions, client):
    sessions.login("owner@legalx.demo")
    created = post_agreement(sessions, valid_payload()).json()

    sessions.login("outsider@lexora.demo")  # different workspace, same role
    response = client.get(f"/api/v1/agreements/{created['id']}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_detail_unknown_id_is_404(sessions, client):
    sessions.login("owner@legalx.demo")
    response = client.get("/api/v1/agreements/00000000-0000-4000-8000-000000000000")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Patch
# ---------------------------------------------------------------------------


def test_patch_partial_update_title(sessions, client, db):
    from api.app.models.agreements import Agreement

    sessions.login("owner@legalx.demo")
    created = post_agreement(sessions, valid_payload()).json()

    response = sessions.patch(
        f"/api/v1/agreements/{created['id']}", json={"title": "Renamed project"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"] == "Renamed project"
    # Untouched fields survive.
    assert body["total_amount_minor"] == created["total_amount_minor"]
    assert [m["seq"] for m in body["milestones"]] == [1, 2]

    db.expire_all()
    agreement = db.get(Agreement, created["id"])
    assert agreement.title == "Renamed project"


def test_patch_replaces_milestones_and_keeps_sum_rule(sessions, client):
    sessions.login("owner@legalx.demo")
    created = post_agreement(sessions, valid_payload()).json()

    good = [
        {
            "seq": 1,
            "name": "Single delivery",
            "amount_minor": 5000000,
            "due_date": future_date(40),
            "acceptance_criteria": "Everything shipped",
        }
    ]
    ok = sessions.patch(f"/api/v1/agreements/{created['id']}", json={"milestones": good})
    assert ok.status_code == 200
    assert [m["seq"] for m in ok.json()["milestones"]] == [1]

    bad = [{"seq": 1, "name": "X", "amount_minor": 1, "due_date": future_date(40)}]
    mismatch = sessions.patch(f"/api/v1/agreements/{created['id']}", json={"milestones": bad})
    assert mismatch.status_code == 422
    assert any(
        d["code"] == "SUM_MISMATCH" for d in mismatch.json()["error"]["details"]
    )


def test_patch_blocked_once_current_version_has_approvals(sessions, client, db):
    import uuid as _uuid

    from api.app.models.agreements import Agreement, VersionApproval

    sessions.login("owner@legalx.demo")
    created = post_agreement(sessions, valid_payload()).json()

    db.add(
        VersionApproval(
            id=str(_uuid.uuid4()),
            version_id=created["current_version_id"],
            party_role="client",
            actor_name="Priya Nair",
            confirmed_sha256="0" * 64,
        )
    )
    db.commit()

    response = sessions.patch(
        f"/api/v1/agreements/{created['id']}", json={"title": "Nope"}
    )
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "CONFLICT"
    assert "version" in error["message"].lower()


def test_patch_requires_agreement_edit_permission(sessions, client):
    sessions.login("owner@legalx.demo")
    created = post_agreement(sessions, valid_payload()).json()

    for email in (
        "freelancer@legalx.demo",
        "lawyer@legalx.demo",
        "admin@legalx.demo",
        "auditor@legalx.demo",
    ):
        sessions.login(email)
        response = sessions.patch(
            f"/api/v1/agreements/{created['id']}", json={"title": "Hacked"}
        )
        assert response.status_code == 403, f"{email} must not edit"
        assert response.json()["error"]["code"] == "FORBIDDEN"


def test_patch_cross_workspace_is_404(sessions, client):
    sessions.login("owner@legalx.demo")
    created = post_agreement(sessions, valid_payload()).json()

    sessions.login("outsider@lexora.demo")
    response = sessions.patch(
        f"/api/v1/agreements/{created['id']}", json={"title": "Stolen"}
    )
    assert response.status_code == 404


def test_patch_rejects_null_title(sessions, client):
    sessions.login("owner@legalx.demo")
    created = post_agreement(sessions, valid_payload()).json()
    response = sessions.patch(
        f"/api/v1/agreements/{created['id']}", json={"title": None}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_patch_policy_change_to_client_only_needs_client_party(sessions, client):
    sessions.login("owner@legalx.demo")
    parties = [
        {"role": "provider", "name": "A", "email": "freelancer@legalx.demo"},
        {"role": "witness", "name": "B", "email": "lawyer@legalx.demo"},
    ]
    created = post_agreement(
        sessions, valid_payload(parties=parties, approval_policy="all_parties")
    ).json()
    response = sessions.patch(
        f"/api/v1/agreements/{created['id']}", json={"approval_policy": "client_only"}
    )
    assert response.status_code == 422
    assert any(
        d["field"] == "approval_policy" for d in response.json()["error"]["details"]
    )
