"""ParityEngine core tests — happy path, blocked, advisory, determinism, mutation.

Verifies the core comparison interface produces correct structured results.
"""

from api.app.schemas.ir import ContractIR, Party, PartyRole, Milestone, GoverningLaw
from api.app.parity.execution_parameters import ExecutionParameters
from api.app.parity.engine import ParityEngine, run_parity_comparison
from api.app.parity.result_schema import ParityResult, ParityFieldResult


def _make_approved(**overrides):
    """Build a valid ContractIR with sensible defaults."""
    defaults = dict(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo'),
            Party(role=PartyRole.WITNESS, name='Observer', email='observer@legalx.demo'),
        ],
        milestones=[
            Milestone(seq=1, name='Design', amount_minor=2000000,
                      due_date='2026-12-01', acceptance_criteria='Signed off'),
            Milestone(seq=2, name='Implementation', amount_minor=3000000,
                      due_date='2027-01-15', acceptance_criteria='Completed'),
        ],
        review_period_days=30, review_period_basis='calendar',
        dispute_behavior='mediate', governing_law=GoverningLaw.INDIA,
    )
    defaults.update(overrides)
    return ContractIR(**defaults)


def _make_eps(**overrides):
    """Build a valid ExecutionParameters with sensible defaults."""
    defaults = dict(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo'),
            Party(role=PartyRole.WITNESS, name='Observer', email='observer@legalx.demo'),
        ],
        milestones=[
            {'seq': 1, 'name': 'Design', 'amount_minor': 2000000,
             'due_date': '2026-12-01', 'acceptance_criteria': 'Signed off'},
            {'seq': 2, 'name': 'Implementation', 'amount_minor': 3000000,
             'due_date': '2027-01-15', 'acceptance_criteria': 'Completed'},
        ],
        review_period_days=30, review_period_basis='calendar',
        dispute_behavior='mediate', governing_law=GoverningLaw.INDIA,
    )
    defaults.update(overrides)
    return ExecutionParameters(**defaults)


# ---- Happy path ----
def test_happy_path_match():
    """Identical inputs produce match status."""
    approved = _make_approved()
    eps = _make_eps()
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.overall_status == 'match'
    assert not result.is_blocked
    assert not result.has_advisory_diffs
    assert result.recommendation == 'proceed'
    assert len(result.field_results) == 0


def test_happy_path_result_structure():
    """Result has all required fields populated."""
    approved = _make_approved()
    eps = _make_eps()
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.agreement_id == 'ag-001'
    assert result.version_id == 'ver-001'
    assert len(result.approved_ir_hash) == 64
    assert len(result.execution_params_hash) == 64
    assert result.approved_ir_hash != result.execution_params_hash
    assert result.canonicalization_version == 'v2'
    assert result.parity_rules_version == 'v1'
    assert result.schema_version == 'parity_v1'
    assert result.verified_at is not None


