"""Blocking/advisory rule validation tests.

Verifies the field-by-field comparison logic with blocking/advisory classification.
"""

from api.app.schemas.ir import ContractIR, Party, PartyRole, Milestone
from api.app.parity.execution_parameters import ExecutionParameters
from api.app.parity.engine import ParityEngine
from api.app.parity.result_schema import ParityResult


# ---- Party comparison rules ----
def test_party_blocking_client_missing():
    """Missing client party is blocking (tested via comparison_rules directly)."""
    from api.app.parity.comparison_rules import compare_parties
    # Approved has client+provider, execution is missing client
    approved_parties = [
        Party(role=PartyRole.CLIENT, name='Nidhi'),
        Party(role=PartyRole.PROVIDER, name='Sam'),
    ]
    exec_parties = [
        Party(role=PartyRole.PROVIDER, name='Sam'),
    ]
    results = compare_parties(approved_parties, exec_parties)
    blocking = [r for r in results if r.status == 'blocking']
    assert len(blocking) > 0
    assert any('client' in (r.error or '').lower() for r in blocking)


def test_party_blocking_provider_missing():
    """Missing provider party is blocking (tested via comparison_rules directly)."""
    from api.app.parity.comparison_rules import compare_parties
    approved_parties = [
        Party(role=PartyRole.CLIENT, name='Nidhi'),
        Party(role=PartyRole.PROVIDER, name='Sam'),
    ]
    exec_parties = [
        Party(role=PartyRole.CLIENT, name='Nidhi'),
    ]
    results = compare_parties(approved_parties, exec_parties)
    blocking = [r for r in results if r.status == 'blocking']
    assert len(blocking) > 0
    assert any('provider' in (r.error or '').lower() for r in blocking)


def test_party_advisory_witness_present_in_approved_missing_from_exec():
    """Witness present in approved but missing from exec is advisory."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert not result.is_blocked
    assert result.has_advisory_diffs
    assert result.overall_status == 'advisory'


def test_party_advisory_witness_missing_in_approved_present_in_exec():
    """Witness missing from approved but present in exec is advisory."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert not result.is_blocked
    assert result.has_advisory_diffs
    assert result.overall_status == 'advisory'


# ---- Milestone comparison rules ----
def test_milestone_blocking_extra_milestone():
    """Extra milestone in execution (not in approved) is blocking."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000001,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[
            {'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'},
            {'seq': 3, 'name': 'Extra', 'amount_minor': 1, 'due_date': '2027-01-01', 'acceptance_criteria': 'New'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'
    # Check extra milestone detection
    extra_results = [fr for fr in result.field_results if 'milestones[3]' in fr.field and fr.status == 'blocking']
    assert len(extra_results) > 0


def test_milestone_blocking_missing_milestone():
    """Missing milestone from approved is blocking."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[
            Milestone(seq=1, name='Design', amount_minor=2000000, due_date='2026-12-01', acceptance_criteria='OK'),
            Milestone(seq=2, name='Implementation', amount_minor=3000000, due_date='2027-01-15', acceptance_criteria='Completed')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'


def test_milestone_blocking_amount_mismatch():
    """Milestone amount mismatch is blocking."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[
            Milestone(seq=1, name='Design', amount_minor=2000000, due_date='2026-12-01', acceptance_criteria='OK'),
            Milestone(seq=2, name='Implementation', amount_minor=3000000, due_date='2027-01-15', acceptance_criteria='Completed')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[
            {'seq': 1, 'name': 'Design', 'amount_minor': 2500000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'},
            {'seq': 2, 'name': 'Implementation', 'amount_minor': 2500000, 'due_date': '2027-01-15', 'acceptance_criteria': 'Completed'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    # Check that the amount mismatch field result has blocking status and error
    amount_results = [fr for fr in result.field_results if fr.field == 'milestones[1].amount_minor' and fr.status == 'blocking']
    assert len(amount_results) > 0
    assert amount_results[0].error is not None


def test_milestone_advisory_acceptance_criteria_difference():
    """Milestone acceptance criteria difference is advisory."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='Signed off')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'Completed'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert not result.is_blocked
    assert result.has_advisory_diffs
    # Check acceptance_criteria field has advisory status
    ac_results = [fr for fr in result.field_results if fr.field == 'milestones[1].acceptance_criteria' and fr.status == 'advisory']
    assert len(ac_results) > 0


# ---- Currency and financial rules ----
def test_currency_mismatch_blocking():
    """Currency mismatch is blocking."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='USD', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'
    currency_results = [fr for fr in result.field_results if fr.field == 'currency' and fr.status == 'blocking']
    assert len(currency_results) > 0
    assert currency_results[0].error == 'Currency mismatch'


def test_one_paisa_difference_blocking():
    """One-paisa difference is blocking."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=4999999,  # One paise off
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 4999999, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'


