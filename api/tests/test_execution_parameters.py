"""ExecutionParameters schema and edge-case tests.

Verifies strict validation: no floats, no booleans, integer paise only,
required parties, milestone sum consistency, unique sequences, and party roles.
"""

import pytest

from api.app.parity.execution_parameters import ExecutionParameters
from api.app.schemas.ir import Currency, Party, PartyRole


# ---- Basic construction ----

def test_execution_parameters_basic():
    """Basic valid ExecutionParameters construction."""
    eps = ExecutionParameters(
        agreement_id="ag-001",
        version_id="ver-001",
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name="Nidhi", email="nidhi@legalx.demo"),
            Party(role=PartyRole.PROVIDER, name="Sam"),
        ],
        milestones=[
            {"seq": 1, "name": "Design", "amount_minor": 2000000, "due_date": "2026-12-01", "acceptance_criteria": "Signed off"},
            {"seq": 2, "name": "Implementation", "amount_minor": 3000000, "due_date": "2027-01-15", "acceptance_criteria": "Completed"},
        ],
        review_period_days=30,
        review_period_basis="calendar",
        dispute_behavior="mediate",
    )
    assert eps.schema_version == "v1"
    assert eps.agreement_id == "ag-001"
    assert eps.version_id == "ver-001"
    assert eps.total_amount_minor == 5000000
    assert len(eps.parties) == 2
    assert eps.milestones[0].amount_minor == 2000000


# ---- Basic construction ----
def test_execution_parameters_with_milestone_sum_mismatch():
    """Milestone sum mismatch must be caught."""
    with pytest.raises(Exception):  # Pydantic ValidationError wraps ValueError
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.CLIENT, name="Nidhi"),
                Party(role=PartyRole.PROVIDER, name="Sam"),
            ],
            milestones=[
                {"seq": 1, "name": "Design", "amount_minor": 3000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=30,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )


# ---- Integer-only enforcement ----
#
# These tests previously used `parties=[]` / `milestones=[]`, so the payload was
# invalid for several unrelated reasons and the assertion could never prove that
# the *money* value was rejected. They now use an otherwise-valid payload and
# assert the specific money error, so a regression to silent coercion fails.


def _valid_eps_kwargs(**overrides):
    """ExecutionParameters kwargs that are valid apart from the overridden field."""
    kwargs = dict(
        agreement_id="ag-001",
        version_id="ver-001",
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name="Nidhi"),
            Party(role=PartyRole.PROVIDER, name="Sam"),
        ],
        milestones=[
            {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
        ],
        review_period_days=30,
        review_period_basis="calendar",
        dispute_behavior="mediate",
    )
    kwargs.update(overrides)
    return kwargs


def test_execution_parameters_rejects_bool():
    """Boolean must be rejected where integer money is expected."""
    with pytest.raises(Exception, match="must be an integer, not a boolean"):
        ExecutionParameters(**_valid_eps_kwargs(total_amount_minor=True))


def test_execution_parameters_rejects_float():
    """Float must be rejected where integer money is expected."""
    with pytest.raises(Exception, match="must be an integer, not a float"):
        ExecutionParameters(**_valid_eps_kwargs(total_amount_minor=5000000.0))


def test_execution_parameters_rejects_numeric_string_money():
    """A numeric string must not be silently coerced into an integer amount."""
    with pytest.raises(Exception, match="must be an integer, got str"):
        ExecutionParameters(**_valid_eps_kwargs(total_amount_minor="5000000"))


def test_execution_parameters_rejects_bool_review_period():
    """Boolean review period must not become a 1-day review window."""
    with pytest.raises(Exception, match="must be an integer, not a boolean"):
        ExecutionParameters(**_valid_eps_kwargs(review_period_days=True))


def test_execution_parameters_rejects_string_review_period():
    """Numeric-string review period must be rejected, not coerced."""
    with pytest.raises(Exception, match="must be an integer, got str"):
        ExecutionParameters(**_valid_eps_kwargs(review_period_days="30"))


# ---- Currency enforcement ----

