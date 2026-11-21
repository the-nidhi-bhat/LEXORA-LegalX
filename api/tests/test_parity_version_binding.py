"""Version binding and stale-verification tests.

Verifies that parity results are bound to specific agreement/version IDs and
hashes, and become stale when inputs change.
"""

from api.app.schemas.ir import ContractIR, Party, PartyRole, Milestone
from api.app.parity.execution_parameters import ExecutionParameters
from api.app.parity.engine import ParityEngine
from api.app.parity.result_schema import ParityResult


# ---- VersionBinding.is_stale ----
def test_binding_not_stale_same_inputs():
    """Binding is not stale when inputs are identical."""
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
    result = engine.compare()
    assert not engine.is_stale()


def test_binding_stale_different_agreement_id():
    """Binding is stale when agreement_id changes."""
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
    result = engine.compare()
    # Initially not stale
    assert not engine.is_stale()
    # Now check stale with different agreement_id
    assert engine.is_stale(other_agreement_id='ag-002')


def test_binding_stale_different_version_id():
    """Binding is stale when version_id changes."""
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
    result = engine.compare()
    # Initially not stale
    assert not engine.is_stale()
    # Now check stale with different version_id
    assert engine.is_stale(other_version_id='ver-002')


def test_binding_stale_different_approved_ir_hash():
    """Binding is stale when approved_ir_hash changes."""
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
    result = engine.compare()
    # Initially not stale
    assert not engine.is_stale()
    # Check stale with different approved_ir_hash
    assert engine.is_stale(other_approved_ir_hash='deadbeefdeadbeefdeadbeefdeadbeef')


def test_binding_stale_different_execution_params_hash():
    """Binding is stale when execution_params_hash changes."""
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
    result = engine.compare()
    # Initially not stale
    assert not engine.is_stale()
    # Check stale with different execution_params_hash
    assert engine.is_stale(other_execution_params_hash='cafebabecafebabecafebabecabe')


def test_binding_stale_different_canonicalization_version():
    """Binding is stale when canonicalization_version changes."""
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
    result = engine.compare()
    # Initially not stale
    assert not engine.is_stale()
    # Check stale with a different canonicalization_version
    assert engine.is_stale(other_canonicalization_version='v1')


def test_binding_stale_different_parity_rules_version():
    """Binding is stale when parity_rules_version changes."""
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
    result = engine.compare()
    # Initially not stale
    assert not engine.is_stale()
    # Check stale with different parity_rules_version
    assert engine.is_stale(other_parity_rules_version='v2')


def test_parity_result_binds_to_hashes():
    """ParityResult includes approved_ir_hash and execution_params_hash."""
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
    result = engine.compare()
    assert isinstance(result, ParityResult)
    assert len(result.approved_ir_hash) == 64
    assert len(result.execution_params_hash) == 64
    # Hashes should be different
    assert result.approved_ir_hash != result.execution_params_hash


def test_parity_result_schema_version():
    """ParityResult has schema_version field."""
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
    result = engine.compare()
    assert result.schema_version == 'parity_v1'
    assert result.canonicalization_version == 'v2'
    assert result.parity_rules_version == 'v1'


# ---- Regression: mutation after compare() must mark the result stale ----


def _binding_pair():
    """A matching approved IR / execution-parameter pair."""
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
    return approved, eps


def test_stale_detects_approved_ir_mutation_after_compare():
    """Mutating the approved IR after compare() must mark the result stale.

    Without this check a caller holding a cached binding could keep reporting a
    result as current while the object it was computed from had since changed —
    a TOCTOU hole at any API boundary.
    """
    approved, eps = _binding_pair()
    engine = ParityEngine(approved, eps)
    engine.compare()
    assert not engine.is_stale()
    approved.total_amount_minor = 1
    assert engine.is_stale()


def test_stale_detects_execution_params_mutation_after_compare():
    """Mutating the execution parameters after compare() must mark the result stale."""
    approved, eps = _binding_pair()
    engine = ParityEngine(approved, eps)
    engine.compare()
    assert not engine.is_stale()
    eps.review_period_days = 60
    assert engine.is_stale()


def test_stale_false_for_identical_fresh_inputs():
    """Two independently built but identical inputs are not stale."""
    approved1, eps1 = _binding_pair()
    engine = ParityEngine(approved1, eps1)
    engine.compare()
    approved2, eps2 = _binding_pair()
    fresh = ParityEngine(approved2, eps2)
    fresh.compare()
    assert not engine.is_stale(
        other_version_id=fresh.get_binding().version_id,
        other_approved_ir_hash=fresh.get_binding().approved_ir_hash,
        other_execution_params_hash=fresh.get_binding().execution_params_hash,
    )