# ---- Party role and identity rules ----
def test_witness_only_rejected():
    """Witness-only parties must be rejected (needs at least client+provider)."""
    # Both ContractIR and ExecutionParameters enforce client+provider at construction.
    # Test that ExecutionParameters rejects witness-only directly.
    import pytest
    with pytest.raises(Exception):
        ExecutionParameters(
            agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
            currency='INR', total_amount_minor=5000000,
            parties=[Party(role=PartyRole.WITNESS, name='Observer')],
            milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
            review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
        )
    # Also verify that ContractIR rejects missing provider
    with pytest.raises(Exception):
        ContractIR(
            agreement_id='ag-001', version_id='ver-001',
            agreement_type='freelance_milestone', currency='INR',
            total_amount_minor=5000000,
            parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.WITNESS, name='Observer')],
            milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
            review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
        )


# ---- Review period rules ----
def test_review_period_mismatch_blocking():
    """Review period days mismatch is blocking."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=45, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'


def test_review_period_basis_mismatch_blocking():
    """Review period basis mismatch is blocking."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='business', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'


# ---- Governing law rules ----
def test_governing_law_conflict_blocking():
    """A declared governing-law conflict is blocking (design A.14)."""
    from api.app.schemas.ir import GoverningLaw
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
        governing_law=GoverningLaw.INDIA,
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
        governing_law=GoverningLaw.UNITED_KINGDOM,
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'
    assert [fr for fr in result.field_results
            if fr.field == 'governing_law' and fr.status == 'blocking']


def test_governing_law_missing_declaration_advisory():
    """Governing law declared only on the approved side is advisory (design B.5)."""
    from api.app.schemas.ir import GoverningLaw
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
        governing_law=GoverningLaw.INDIA,
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
        governing_law=None,
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert not result.is_blocked
    assert result.has_advisory_diffs
    assert result.overall_status == 'advisory'
    assert [fr for fr in result.field_results
            if fr.field == 'governing_law' and fr.status == 'advisory']


# ---- Agreement/version ID rules ----
def test_agreement_id_mismatch_blocking():
    """Agreement ID mismatch is blocking."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-002',  # Different agreement ID
        version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'
    agreement_results = [fr for fr in result.field_results if fr.field == 'agreement_id' and fr.status == 'blocking']
    assert len(agreement_results) > 0
    assert agreement_results[0].error == 'Agreement ID mismatch'


# ---- Hash and version binding rules ----
def test_separate_hashes_never_interchangeable():
    """Approved IR hash and execution params hash are separate."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    # approved_ir_hash and execution_params_hash should both be present and different
    assert result.approved_ir_hash != result.execution_params_hash
    assert len(result.approved_ir_hash) == 64  # SHA-256 hex
    assert len(result.execution_params_hash) == 64  # SHA-256 hex


def test_version_binding_stale_with_different_agreement_id():
    """Version binding detects stale when agreement_id changes."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    # Initially not stale
    assert not engine.is_stale()
    # Now check stale with different agreement_id
    assert engine.is_stale(other_agreement_id='ag-002')


def test_version_binding_stale_with_different_version_id():
    """Version binding detects stale when version_id changes."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    # Initially not stale
    assert not engine.is_stale()
    # Now check stale with different version_id
    assert engine.is_stale(other_version_id='ver-002')


