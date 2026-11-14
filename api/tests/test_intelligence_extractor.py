"""Behaviour of the deterministic extraction pipeline."""

import json

import pytest

from api.app.intelligence.errors import ProviderRateLimitError
from api.app.intelligence.extractor import extract_agreement
from api.app.intelligence.models import ExtractionResult
from api.app.intelligence.provider import ScriptedProvider
from api.app.schemas.ir import ir_to_hash

DESCRIPTION = (
    "Freelance milestone agreement between Nidhi Bhat (client) and Sam Rao (provider) "
    "for the design and build of a website. Total fee INR 50,000. "
    "Milestone 1: Design, INR 20,000, due 1 December 2026, acceptance criteria: "
    "signed-off design mockups. Milestone 2: Implementation, INR 30,000, due "
    "15 January 2027, acceptance criteria: site deployed to production. "
    "Review period 30 calendar days. Disputes are resolved by mediation. "
    "Governing law: India."
)


def _payload(**overrides):
    payload = {
        "agreement_type": {"value": "freelance milestone", "evidence": "Freelance milestone agreement"},
        "currency": {"value": "INR", "evidence": "INR"},
        "total_amount": {"value": "INR 50,000", "evidence": "INR 50,000"},
        "parties": [
            {"role": {"value": "client", "evidence": "client"}, "name": {"value": "Nidhi Bhat", "evidence": "Nidhi Bhat"}},
            {"role": {"value": "provider", "evidence": "provider"}, "name": {"value": "Sam Rao", "evidence": "Sam Rao"}},
        ],
        "milestones": [
            {
                "seq": 1,
                "name": {"value": "Design", "evidence": "Milestone 1: Design"},
                "amount": {"value": "INR 20,000", "evidence": "INR 20,000"},
                "due_date": {"value": "1 December 2026", "evidence": "1 December 2026"},
                "acceptance_criteria": {"value": "signed-off design mockups", "evidence": "signed-off design mockups"},
            },
            {
                "seq": 2,
                "name": {"value": "Implementation", "evidence": "Milestone 2: Implementation"},
                "amount": {"value": "INR 30,000", "evidence": "INR 30,000"},
                "due_date": {"value": "15 January 2027", "evidence": "15 January 2027"},
                "acceptance_criteria": {"value": "site deployed to production", "evidence": "site deployed to production"},
            },
        ],
        "review_period_days": {"value": "30", "evidence": "30 calendar days"},
        "review_period_basis": {"value": "calendar", "evidence": "calendar days"},
        "dispute_behavior": {"value": "mediation", "evidence": "mediation"},
        "governing_law": {"value": "India", "evidence": "India"},
    }
    payload.update(overrides)
    return payload


def _provider(payload):
    return ScriptedProvider([json.dumps(payload, ensure_ascii=False)])


# ---- Happy path ----

def test_complete_description_produces_draft_ir():
    """A complete description produces a validated draft IR."""
    result = extract_agreement(DESCRIPTION, _provider(_payload()))
    assert result.status == "complete"
    assert result.contract_ir is not None
    ir = result.contract_ir
    assert ir.currency.value == "INR"
    assert ir.total_amount_minor == 5000000
    assert [p.role.value for p in ir.parties] == ["client", "provider"]
    assert [m.amount_minor for m in ir.milestones] == [2000000, 3000000]
    assert ir.milestones[0].due_date.isoformat() == "2026-12-01"
    assert ir.review_period_days == 30
    assert ir.governing_law.value == "India"


def test_extraction_never_approves():
    """The pipeline cannot approve a contract."""
    result = extract_agreement(DESCRIPTION, _provider(_payload()))
    assert result.approved is False
    assert result.human_review_required is True


def test_result_rejects_an_attempt_to_set_approved():
    """Setting approved=True is a validation error, not a silent success."""
    with pytest.raises(Exception):
        ExtractionResult(status="complete", approved=True)