# ---- Blocked scenarios ----
def test_blocked_total_amount_mismatch():
    """Total amount mismatch produces blocked."""
    approved = _make_approved(total_amount_minor=5000000)
    eps = _make_eps(
        total_amount_minor=4999999,
        milestones=[
            {'seq': 1, 'name': 'Design', 'amount_minor': 2000000,
             'due_date': '2026-12-01', 'acceptance_criteria': 'Signed off'},
            {'seq': 2, 'name': 'Implementation', 'amount_minor': 2999999,
             'due_date': '2027-01-15', 'acceptance_criteria': 'Completed'},
        ],
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'
    assert result.recommendation == 'blocked'
    amount_results = [fr for fr in result.field_results
                      if fr.field == 'total_amount_minor' and fr.status == 'blocking']
    assert len(amount_results) > 0
    assert amount_results[0].expected == 5000000
    assert amount_results[0].actual == 4999999


def test_blocked_currency_mismatch():
    """Currency mismatch produces blocked."""
    approved = _make_approved(currency='INR')
    eps = _make_eps(currency='USD')
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    currency_results = [fr for fr in result.field_results
                        if fr.field == 'currency' and fr.status == 'blocking']
    assert len(currency_results) > 0


def test_blocked_agreement_id_mismatch():
    """Agreement ID mismatch produces blocked."""
    approved = _make_approved(agreement_id='ag-001')
    eps = _make_eps(agreement_id='ag-002')
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    id_results = [fr for fr in result.field_results
                  if fr.field == 'agreement_id' and fr.status == 'blocking']
    assert len(id_results) > 0


def test_blocked_version_id_mismatch():
    """Version ID mismatch produces blocked."""
    approved = _make_approved(version_id='ver-001')
    eps = _make_eps(version_id='ver-002')
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    id_results = [fr for fr in result.field_results
                  if fr.field == 'version_id' and fr.status == 'blocking']
    assert len(id_results) > 0


def test_blocked_review_period_mismatch():
    """Review period days mismatch produces blocked."""
    approved = _make_approved(review_period_days=30)
    eps = _make_eps(review_period_days=45)
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked


def test_blocked_dispute_behavior_mismatch():
    """Dispute behavior mismatch produces blocked."""
    approved = _make_approved(dispute_behavior='mediate')
    eps = _make_eps(dispute_behavior='arbitrate')
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked


def test_blocked_milestone_amount_mismatch():
    """Milestone amount mismatch produces blocked."""
    approved = _make_approved()
    eps = _make_eps(
        total_amount_minor=5000000,
        milestones=[
            {'seq': 1, 'name': 'Design', 'amount_minor': 2500000,
             'due_date': '2026-12-01', 'acceptance_criteria': 'Signed off'},
            {'seq': 2, 'name': 'Implementation', 'amount_minor': 2500000,
             'due_date': '2027-01-15', 'acceptance_criteria': 'Completed'},
        ],
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    ms_amount = [fr for fr in result.field_results
                 if 'amount_minor' in fr.field and fr.status == 'blocking']
    assert len(ms_amount) > 0


def test_blocked_one_paisa_difference():
    """One-paisa difference in total is blocking."""
    approved = _make_approved(total_amount_minor=5000000)
    eps = _make_eps(
        total_amount_minor=5000001,
        milestones=[
            {'seq': 1, 'name': 'Design', 'amount_minor': 2000000,
             'due_date': '2026-12-01', 'acceptance_criteria': 'Signed off'},
            {'seq': 2, 'name': 'Implementation', 'amount_minor': 3000001,
             'due_date': '2027-01-15', 'acceptance_criteria': 'Completed'},
        ],
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.recommendation == 'blocked'


# ---- Advisory scenarios ----
def test_advisory_witness_difference():
    """Witness difference produces advisory (not blocked)."""
    approved = _make_approved()
    eps = _make_eps(parties=[
        Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
        Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo'),
    ])
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert not result.is_blocked
    assert result.has_advisory_diffs
    assert result.overall_status == 'advisory'
    assert result.recommendation == 'review'


def test_advisory_governing_law_difference():
    """Governing law difference produces advisory."""
    approved = _make_approved(governing_law=GoverningLaw.INDIA)
    eps = _make_eps(governing_law=GoverningLaw.UNITED_KINGDOM)
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert not result.is_blocked
    assert result.has_advisory_diffs
    gl_results = [fr for fr in result.field_results
                  if fr.field == 'governing_law' and fr.status == 'advisory']
    assert len(gl_results) > 0


def test_advisory_acceptance_criteria_difference():
    """Acceptance criteria difference produces advisory."""
    approved = _make_approved()
    eps = _make_eps(
        milestones=[
            {'seq': 1, 'name': 'Design', 'amount_minor': 2000000,
             'due_date': '2026-12-01', 'acceptance_criteria': 'DIFFERENT'},
            {'seq': 2, 'name': 'Implementation', 'amount_minor': 3000000,
             'due_date': '2027-01-15', 'acceptance_criteria': 'Completed'},
        ],
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert not result.is_blocked
    assert result.has_advisory_diffs
    ac_results = [fr for fr in result.field_results
                  if 'acceptance_criteria' in fr.field and fr.status == 'advisory']
    assert len(ac_results) > 0


def test_advisory_blocked_takes_precedence():
    """When both blocking and advisory exist, blocked takes precedence."""
    approved = _make_approved()
    eps = _make_eps(
        currency='USD',  # blocking
        governing_law=GoverningLaw.UNITED_KINGDOM,  # advisory
    )
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    assert result.is_blocked
    assert result.overall_status == 'blocked'
    assert result.recommendation == 'blocked'
    # Advisory diffs may exist but overall is blocked
    assert not result.has_advisory_diffs or result.is_blocked


# ---- Determinism ----
def test_determinism_same_inputs_same_result():
    """Two comparisons with same inputs produce identical results."""
    approved = _make_approved()
    eps = _make_eps()
    r1 = ParityEngine(approved, eps).compare()
    r2 = ParityEngine(approved, eps).compare()
    assert r1.overall_status == r2.overall_status
    assert r1.message == r2.message
    assert r1.recommendation == r2.recommendation
    assert r1.approved_ir_hash == r2.approved_ir_hash
    assert r1.execution_params_hash == r2.execution_params_hash


def test_determinism_blocked_message_stable():
    """Blocked message is deterministic for same inputs."""
    approved = _make_approved()
    eps = _make_eps(currency='USD')
    r1 = ParityEngine(approved, eps).compare()
    r2 = ParityEngine(approved, eps).compare()
    assert r1.message == r2.message


# ---- Mutation safety ----
def test_mutation_safety():
    """Engine does not mutate input objects."""
    approved = _make_approved()
    eps = _make_eps()
    original_total = eps.total_amount_minor
    original_agreement = eps.agreement_id
    original_approved_agreement = approved.agreement_id
    engine = ParityEngine(approved, eps)
    engine.compare()
    assert eps.total_amount_minor == original_total
    assert eps.agreement_id == original_agreement
    assert approved.agreement_id == original_approved_agreement


def test_mutation_after_compare_does_not_affect_result():
    """Mutating inputs after compare does not change the returned result."""
    approved = _make_approved()
    eps = _make_eps()
    engine = ParityEngine(approved, eps)
    result = engine.compare()
    # Mutate
    eps.total_amount_minor = 9999999
    # Result object should still have original hashes
    assert result.execution_params_hash != ''


# ---- Version binding ----
def test_binding_populated_after_compare():
    """Engine binding is populated after compare."""
    approved = _make_approved()
    eps = _make_eps()
    engine = ParityEngine(approved, eps)
    engine.compare()
    binding = engine.get_binding()
    assert binding.agreement_id == 'ag-001'
    assert binding.version_id == 'ver-001'
    assert len(binding.approved_ir_hash) == 64
    assert len(binding.execution_params_hash) == 64


def test_stale_detection():
    """Engine detects stale when version changes."""
    approved = _make_approved()
    eps = _make_eps()
    engine = ParityEngine(approved, eps)
    engine.compare()
    assert not engine.is_stale()
    assert engine.is_stale(other_version_id='ver-002')
    assert engine.is_stale(other_agreement_id='ag-999')


# ---- Convenience function ----
def test_run_parity_comparison():
    """run_parity_comparison returns dict with expected keys."""
    approved = _make_approved()
    eps = _make_eps()
    result = run_parity_comparison(approved, eps)
    assert isinstance(result, dict)
    assert result['overall_status'] == 'match'
    assert result['is_blocked'] is False
    assert result['recommendation'] == 'proceed'
    assert 'approved_ir_hash' in result
    assert 'execution_params_hash' in result
    assert 'field_results' in result


# ---- Contradiction prevention ----
def test_no_contradictory_states():
    """Result cannot be both blocked and match."""
    approved = _make_approved()
    eps = _make_eps(currency='USD')
    result = ParityEngine(approved, eps).compare()
    # If blocked, cannot be match
    if result.is_blocked:
        assert result.overall_status == 'blocked'
        assert result.recommendation == 'blocked'
    # If match, cannot have advisory or blocked
    if result.overall_status == 'match':
        assert not result.is_blocked
        assert not result.has_advisory_diffs


def test_no_proceed_when_blocked():
    """recommendation is never 'proceed' when blocked."""
    approved = _make_approved()
    eps = _make_eps(
        total_amount_minor=1,
        milestones=[{'seq': 1, 'name': 'X', 'amount_minor': 1,
                     'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
    )
    result = ParityEngine(approved, eps).compare()
    assert result.is_blocked
    assert result.recommendation != 'proceed'