def test_version_binding_not_stale_same_inputs():
    """Version binding does NOT flag stale when inputs are the same."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001', agreement_type='freelance_milestone',
        currency='INR', total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi'),
            Party(role=PartyRole.PROVIDER, name='Sam'),
            Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    # Not stale with same inputs
    assert not engine.is_stale()
    assert not engine.is_stale(other_agreement_id='ag-001', other_version_id='ver-001')


# ---- Advisory descriptive fields and conditional classifications ----

def _approved_ir(**overrides):
    """Approved ContractIR whose execution counterpart is `_eps()`."""
    params = dict(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo'),
        ],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000,
                              due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    params.update(overrides)
    return ContractIR(**params)


def _eps(**overrides):
    """Execution parameters matching `_approved_ir()` apart from overrides."""
    params = dict(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo'),
        ],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000,
                     'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    params.update(overrides)
    return ExecutionParameters(**params)


def test_identical_inputs_match_with_no_field_results():
    """Control case: identical inputs produce a clean match (proves the tests below differ)."""
    result = ParityEngine(_approved_ir(), _eps()).compare()
    assert result.overall_status == 'match'
    assert result.recommendation == 'proceed'
    assert result.field_results == []


def test_milestone_name_difference_advisory():
    """Milestone descriptive name difference alone is advisory (design B.1)."""
    eps = _eps(milestones=[{'seq': 1, 'name': 'Design Final', 'amount_minor': 5000000,
                            'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}])
    result = ParityEngine(_approved_ir(), eps).compare()
    assert not result.is_blocked
    assert result.overall_status == 'advisory'
    name_results = [fr for fr in result.field_results if fr.field == 'milestones[1].name']
    assert len(name_results) == 1 and name_results[0].status == 'advisory'
    assert name_results[0].expected == 'Design'
    assert name_results[0].actual == 'Design Final'


def test_party_email_difference_advisory():
    """Party email difference alone is advisory (design B.3)."""
    eps = _eps(parties=[
        Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
        Party(role=PartyRole.PROVIDER, name='Sam', email='other@evil.example'),
    ])
    result = ParityEngine(_approved_ir(), eps).compare()
    assert not result.is_blocked
    assert result.overall_status == 'advisory'
    email_results = [fr for fr in result.field_results if fr.field == 'parties.provider.email']
    assert len(email_results) == 1 and email_results[0].status == 'advisory'
    assert email_results[0].expected == 'sam@legalx.demo'
    assert email_results[0].actual == 'other@evil.example'


def test_party_name_difference_is_reported_not_silent():
    """A swapped counterparty is surfaced for review instead of a silent match.

    Identity binding itself is deferred to P0-08 (design section 7), so the result
    is advisory — but it must never be an empty result list with `proceed`.
    """
    eps = _eps(parties=[
        Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
        Party(role=PartyRole.PROVIDER, name='Samantha', email='sam@legalx.demo'),
    ])
    result = ParityEngine(_approved_ir(), eps).compare()
    name_results = [fr for fr in result.field_results if fr.field == 'parties.provider.name']
    assert len(name_results) == 1
    assert name_results[0].status == 'advisory'
    assert name_results[0].expected == 'Sam'
    assert name_results[0].actual == 'Samantha'
    assert result.recommendation != 'proceed'


def test_review_period_basis_blocking_when_days_match():
    """A basis mismatch alone changes the deadline, so it blocks (design A.12)."""
    result = ParityEngine(_approved_ir(), _eps(review_period_basis='business')).compare()
    assert result.is_blocked
    basis = [fr for fr in result.field_results if fr.field == 'review_period_basis']
    assert len(basis) == 1 and basis[0].status == 'blocking'


def test_review_period_basis_advisory_when_days_also_differ():
    """Basis mismatch is advisory when the period length already blocks the deadline."""
    result = ParityEngine(_approved_ir(), _eps(review_period_days=45,
                                               review_period_basis='business')).compare()
    assert result.is_blocked  # review_period_days
    basis = [fr for fr in result.field_results if fr.field == 'review_period_basis']
    assert len(basis) == 1 and basis[0].status == 'advisory'


def test_extra_milestone_detected_without_count_field():
    """Removing the duplicate count check keeps unexpected-milestone detection."""
    eps = _eps(
        total_amount_minor=8000000,
        milestones=[
            {'seq': 1, 'name': 'Design', 'amount_minor': 5000000,
             'due_date': '2026-12-01', 'acceptance_criteria': 'OK'},
            {'seq': 2, 'name': 'Extra', 'amount_minor': 3000000,
             'due_date': '2027-01-15', 'acceptance_criteria': 'OK'},
        ],
    )
    result = ParityEngine(_approved_ir(), eps).compare()
    assert result.is_blocked
    unexpected = [fr for fr in result.field_results if fr.field == 'milestones[2]']
    assert len(unexpected) == 1 and unexpected[0].status == 'blocking'
    assert unexpected[0].error == "Unexpected milestone: not present in approved IR"
    assert not [fr for fr in result.field_results if fr.field == 'milestone_count']


def test_missing_milestone_error_identifies_sequence():
    """Missing-milestone error names the sequence (previously a non-interpolated string)."""
    approved = _approved_ir(
        total_amount_minor=8000000,
        milestones=[
            Milestone(seq=1, name='Design', amount_minor=5000000,
                      due_date='2026-12-01', acceptance_criteria='OK'),
            Milestone(seq=2, name='Implementation', amount_minor=3000000,
                      due_date='2027-01-15', acceptance_criteria='OK'),
        ],
    )
    eps = _eps(
        total_amount_minor=8000000,
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 8000000,
                     'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
    )
    result = ParityEngine(approved, eps).compare()
    assert result.is_blocked
    missing = [fr for fr in result.field_results if fr.field == 'milestones[2]']
    assert len(missing) == 1 and missing[0].status == 'blocking'
    assert missing[0].error == "Missing required milestone: seq 2"
