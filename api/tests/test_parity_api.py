"""HTTP integration tests for the bounded parity surface.

Covers the approved matrix: RBAC (403/401), CSRF, org scoping (404), typed
validation, missing clarification, engine-backed blocked results, append-only
persistence, and evidence-only / stale trust-passport reads.
"""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import select

from api.app.models.agreements import Agreement, AgreementVersion, VersionApproval
from api.app.models.verification import (
    ExecutionParametersRow,
    IRDocument,
    ParityRun,
    VerificationRun,
)
from api.app.timeutil import utcnow

EP_MATCH = {"execution_parameters": {"dispute_behavior": "mediate", "governing_law": "India"}}


def _agreement_payload(**overrides):
    from api.tests.helpers import valid_payload

    payload = valid_payload(
        title="Parity integration project",
        dispute_behavior="mediate",
        governing_law="India",
    )
    payload.update(overrides)
    return payload


def _create_agreement(sessions, **overrides):
    from api.tests.helpers import post_agreement

    response = post_agreement(sessions, _agreement_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _post_verify(sessions, agreement_id, version=1, body=None, headers=None):
    merged = dict(sessions.csrf_headers)
    merged.update(headers or {})
    return sessions.client.post(
        f"/api/v1/agreements/{agreement_id}/versions/{version}/verify",
        json=EP_MATCH if body is None else body,
        headers=merged,
    )


def _get_passport(sessions, agreement_id, version=1):
    return sessions.get(
        f"/api/v1/agreements/{agreement_id}/trust-passport?version={version}"
    )


# ---------------------------------------------------------------------------
# Authorized success + persistence
# ---------------------------------------------------------------------------


def test_owner_verify_success_and_append_only_persistence(sessions, db):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = _post_verify(sessions, agreement_id)
    assert response.status_code == 200, response.text
    body = response.json()

    assert set(body) == {
        "result", "verification_run_id", "approvals_complete", "passed", "stale"
    }
    result = body["result"]
    assert result["overall_status"] == "match"
    assert result["is_blocked"] is False
    assert result["agreement_id"] == agreement_id
    assert len(result["version_id"]) == 36
    assert result["approved_ir_hash"] != result["execution_params_hash"]
    assert result["canonicalization_version"] == "v2"
    assert result["parity_rules_version"] == "v1"
    assert result["verified_at"].endswith("Z")
    assert body["stale"] is False
    assert body["approvals_complete"] is False
    # Informational only: no approvals yet, so `passed` is False even on match.
    assert body["passed"] is False

    run_id = body["verification_run_id"]
    assert len(run_id) == 36

    version = db.scalar(
        select(AgreementVersion).where(AgreementVersion.agreement_id == agreement_id)
    )
    ir_rows = db.scalars(select(IRDocument)).all()
    ep_rows = db.scalars(select(ExecutionParametersRow)).all()
    parity_rows = db.scalars(select(ParityRun)).all()
    verification_rows = db.scalars(select(VerificationRun)).all()
    assert (len(ir_rows), len(ep_rows), len(parity_rows), len(verification_rows)) == (1, 1, 1, 1)

    ir = ir_rows[0]
    ep = ep_rows[0]
    row = verification_rows[0]
    parity = parity_rows[0]
    assert (ir.agreement_id, ir.version_id) == (agreement_id, version.id)
    assert ir.derived_by == "deterministic"
    assert ir.ir_sha256 == result["approved_ir_hash"]
    assert (ep.agreement_id, ep.version_id) == (agreement_id, version.id)
    assert ep.source == "derived"
    assert ep.params_sha256 == result["execution_params_hash"]
    assert parity.policy_version == "v1"
    assert parity.passed is True
    assert parity.rows_json == json.dumps(
        result["field_results"], sort_keys=True, separators=(",", ":"), default=str
    )
    assert row.id == run_id
    assert row.organization_id == sessions.current.body["user"]["organization_id"]
    assert row.parity_run_id == parity.id
    assert row.approved_ir_hash == result["approved_ir_hash"]
    assert row.execution_params_hash == result["execution_params_hash"]
    assert row.overall_status == "match"
    assert row.is_blocked is False
    assert row.approvals_complete is False
    assert row.passed is False
    assert json.loads(row.field_results_json) == result["field_results"]

    # Repeat verification appends; the immutable IR snapshot is reused because
    # ir_documents has a UNIQUE(version_id) constraint.
    response2 = _post_verify(sessions, agreement_id)
    assert response2.status_code == 200, response2.text
    assert response2.json()["verification_run_id"] != run_id
    assert len(db.scalars(select(VerificationRun)).all()) == 2
    assert len(db.scalars(select(ParityRun)).all()) == 2
    assert len(db.scalars(select(IRDocument)).all()) == 1
    assert len(db.scalars(select(ExecutionParametersRow)).all()) == 2


def test_legal_reviewer_can_verify(sessions):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    sessions.login("lawyer@legalx.demo")
    response = _post_verify(sessions, agreement_id)
    assert response.status_code == 200, response.text
    assert response.json()["result"]["overall_status"] == "match"


# ---------------------------------------------------------------------------
# Authorization / CSRF / org scoping
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("email", ["freelancer@legalx.demo", "admin@legalx.demo"])
def test_roles_without_verification_run_are_403(sessions, db, email):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    sessions.login(email)
    response = _post_verify(sessions, agreement_id)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
    assert db.scalars(select(VerificationRun)).all() == []


def test_technical_auditor_can_read_but_not_verify(sessions):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)
    assert _post_verify(sessions, agreement_id).status_code == 200

    sessions.login("auditor@legalx.demo")
    assert _post_verify(sessions, agreement_id).status_code == 403
    read = _get_passport(sessions, agreement_id)
    assert read.status_code == 200, read.text