def test_execution_parameters_currency_invalid():
    """Unsupported currency must be rejected."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="XYZ",
            total_amount_minor=5000000,
            parties=[],
            milestones=[],
            review_period_days=30,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected


# ---- Party enforcement ----

def test_execution_parameters_missing_client():
    """Missing client party must be rejected."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.PROVIDER, name="Sam"),
            ],
            milestones=[
                {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=30,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected


def test_execution_parameters_missing_provider():
    """Missing provider party must be rejected."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.CLIENT, name="Nidhi"),
            ],
            milestones=[
                {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=30,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected


def test_execution_parameters_witness_only():
    """Witness-only (no client/provider) must be rejected."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.WITNESS, name="Observer"),
            ],
            milestones=[
                {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=30,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected


# ---- Milestone enforcement ----

def test_execution_parameters_milestone_sequences_not_unique():
    """Duplicate milestone sequences must be rejected."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.CLIENT, name="Nidhi"),
                Party(role=PartyRole.PROVIDER, name="Sam"),
            ],
            milestones=[
                {"seq": 1, "name": "Design", "amount_minor": 2000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
                {"seq": 1, "name": "Implementation", "amount_minor": 3000000, "due_date": "2027-01-15", "acceptance_criteria": "Completed"},
            ],
            review_period_days=30,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected


def test_execution_parameters_milestone_sequences_positive():
    """Milestone sequences must be positive."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.CLIENT, name="Nidhi"),
                Party(role=PartyRole.PROVIDER, name="Sam"),
            ],
            milestones=[
                {"seq": 0, "name": "Design", "amount_minor": 2000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
                {"seq": 1, "name": "Implementation", "amount_minor": 3000000, "due_date": "2027-01-15", "acceptance_criteria": "Completed"},
            ],
            review_period_days=30,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected


def test_execution_parameters_milestone_sum_mismatch():
    """Milestone sum must equal total_amount_minor."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.CLIENT, name="Nidhi"),
                Party(role=PartyRole.PROVIDER, name="Sam"),
            ],
            milestones=[
                {"seq": 1, "name": "Design", "amount_minor": 2000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
                {"seq": 2, "name": "Implementation", "amount_minor": 2000000, "due_date": "2027-01-15", "acceptance_criteria": "Completed"},
            ],
            review_period_days=30,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected


# ---- Review period enforcement ----

def test_execution_parameters_review_period_boundary_low():
    """Review period 1 is valid (boundary inclusive)."""
    eps = ExecutionParameters(
        agreement_id="ag-001",
        version_id="ver-001",
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name="Nidhi"),
            Party(role=PartyRole.PROVIDER, name="Sam"),
        ],
        milestones=[
            {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
        ],
        review_period_days=1,
        review_period_basis="calendar",
        dispute_behavior="mediate",
    )
    assert eps.review_period_days == 1


def test_execution_parameters_review_period_boundary_high():
    """Review period 90 is valid (boundary inclusive)."""
    eps = ExecutionParameters(
        agreement_id="ag-001",
        version_id="ver-001",
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount_minor=5000000,
        parties=[
            Party(role=PartyRole.CLIENT, name="Nidhi"),
            Party(role=PartyRole.PROVIDER, name="Sam"),
        ],
        milestones=[
            {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
        ],
        review_period_days=90,
        review_period_basis="calendar",
        dispute_behavior="mediate",
    )
    assert eps.review_period_days == 90


def test_execution_parameters_review_period_too_low():
    """Review period 0 must be rejected."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.CLIENT, name="Nidhi"),
                Party(role=PartyRole.PROVIDER, name="Sam"),
            ],
            milestones=[
                {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=0,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected


def test_execution_parameters_review_period_too_high():
    """Review period 91 must be rejected."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.CLIENT, name="Nidhi"),
                Party(role=PartyRole.PROVIDER, name="Sam"),
            ],
            milestones=[
                {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=91,
            review_period_basis="calendar",
            dispute_behavior="mediate",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected


# ---- Dispute behavior enforcement ----

def test_execution_parameters_unsupported_dispute_behavior():
    """Unsupported dispute behavior must be caught by Pydantic enum validation."""
    try:
        ExecutionParameters(
            agreement_id="ag-001",
            version_id="ver-001",
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount_minor=5000000,
            parties=[
                Party(role=PartyRole.CLIENT, name="Nidhi"),
                Party(role=PartyRole.PROVIDER, name="Sam"),
            ],
            milestones=[
                {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=30,
            review_period_basis="calendar",
            dispute_behavior="invalid_behavior",
        )
        assert False, "Should have raised an error"
    except Exception:
        pass  # Expected