"""Unit tests for the parity HTTP service translation layer.

These exercise the trusted-input translation without an HTTP call: minor→rupees
conversion, trusted id override, clarification precedence and the 409 raised
when a legal term is missing on both sides. The engine's own rules are covered
by the pre-existing parity test files and are deliberately not duplicated.
"""

from __future__ import annotations

from datetime import date

import pytest

from api.app.errors import ApiError
from api.app.models.agreements import Agreement, AgreementParty, AgreementVersion, Milestone
from api.app.parity.canonicalization import (
    canonicalize_approved_ir,
    canonicalize_execution_params,
)
from api.app.parity.service import build_comparison_inputs
from api.app.schemas.parity import ExecutionParametersInput


AGREEMENT_ID = "11111111-1111-4111-8111-111111111111"
VERSION_ID = "22222222-2222-4222-8222-222222222222"


def _agreement(*, dispute_behavior="mediate", governing_law="India") -> Agreement:
    agreement = Agreement(
        id=AGREEMENT_ID,
        organization_id="org-1",
        created_by="user-1",
        title="Parity fixture",
        agreement_type="service_agreement",
        currency="INR",
        total_amount_minor=5000050,  # ₹50,000.50 — not a whole-rupee amount
        approval_policy="all_parties",
        status="draft",
        review_period_days=5,
        review_period_basis="business",
        extra_terms="",
        dispute_behavior=dispute_behavior,
        governing_law=governing_law,
    )
    agreement.parties = [
        AgreementParty(
            id="p1", agreement_id=AGREEMENT_ID, role="client",
            name="Priya Nair", email="owner@legalx.demo",
        ),
        AgreementParty(
            id="p2", agreement_id=AGREEMENT_ID, role="provider",
            name="Rahul Mehta", email="freelancer@legalx.demo",
        ),
    ]
    agreement.milestones = [
        Milestone(
            id="m1", agreement_id=AGREEMENT_ID, seq=1, name="Design",
            amount_minor=2000000, due_date=date(2026, 12, 1),
            acceptance_criteria="Signed off",
        ),
        Milestone(
            id="m2", agreement_id=AGREEMENT_ID, seq=2, name="Build",
            amount_minor=3000050, due_date=date(2026, 12, 15),
            acceptance_criteria="Deployed",
        ),
    ]
    return agreement


def _version() -> AgreementVersion:
    return AgreementVersion(
        id=VERSION_ID, agreement_id=AGREEMENT_ID, version=1, status="approved",
        text="fixture", sha256="0" * 64, canonical_length=7, created_by="user-1",
    )


def _clarification(dispute_behavior=None, governing_law=None) -> ExecutionParametersInput:
    return ExecutionParametersInput(
        dispute_behavior=dispute_behavior, governing_law=governing_law
    )


def test_minor_to_rupees_round_trips_and_trusted_ids_override_derived_ids():
    """Stored paise survive derivation and DB ids replace synthetic ids."""
    agreement = _agreement()
    inputs = build_comparison_inputs(agreement, _version(), _clarification())

    assert inputs.approved_ir.total_amount_minor == 5000050
    assert inputs.execution_params.total_amount_minor == 5000050
    assert inputs.approved_ir.agreement_id == AGREEMENT_ID
    assert inputs.approved_ir.version_id == VERSION_ID
    assert inputs.execution_params.agreement_id == AGREEMENT_ID
    assert inputs.execution_params.version_id == VERSION_ID

    # The two canonical forms are independent; neither hash may be reused.
    ir_hash = canonicalize_approved_ir(inputs.approved_ir)
    ep_hash = canonicalize_execution_params(inputs.execution_params)
    assert ir_hash != ep_hash
    assert len(ir_hash) == len(ep_hash) == 64


def test_client_declared_terms_differ_from_the_approved_ir():
    """The approved IR uses stored terms; the EP uses client-declared terms.

    A deliberate change must survive translation so the engine can classify it
    as a blocking mismatch rather than being silently overwritten.
    """
    agreement = _agreement(dispute_behavior="mediate", governing_law="India")
    inputs = build_comparison_inputs(
        agreement, _version(), _clarification("arbitrate", "Australia")
    )
    assert inputs.approved_ir.dispute_behavior.value == "mediate"
    assert inputs.approved_ir.governing_law.value == "India"
    assert inputs.execution_params.dispute_behavior.value == "arbitrate"
    assert inputs.execution_params.governing_law.value == "Australia"


def test_omitted_client_terms_adopt_the_approved_terms():
    """When the client omits a legal term, the approved term is used on both sides."""
    agreement = _agreement(dispute_behavior="mediate", governing_law="India")
    inputs = build_comparison_inputs(agreement, _version(), _clarification())
    assert inputs.execution_params.dispute_behavior.value == "mediate"
    assert inputs.execution_params.governing_law.value == "India"


def test_client_clarification_fills_missing_agreement_terms():
    """A client may clarify a gap; both derived inputs then use that value."""
    agreement = _agreement(dispute_behavior=None, governing_law=None)
    inputs = build_comparison_inputs(
        agreement, _version(), _clarification("mediate", "India")
    )
    assert inputs.approved_ir.dispute_behavior.value == "mediate"
    assert inputs.approved_ir.governing_law.value == "India"
    assert inputs.execution_params.dispute_behavior.value == "mediate"
    assert inputs.execution_params.governing_law.value == "India"


@pytest.mark.parametrize(
    "dispute_behavior,governing_law,missing_field",
    [
        (None, None, "dispute_behavior"),
        ("mediate", None, "governing_law"),
        (None, "India", "dispute_behavior"),
    ],
)
def test_missing_clarification_is_409(dispute_behavior, governing_law, missing_field):
    """No legal term is guessed: an unclarified agreement is a typed 409."""
    agreement = _agreement(dispute_behavior=None, governing_law=None)
    with pytest.raises(ApiError) as exc:
        build_comparison_inputs(
            agreement,
            _version(),
            _clarification(dispute_behavior, governing_law),
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "MISSING_CLARIFICATION"
    assert any(missing_field in d["field"] for d in exc.value.details)


def test_request_schema_rejects_identity_and_schema_version():
    """IDs and schema_version are never accepted from a client body."""
    from pydantic import ValidationError

    from api.app.schemas.parity import ParityVerifyRequest

    for bad in (
        {"execution_parameters": {"agreement_id": AGREEMENT_ID}},
        {"execution_parameters": {"version_id": VERSION_ID}},
        {"execution_parameters": {"schema_version": "v1"}},
        {"execution_parameters": {}, "agreement_id": AGREEMENT_ID},
    ):
        with pytest.raises(ValidationError):
            ParityVerifyRequest.model_validate(bad)
