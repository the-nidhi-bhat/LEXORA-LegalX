"""ExecutionParameters schema and edge-case tests.

Verifies strict validation: no floats, no booleans, integer paise only,
required parties, milestone sum consistency, unique sequences, and party roles.

Every negative test uses an otherwise-valid payload (``_valid_eps_kwargs``) and
asserts the *specific* rule under test — either the exact message (model-level
validators) or the exact error location (field-level constraints). A test here
fails if its intended validation is removed, even when another defect in the
payload would still raise.
"""

import pytest
from pydantic import ValidationError

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
    with pytest.raises(ValidationError, match="Milestone sum"):
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


def _only_error(exc_info):
    """Return the single validation error, failing if validation raised several."""
    errors = exc_info.value.errors()
    assert len(errors) == 1, f"expected exactly one validation error, got {errors}"
    return errors[0]


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
    """Unsupported currency must be rejected on the currency field.

    The previous version passed ``parties=[]`` and ``milestones=[]`` as well, so
    ``min_length`` failed first and the currency rule was never exercised.
    """
    with pytest.raises(ValidationError) as exc:
        ExecutionParameters(**_valid_eps_kwargs(currency="XYZ"))
    error = _only_error(exc)
    assert error["loc"] == ("currency",)


def test_execution_parameters_currency_accepts_supported_value():
    """Control case: a supported currency is accepted, so the test above is meaningful."""
    eps = ExecutionParameters(**_valid_eps_kwargs(currency="USD"))
    assert eps.currency == Currency.USD


# ---- Party enforcement ----

def test_execution_parameters_missing_client():
    """A payload with no client party must be rejected for that reason.

    ``min_length=2`` is satisfied (provider + witness), so only the required-role
    rule can raise.
    """
    with pytest.raises(ValidationError, match="role 'client' is required"):
        ExecutionParameters(
            **_valid_eps_kwargs(
                parties=[
                    Party(role=PartyRole.PROVIDER, name="Sam"),
                    Party(role=PartyRole.WITNESS, name="Observer"),
                ]
            )
        )


def test_execution_parameters_missing_provider():
    """A payload with no provider party must be rejected for that reason."""
    with pytest.raises(ValidationError, match="role 'provider' is required"):
        ExecutionParameters(
            **_valid_eps_kwargs(
                parties=[
                    Party(role=PartyRole.CLIENT, name="Nidhi"),
                    Party(role=PartyRole.WITNESS, name="Observer"),
                ]
            )
        )


def test_execution_parameters_witness_only():
    """Witness-only parties (no client/provider) must be rejected.

    Two witnesses keep ``min_length=2`` satisfied, so the required-role rule is
    the only thing that can reject this payload.
    """
    with pytest.raises(ValidationError, match="role 'client' is required"):
        ExecutionParameters(
            **_valid_eps_kwargs(
                parties=[
                    Party(role=PartyRole.WITNESS, name="Observer"),
                    Party(role=PartyRole.WITNESS, name="Second Observer"),
                ]
            )
        )


# ---- Milestone enforcement ----

def test_execution_parameters_milestone_sequences_not_unique():
    """Duplicate milestone sequences must be rejected."""
    with pytest.raises(ValidationError, match="Milestone sequences must be unique"):
        ExecutionParameters(
            **_valid_eps_kwargs(
                milestones=[
                    {"seq": 1, "name": "Design", "amount_minor": 2000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
                    {"seq": 1, "name": "Implementation", "amount_minor": 3000000, "due_date": "2027-01-15", "acceptance_criteria": "Completed"},
                ]
            )
        )


def test_execution_parameters_milestone_sequences_positive():
    """Milestone sequence 0 must be rejected on the sequence field."""
    with pytest.raises(ValidationError) as exc:
        ExecutionParameters(
            **_valid_eps_kwargs(
                milestones=[
                    {"seq": 0, "name": "Design", "amount_minor": 2000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
                    {"seq": 1, "name": "Implementation", "amount_minor": 3000000, "due_date": "2027-01-15", "acceptance_criteria": "Completed"},
                ]
            )
        )
    error = _only_error(exc)
    assert error["loc"] == ("milestones", 0, "seq")


def test_execution_parameters_milestone_sum_mismatch():
    """Milestone sum must equal total_amount_minor."""
    with pytest.raises(ValidationError, match="Milestone sum"):
        ExecutionParameters(
            **_valid_eps_kwargs(
                milestones=[
                    {"seq": 1, "name": "Design", "amount_minor": 2000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
                    {"seq": 2, "name": "Implementation", "amount_minor": 2000000, "due_date": "2027-01-15", "acceptance_criteria": "Completed"},
                ]
            )
        )


# ---- Review period enforcement ----

def test_execution_parameters_review_period_boundary_low():
    """Review period 1 is valid (boundary inclusive)."""
    eps = ExecutionParameters(**_valid_eps_kwargs(review_period_days=1))
    assert eps.review_period_days == 1


def test_execution_parameters_review_period_boundary_high():
    """Review period 90 is valid (boundary inclusive)."""
    eps = ExecutionParameters(**_valid_eps_kwargs(review_period_days=90))
    assert eps.review_period_days == 90


def test_execution_parameters_review_period_too_low():
    """Review period 0 must be rejected on the review-period field."""
    with pytest.raises(ValidationError) as exc:
        ExecutionParameters(**_valid_eps_kwargs(review_period_days=0))
    error = _only_error(exc)
    assert error["loc"] == ("review_period_days",)


def test_execution_parameters_review_period_too_high():
    """Review period 91 must be rejected on the review-period field."""
    with pytest.raises(ValidationError) as exc:
        ExecutionParameters(**_valid_eps_kwargs(review_period_days=91))
    error = _only_error(exc)
    assert error["loc"] == ("review_period_days",)


# ---- Dispute behavior enforcement ----

def test_execution_parameters_unsupported_dispute_behavior():
    """Unsupported dispute behavior must be rejected on the dispute-behavior field."""
    with pytest.raises(ValidationError) as exc:
        ExecutionParameters(**_valid_eps_kwargs(dispute_behavior="invalid_behavior"))
    error = _only_error(exc)
    assert error["loc"] == ("dispute_behavior",)


# ---- Agreement type enforcement ----

def test_execution_parameters_unsupported_agreement_type():
    """Unsupported agreement type must be rejected on the agreement-type field."""
    with pytest.raises(ValidationError) as exc:
        ExecutionParameters(**_valid_eps_kwargs(agreement_type="not_a_type"))
    error = _only_error(exc)
    assert error["loc"] == ("agreement_type",)