def test_provenance_spans_point_at_the_source():
    """Every provenance entry points at real text and carries the quote."""
    result = extract_agreement(DESCRIPTION, _provider(_payload()))
    assert result.provenance
    for entry in result.provenance:
        span = entry.source_span
        encoded = DESCRIPTION.encode("utf-8")
        assert encoded[span.start:span.end].decode("utf-8") == entry.quote


def test_confidence_is_recorded_only_when_the_provider_returns_it():
    """Confidence is carried through, and is never invented."""
    payload = _payload()
    payload["currency"] = dict(payload["currency"], confidence=0.77)
    result = extract_agreement(DESCRIPTION, _provider(payload))
    currency_entry = [e for e in result.provenance if e.field == "currency"]
    assert currency_entry[0].confidence == 0.77
    other = [e for e in result.provenance if e.field == "total_amount_minor"]
    assert other[0].confidence is None


def test_confidence_in_provenance_does_not_change_the_ir_hash():
    """Provenance (and therefore confidence) is outside the legally hashed fields."""
    from api.app.schemas.ir import ContractIR, Party, PartyRole

    base = ContractIR(
        agreement_id="ag-001",
        version_id="ver-001",
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name="Nidhi Bhat"),
            Party(role=PartyRole.PROVIDER, name="Sam Rao"),
        ],
        milestones=[
            {
                "seq": 1,
                "name": "Design",
                "amount_minor": 5000000,
                "due_date": "2026-12-01",
                "acceptance_criteria": "OK",
            }
        ],
        review_period_days=30,
        review_period_basis="calendar",
        dispute_behavior="mediate",
    )
    with_provenance = base.model_copy(
        update={
            "provenance": [
                {
                    "field": "total_amount_minor",
                    "source_span": {"start": 0, "end": 10},
                    "quote": "INR 50,000",
                    "confidence": 0.4,
                }
            ]
        }
    )
    assert ir_to_hash(base) == ir_to_hash(with_provenance)


def test_extracted_draft_can_be_compared_by_the_parity_engine():
    """The P1-04 draft is consumable by the P0-07 parity engine."""
    from api.app.parity import ExecutionParameters, ParityEngine

    result = extract_agreement(DESCRIPTION, _provider(_payload()))
    ir = result.contract_ir
    params = ExecutionParameters(
        agreement_id=ir.agreement_id,
        version_id=ir.version_id,
        agreement_type=ir.agreement_type.value,
        currency=ir.currency.value,
        total_amount_minor=ir.total_amount_minor,
        parties=[{"role": p.role.value, "name": p.name} for p in ir.parties],
        milestones=[
            {
                "seq": m.seq,
                "name": m.name,
                "amount_minor": m.amount_minor,
                "due_date": m.due_date.isoformat(),
                "acceptance_criteria": m.acceptance_criteria,
            }
            for m in ir.milestones
        ],
        review_period_days=ir.review_period_days,
        review_period_basis=ir.review_period_basis.value,
        dispute_behavior=ir.dispute_behavior.value,
        governing_law=ir.governing_law.value if ir.governing_law else None,
    )
    parity = ParityEngine(ir, params).compare()
    assert parity.overall_status == "match"


# ---- Missing and ambiguous information ----

def test_missing_amount_produces_clarification_not_a_default():
    """A missing amount becomes a clarification, never a default value."""
    payload = _payload(total_amount=None)
    result = extract_agreement(DESCRIPTION, _provider(payload))
    assert result.status == "needs_clarification"
    assert result.contract_ir is None
    assert any(m.field == "total_amount_minor" for m in result.missing_fields)
    assert any(c.field == "total_amount_minor" for c in result.clarifications)


def test_ambiguous_date_produces_clarification():
    """A relative due date is not guessed."""
    payload = _payload()
    payload["milestones"] = [dict(payload["milestones"][0])]
    payload["milestones"][0]["due_date"] = {
        "value": "within 45 days of kickoff",
        "evidence": "within 45 days of kickoff",
    }
    description = DESCRIPTION + " The milestone is due within 45 days of kickoff."
    result = extract_agreement(description, _provider(payload))
    assert result.status == "needs_clarification"
    assert any(m.field == "milestones[0].due_date" for m in result.missing_fields)