def test_anonymous_requests_are_401(client):
    response = client.post(
        "/api/v1/agreements/00000000-0000-4000-8000-000000000000/versions/1/verify",
        json=EP_MATCH,
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"

    read = client.get("/api/v1/agreements/00000000-0000-4000-8000-000000000000/trust-passport")
    assert read.status_code == 401


def test_verify_without_csrf_token_is_403(sessions, db):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = sessions.client.post(
        f"/api/v1/agreements/{agreement_id}/versions/1/verify", json=EP_MATCH
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_FAILED"
    assert db.scalars(select(VerificationRun)).all() == []


def test_cross_workspace_is_404_on_both_endpoints(sessions):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)
    assert _post_verify(sessions, agreement_id).status_code == 200

    sessions.login("outsider@lexora.demo")
    authored = _post_verify(sessions, agreement_id)
    assert authored.status_code == 404
    assert authored.json()["error"]["code"] == "NOT_FOUND"
    read = _get_passport(sessions, agreement_id)
    assert read.status_code == 404
    assert read.json()["error"]["code"] == "NOT_FOUND"


def test_unknown_version_is_404_on_both_endpoints(sessions):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    assert _post_verify(sessions, agreement_id, version=99).status_code == 404
    assert _get_passport(sessions, agreement_id, version=99).status_code == 404


# ---------------------------------------------------------------------------
# Typed validation / clarification / tampering
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {"execution_parameters": {"dispute_behavior": "mediate", "agreement_id": "x"}},
        {"execution_parameters": {"version_id": "x"}},
        {"execution_parameters": {"schema_version": "v1"}},
        {"execution_parameters": {}, "agreement_id": "x"},
    ],
)
def test_identity_fields_and_extra_body_keys_are_422(sessions, db, body):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = _post_verify(sessions, agreement_id, body=body)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    assert db.scalars(select(VerificationRun)).all() == []


def test_missing_clarification_is_409(sessions, db):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions, dispute_behavior=None, governing_law=None)

    response = _post_verify(sessions, agreement_id, body={"execution_parameters": {}})
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "MISSING_CLARIFICATION"
    assert db.scalars(select(VerificationRun)).all() == []


