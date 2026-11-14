"""Canonical serialization tests.

Verifies independent canonical forms for approved ContractIR and execution
parameters, and that they are never interchangeable.
"""

import hashlib
import unicodedata

from api.app.schemas.ir import ContractIR, Party, PartyRole, Milestone, GoverningLaw
from api.app.parity.execution_parameters import ExecutionParameters
from api.app.parity.canonicalization import canonicalize_approved_ir, canonicalize_execution_params


# ---- Approved IR canonicalization ----
def test_canonicalize_approved_ir_basic():
    """Basic canonicalization produces SHA-256 hash."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash_result = canonicalize_approved_ir(approved)
    # Verify it's a valid SHA-256 hex string
    assert len(hash_result) == 64
    # Verify it can be reproduced
    assert canonicalize_approved_ir(approved) == hash_result


def test_canonicalize_approved_ir_determinism():
    """Same IR always produces same hash."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash1 = canonicalize_approved_ir(approved)
    hash2 = canonicalize_approved_ir(approved)
    hash3 = canonicalize_approved_ir(approved)
    assert hash1 == hash2 == hash3


def test_canonicalize_approved_ir_changes_on_modification():
    """Modified IR produces different hash."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash1 = canonicalize_approved_ir(approved)
    # Change a field
    approved2 = ContractIR(
        agreement_id='ag-001', version_id='ver-002',  # Changed version
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash2 = canonicalize_approved_ir(approved2)
    assert hash1 != hash2


# ---- Execution parameters canonicalization ----
def test_canonicalize_execution_params_basic():
    """Basic canonicalization produces SHA-256 hash."""
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash_result = canonicalize_execution_params(eps)
    assert len(hash_result) == 64
    assert canonicalize_execution_params(eps) == hash_result


def test_canonicalize_execution_params_determinism():
    """Same execution params always produces same hash."""
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash1 = canonicalize_execution_params(eps)
    hash2 = canonicalize_execution_params(eps)
    hash3 = canonicalize_execution_params(eps)
    assert hash1 == hash2 == hash3


def test_canonicalize_execution_params_separate_from_ir():
    """Execution params canonical form is separate from approved IR canonical form."""
    approved = ContractIR(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[Milestone(seq=1, name='Design', amount_minor=5000000, due_date='2026-12-01', acceptance_criteria='OK')],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    ir_hash = canonicalize_approved_ir(approved)
    exec_hash = canonicalize_execution_params(eps)
    # They must be different (different content)
    assert ir_hash != exec_hash
    # Each must be valid SHA-256
    assert len(ir_hash) == 64
    assert len(exec_hash) == 64


def test_canonicalize_execution_params_changes_on_modification():
    """Modified execution params produces different hash."""
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash1 = canonicalize_execution_params(eps)
    # Change a field
    eps2 = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam Changed', email='sam2@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash2 = canonicalize_execution_params(eps2)
    assert hash1 != hash2


def test_canonicalize_execution_params_currency_and_amount():
    """Currency and amount affect execution params hash."""
    eps_inr = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    eps_usd = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='USD',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash_inr = canonicalize_execution_params(eps_inr)
    hash_usd = canonicalize_execution_params(eps_usd)
    assert hash_inr != hash_usd  # Different currency should produce different hash


def test_canonicalize_execution_params_party_ordering():
    """Parties are sorted deterministically in canonical form."""
    eps = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo'),
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash1 = canonicalize_execution_params(eps)
    # Recreate with parties in opposite order - should produce same hash due to sorting
    eps2 = ExecutionParameters(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000, 'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    hash2 = canonicalize_execution_params(eps2)
    # Sorted order should give same hash
    assert hash1 == hash2


# ---- Regression: canonical-form integrity ----


def _eps_with(**overrides):
    """Valid ExecutionParameters; only the overridden field differs."""
    kwargs = dict(
        agreement_id='ag-001', version_id='ver-001',
        agreement_type='freelance_milestone', currency='INR',
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
        milestones=[{'seq': 1, 'name': 'Design', 'amount_minor': 5000000,
                     'due_date': '2026-12-01', 'acceptance_criteria': 'OK'}],
        review_period_days=30, review_period_basis='calendar', dispute_behavior='mediate',
    )
    kwargs.update(overrides)
    return ExecutionParameters(**kwargs)


def test_canonicalize_execution_params_review_period_days_affects_hash():
    """review_period_days is part of the canonical form.

    The v1 canonical form omitted this field entirely, so two execution
    parameter sets that differed only in review period produced the same
    ``execution_params_hash``. The review period drives deadline calculation,
    so that was a real integrity defect.
    """
    hash_30 = canonicalize_execution_params(_eps_with(review_period_days=30))
    hash_45 = canonicalize_execution_params(_eps_with(review_period_days=45))
    assert hash_30 != hash_45


def test_canonicalize_execution_params_separator_in_free_text_does_not_collapse():
    """Free-text separators must not let two distinct inputs share a hash.

    The v1 form was a ``|``/``:``-joined string, so a party name or acceptance
    criterion containing those characters could shift field boundaries. The v2
    form is JSON, where every value is quoted and unambiguous.
    """
    plain = _eps_with(
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi', email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
    )
    injected = _eps_with(
        parties=[
            Party(role=PartyRole.CLIENT, name='Nidhi|provider:Sam',
                  email='nidhi@legalx.demo'),
            Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')],
    )
    assert canonicalize_execution_params(plain) != canonicalize_execution_params(injected)


def test_canonicalize_execution_params_colon_in_acceptance_criteria_affects_hash():
    """A ':' inside acceptance_criteria is data, not a field separator."""
    base = _eps_with()
    mutated = _eps_with(milestones=[
        {'seq': 1, 'name': 'Design', 'amount_minor': 5000000,
         'due_date': '2026-12-01', 'acceptance_criteria': 'OK:2026-12-01'}])
    assert canonicalize_execution_params(base) != canonicalize_execution_params(mutated)


def test_canonicalize_execution_params_unicode_name_is_stable():
    """Unicode party names are normalized (NFC) and hash deterministically."""
    composed = _eps_with(parties=[
        Party(role=PartyRole.CLIENT, name='Nidhi\u00e9', email='nidhi@legalx.demo'),
        Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')])
    decomposed = _eps_with(parties=[
        Party(role=PartyRole.CLIENT, name='Nidhie\u0301', email='nidhi@legalx.demo'),
        Party(role=PartyRole.PROVIDER, name='Sam', email='sam@legalx.demo')])
    # Same logical string in different Unicode normal forms → same hash
    assert canonicalize_execution_params(composed) == canonicalize_execution_params(decomposed)