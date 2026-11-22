"""Regression tests for duplicate milestone sequence numbers (B-25)."""

import pytest
from pydantic import ValidationError

from api.app.ir.derive import derive_ir_from_agreement
from api.app.schemas.ir import ContractIR, Party, PartyRole


def _base_kwargs(milestones):
    return dict(
        agreement_id="ag-1",
        version_id="ver-1",
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount_minor=200,
        parties=[
            Party(role=PartyRole.CLIENT, name="Client"),
            Party(role=PartyRole.PROVIDER, name="Provider"),
        ],
        milestones=milestones,
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="mediate",
    )


def test_contract_ir_rejects_duplicate_milestone_seqs():
    milestones = [
        {"seq": 1, "name": "A", "amount_minor": 100,
         "due_date": "2027-01-01", "acceptance_criteria": "AC"},
        {"seq": 1, "name": "B", "amount_minor": 100,
         "due_date": "2027-02-01", "acceptance_criteria": "AC"},
    ]
    with pytest.raises(ValidationError, match="Milestone seq values must be unique"):
        ContractIR(**_base_kwargs(milestones))


def test_contract_ir_accepts_distinct_milestone_seqs():
    milestones = [
        {"seq": 1, "name": "A", "amount_minor": 100,
         "due_date": "2027-01-01", "acceptance_criteria": "AC"},
        {"seq": 2, "name": "B", "amount_minor": 100,
         "due_date": "2027-02-01", "acceptance_criteria": "AC"},
    ]
    ir = ContractIR(**_base_kwargs(milestones))
    assert [m.seq for m in ir.milestones] == [1, 2]


def test_derivation_rejects_duplicate_milestone_seqs():
    milestones = [
        {"seq": 1, "name": "A", "amount_minor": 100,
         "due_date": "2027-01-01", "acceptance_criteria": "AC"},
        {"seq": 1, "name": "B", "amount_minor": 100,
         "due_date": "2027-02-01", "acceptance_criteria": "AC"},
    ]
    with pytest.raises(ValueError, match="Milestone seq values must be unique"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=2.00,
            parties=[
                {"role": "client", "name": "Client"},
                {"role": "provider", "name": "Provider"},
            ],
            milestones=milestones,
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