def test_missing_client_role_produces_clarification():
    """A payload without a client party cannot become a draft."""
    payload = _payload()
    payload["parties"] = [payload["parties"][1]]
    result = extract_agreement(DESCRIPTION, _provider(payload))
    assert result.status == "needs_clarification"
    assert result.contract_ir is None
    assert any(m.field == "parties" for m in result.missing_fields)


def test_conflicting_party_identity_produces_clarification():
    """Two parties sharing one email is a conflict, not a fact."""
    payload = _payload()
    payload["parties"][0]["email"] = {
        "value": "nidhi@legalx.demo",
        "evidence": "nidhi@legalx.demo",
    }
    payload["parties"][1]["email"] = {
        "value": "nidhi@legalx.demo",
        "evidence": "nidhi@legalx.demo",
    }
    description = DESCRIPTION + " Contact nidhi@legalx.demo for both parties."
    result = extract_agreement(description, _provider(payload))
    assert result.status == "needs_clarification"
    assert any(m.field == "parties[1].email" for m in result.missing_fields)


def test_milestone_sum_mismatch_produces_clarification():
    """Milestone amounts that do not add up to the total are surfaced."""
    payload = _payload()
    payload["total_amount"] = {"value": "INR 60,000", "evidence": "INR 60,000"}
    description = DESCRIPTION + " The fee is INR 60,000 in total."
    result = extract_agreement(description, _provider(payload))
    assert result.status == "needs_clarification"
    assert any(m.field == "total_amount_minor" for m in result.missing_fields)


# ---- Unsupported and malformed provider output ----

def test_value_without_matching_evidence_is_discarded():
    """A value whose quote is absent from the source is never accepted."""
    payload = _payload()
    payload["total_amount"] = {"value": "INR 9,99,999", "evidence": "INR 9,99,999"}
    result = extract_agreement(DESCRIPTION, _provider(payload))
    assert result.status == "needs_clarification"
    assert result.contract_ir is None
    assert any(m.field == "total_amount_minor" for m in result.missing_fields)


def test_unsupported_terms_are_reported_not_dropped():
    """Terms with no IR field are surfaced for legal review."""
    payload = _payload()
    payload["unsupported_terms"] = [
        {"value": "two-year non-compete", "evidence": "two-year non-compete"}
    ]
    description = DESCRIPTION + " The provider also accepts a two-year non-compete."
    result = extract_agreement(description, _provider(payload))
    assert result.status == "complete"
    assert result.unsupported_terms == ["two-year non-compete"]
    assert result.warnings


def test_unknown_payload_field_is_rejected():
    """An injected approval flag is rejected instead of being ignored."""
    payload = _payload()
    payload["approved"] = True
    result = extract_agreement(DESCRIPTION, _provider(payload))
    assert result.status == "rejected"
    assert result.contract_ir is None
    assert any("approved" in reason for reason in result.rejected_reasons)


def test_malformed_provider_output_is_rejected():
    """Non-JSON provider output is rejected, not half-parsed."""
    provider = ScriptedProvider(["this is not json"])
    result = extract_agreement(DESCRIPTION, provider)
    assert result.status == "rejected"
    assert result.rejected_reasons


def test_provider_failure_is_reported_as_a_provider_error():
    """A provider outage produces a provider_error, never an empty success."""
    provider = ScriptedProvider([], error=ProviderRateLimitError("rate limited"))
    result = extract_agreement(DESCRIPTION, provider)
    assert result.status == "provider_error"
    assert result.retryable is True
    assert result.contract_ir is None
    assert result.approved is False


def test_empty_description_is_rejected():
    """An empty description cannot produce a draft."""
    result = extract_agreement("   ", _provider(_payload()))
    assert result.status == "rejected"
    assert result.contract_ir is None