def test_client_can_clarify_missing_legal_terms(sessions):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions, dispute_behavior=None, governing_law=None)

    response = _post_verify(sessions, agreement_id)
    assert response.status_code == 200, response.text
    assert response.json()["result"]["overall_status"] == "match"


def test_tampered_execution_parameters_block_and_persist(sessions, db):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = _post_verify(
        sessions,
        agreement_id,
        body={
            "execution_parameters": {
                "dispute_behavior": "arbitrate",
                "governing_law": "India",
            }
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()["result"]
    assert result["overall_status"] == "blocked"
    assert result["is_blocked"] is True
    assert result["recommendation"] == "blocked"
    assert "dispute_behavior" in [
        fr["field"] for fr in result["field_results"] if fr["status"] == "blocking"
    ]
    assert response.json()["passed"] is False

    run = db.scalar(select(VerificationRun))
    assert run is not None
    assert run.is_blocked is True
    assert run.overall_status == "blocked"
    assert run.critical_count >= 1
    assert "dispute_behavior" in json.loads(run.blocking_fields_json)


def test_approvals_complete_is_informational_and_grants_no_execution(sessions, db):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions, approval_policy="client_only")

    version = db.scalar(
        select(AgreementVersion).where(AgreementVersion.agreement_id == agreement_id)
    )
    owner = db.scalar(
        select(Agreement).where(Agreement.id == agreement_id)
    )
    db.add(
        VersionApproval(
            id=str(uuid.uuid4()),
            version_id=version.id,
            party_role="client",
            actor_user_id=owner.created_by,
            actor_name="Test Client",
            confirmed_sha256=version.sha256,
            approved_at=utcnow(),
        )
    )
    db.commit()

    response = _post_verify(sessions, agreement_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["approvals_complete"] is True
    assert body["passed"] is True
    assert body["result"]["overall_status"] == "match"

    # A passing verification never executes or activates the agreement.
    agreement = db.scalar(select(Agreement).where(Agreement.id == agreement_id))
    assert agreement.status == "draft"


# ---------------------------------------------------------------------------
# Trust passport
# ---------------------------------------------------------------------------


def test_trust_passport_is_evidence_only_and_detects_stale(sessions, db):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)
    verified = _post_verify(sessions, agreement_id)
    assert verified.status_code == 200, verified.text
    expected = verified.json()["result"]
    run_id = verified.json()["verification_run_id"]

    passport = _get_passport(sessions, agreement_id)
    assert passport.status_code == 200, passport.text
    body = passport.json()
    assert "text" not in body
    assert "ir_json" not in body
    assert body["verification_run_id"] == run_id
    assert body["approved_ir_hash"] == expected["approved_ir_hash"]
    assert body["execution_params_hash"] == expected["execution_params_hash"]
    assert body["canonicalization_version"] == "v2"
    assert body["parity_rules_version"] == "v1"
    assert body["overall_status"] == "match"
    assert body["stale"] is False
    assert isinstance(body["verified_at"], str) and body["verified_at"].endswith("Z")
    assert body["field_results"] == expected["field_results"]

    # Mutate a bound legal fact: the next read must rederive/rehash and report
    # stale instead of replaying the stored "match".
    agreement = db.scalar(select(Agreement).where(Agreement.id == agreement_id))
    agreement.dispute_behavior = "arbitrate"
    db.commit()

    stale = _get_passport(sessions, agreement_id)
    assert stale.status_code == 200, stale.text
    assert stale.json()["stale"] is True
    assert stale.json()["overall_status"] == "stale"
    assert stale.json()["approved_ir_hash"] == expected["approved_ir_hash"]
    assert stale.json()["current_approved_ir_hash"] != expected["approved_ir_hash"]


def test_trust_passport_without_run_is_404(sessions):
    sessions.login("owner@legalx.demo")
    agreement_id = _create_agreement(sessions)

    response = _get_passport(sessions, agreement_id)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
