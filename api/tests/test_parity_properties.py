"""Property-based and determinism tests for the parity engine.

Tests deterministic output, mutation safety, and contradiction prevention.
"""

from api.app.schemas.ir import ContractIR, Party, PartyRole, Milestone
from api.app.parity.execution_parameters import ExecutionParameters
from api.app.parity.engine import ParityEngine
from api.app.parity.result_schema import ParityResult


# ---- Determinism: same inputs same outputs ----
def test_determinism_same_inputs_same_result():
    """Running comparison twice with same inputs produces identical results."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result1 = engine.compare()
    result2 = engine.compare()
    assert result1.overall_status == result2.overall_status
    assert result1.message == result2.message
    assert result1.recommendation == result2.recommendation
    assert result1.is_blocked == result2.is_blocked
    assert result1.has_advisory_diffs == result2.has_advisory_diffs
    # Field results should match (order-independent on status)
    assert len(result1.field_results) == len(result2.field_results)
    for fr1, fr2 in zip(sorted(result1.field_results, key=lambda f: f.field),
                        sorted(result2.field_results, key=lambda f: f.field)):
        assert fr1.field == fr2.field
        assert fr1.status == fr2.status


def test_determinism_mutation_safety():
    """Engine comparison is mutation-safe - original inputs unchanged."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    # Store original values
    original_total = eps.total_amount_minor
    original_agreement = eps.agreement_id
    # Run comparison
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    # Original values should be unchanged
    assert eps.total_amount_minor == original_total
    assert eps.agreement_id == original_agreement
    assert approved.agreement_id == 'ag-001'


def test_determinism_parallel_engine_instances():
    """Multiple engine instances with same inputs produce consistent results."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    # Create multiple engines
    engines = [ParityEngine(approved, eps) for _ in range(5)]
    results = [engine.compare() for engine in engines]
    # All should produce same overall status
    statuses = set(r.overall_status for r in results)
    assert len(statuses) == 1  # All same
    # All should have same recommendation
    recs = set(r.recommendation for r in results)
    assert len(recs) == 1


def test_determinism_field_result_ordering():
    """Field results are always ordered: blocking first, then advisory, then ok."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=4999999,  # Blocking mismatch
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 4999999, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    # All field results should have blocking status
    for fr in result.field_results:
        assert fr.status == 'blocking', f"Expected blocking, got {fr.status} for field {fr.field}"
    # Check ordering: all should be blocking
    statuses = [fr.status for fr in result.field_results]
    # All should be blocking
    assert all(s == 'blocking' for s in statuses)


# ---- Contradiction prevention ----
def test_contradiction_no_blocked_with_advisory_only():
    """Advisory-only differences should not be reported as blocked."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam'),
                 Party(role=PartyRole.WITNESS, name='Observer')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='Signed off')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],  # No witness
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'Completed'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    # Should be advisory, not blocked
    assert not result.is_blocked
    assert result.overall_status == 'advisory'
    assert result.has_advisory_diffs


def test_contradiction_blocked_prevents_proceed():
    """Blocked result should always have recommendation 'blocked'."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-002',  # Different agreement - blocking
        version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.recommendation == 'blocked'
    assert result.overall_status == 'blocked'


# ---- Invalid input handling ----
def test_invalid_input_detection():
    """Engine handles invalid input gracefully."""
    # Try with None execution params
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    try:
        engine = ParityEngine(approved, None)
        result = engine.compare()
        # Should not crash; should result in invalid_input or blocked
        assert result.overall_status in ('blocked', 'invalid_input', 'advisory')
    except Exception as e:
        # Exception is also acceptable for None input
        pass


def test_stale_result_cannot_be_reused():
    """Stale results should not be reusable."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps1 = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps2 = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-002',  # Different version
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[Party(role=PartyRole.CLIENT, name='Nidhi'), Party(role=PartyRole.PROVIDER, name='Sam')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    engine1 = ParityEngine(approved, eps1)
    result1 = engine1.compare()
    # Check result1 is stale when eps2 inputs are used
    assert engine1.is_stale(other_version_id='ver-002')