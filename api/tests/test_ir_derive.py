"""Unit tests for deterministic Contract IR derivation from structured agreement data."""

import pytest
import re

from api.app.ir.derive import derive_ir_from_agreement


# --- Basic derivation ---


def test_derive_basic():
    """Basic derivation from structured data."""
    ir = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "Nidhi", "email": "nidhi@legalx.demo"},
            {"role": "provider", "name": "Sam"},
        ],
        milestones=[
            {"seq": 1, "name": "Design approval", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "Signed off"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    assert ir.agreement_type.value == "freelance_milestone"
    assert ir.currency == "INR"
    assert ir.total_amount_minor == 5000000
    assert len(ir.parties) == 2
    assert ir.parties[0].role.value == "client"
    assert ir.parties[1].role.value == "provider"
    assert ir.milestones[0].seq == 1
    assert ir.milestones[0].amount_minor == 5000000
    assert ir.review_period_days == 5
    assert ir.review_period_basis.value == "calendar"
    assert ir.dispute_behavior.value == "freeze_affected_payment"


def test_derive_with_governing_law():
    """Derivation with governing law."""
    ir = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "Nidhi"},
            {"role": "provider", "name": "Sam"},
        ],
        milestones=[
            {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
        ],
        review_period_days=10,
        review_period_basis="business",
        dispute_behavior="mediate",
        governing_law="India",
    )
    assert ir.governing_law == "India"  # GoverningLaw.INDIA.value


def test_derive_unsupported_agreement_type():
    """Unsupported agreement type raises ValueError."""
    with pytest.raises(ValueError, match="Unsupported agreement_type"):
        derive_ir_from_agreement(
            agreement_type="invalid_type",
            currency="INR",
            total_amount=50000.0,
            parties=[],
            milestones=[],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_unsupported_currency():
    """Unsupported currency raises ValueError."""
    with pytest.raises(ValueError, match="Unsupported currency"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="XYZ",
            total_amount=50000.0,
            parties=[],
            milestones=[],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_unsupported_review_period_basis():
    """Unsupported review period basis raises ValueError."""
    with pytest.raises(ValueError, match="Unsupported review_period_basis"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[],
            milestones=[],
            review_period_days=5,
            review_period_basis="quantum",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_unsupported_dispute_behavior():
    """Unsupported dispute behavior raises ValueError."""
    with pytest.raises(ValueError, match="Unsupported dispute_behavior"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[],
            milestones=[],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="invalid_behavior",
        )


# --- Party validation in derivation ---


def test_derive_missing_client():
    """Derivation requires at least one client party."""
    with pytest.raises(ValueError, match="At least one party with role 'client' is required"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "provider", "name": "Sam"},
            ],
            milestones=[],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_missing_provider():
    """Derivation requires at least one provider party."""
    with pytest.raises(ValueError, match="At least one party with role 'provider' is required"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "Nidhi"},
            ],
            milestones=[],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_invalid_party_role():
    """Invalid party role in derivation raises ValueError."""
    with pytest.raises(ValueError, match="Invalid party role"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "invalid_role", "name": "X"},
            ],
            milestones=[],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_empty_party_name():
    """Empty party name raises ValueError."""
    with pytest.raises(ValueError, match="Party name must be non-empty string"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "", "email": "nidhi@legalx.demo"},
            ],
            milestones=[],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


# --- Milestone validation in derivation ---


def test_derive_milestone_invalid_seq():
    """Invalid milestone seq raises ValueError."""
    with pytest.raises(ValueError, match="Milestone seq must be a positive integer"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "Nidhi"},
                {"role": "provider", "name": "Sam"},
            ],
            milestones=[
                {"seq": 0, "name": "X", "amount_minor": 1000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_milestone_negative_amount():
    """Negative milestone amount raises ValueError."""
    with pytest.raises(ValueError, match="Milestone amount must be >= 1 paise"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "Nidhi"},
                {"role": "provider", "name": "Sam"},
            ],
            milestones=[
                {"seq": 1, "name": "X", "amount_minor": -100, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_milestone_invalid_date():
    """Invalid milestone date raises ValueError."""
    with pytest.raises(ValueError, match="Invalid date"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "Nidhi"},
                {"role": "provider", "name": "Sam"},
            ],
            milestones=[
                {"seq": 1, "name": "X", "amount_minor": 1000000, "due_date": "not-a-date", "acceptance_criteria": "OK"},
            ],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_milestone_empty_name():
    """Empty milestone name raises ValueError."""
    with pytest.raises(ValueError, match="Milestone name must be non-empty string"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "Nidhi"},
                {"role": "provider", "name": "Sam"},
            ],
            milestones=[
                {"seq": 1, "name": "", "amount_minor": 1000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_milestone_invalid_acceptance_criteria():
    """Empty acceptance criteria raises ValueError."""
    with pytest.raises(ValueError, match="Milestone acceptance_criteria must be non-empty string"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "Nidhi"},
                {"role": "provider", "name": "Sam"},
            ],
            milestones=[
                {"seq": 1, "name": "X", "amount_minor": 1000000, "due_date": "2026-12-01", "acceptance_criteria": ""},
            ],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


# --- Milestone amount parsing ---


def test_derive_milestone_amount_integer():
    """Integer milestone amount works."""
    ir = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "Nidhi"},
            {"role": "provider", "name": "Sam"},
        ],
        milestones=[
            {"seq": 1, "name": "X", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    assert ir.milestones[0].amount_minor == 5000000


def test_derive_milestone_amount_from_string():
    """String milestone amount works."""
    ir = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "Nidhi"},
            {"role": "provider", "name": "Sam"},
        ],
        milestones=[
            {"seq": 1, "name": "X", "amount_minor": "5000000", "due_date": "2026-12-01", "acceptance_criteria": "OK"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    assert ir.milestones[0].amount_minor == 5000000


def test_derive_milestone_amount_float():
    """Float milestone amount works (exact representable)."""
    ir = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "Nidhi"},
            {"role": "provider", "name": "Sam"},
        ],
        milestones=[
            {"seq": 1, "name": "X", "amount_minor": 5000000.0, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    assert ir.milestones[0].amount_minor == 5000000


def test_derive_milestone_amount_insufficient():
    """Too-small amount raises ValueError."""
    with pytest.raises(ValueError, match="Milestone amount must be >= 1 paise"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "Nidhi"},
                {"role": "provider", "name": "Sam"},
            ],
            milestones=[
                {"seq": 1, "name": "X", "amount_minor": 0, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


def test_derive_milestone_amount_insufficient_negative():
    """Negative amount raises ValueError."""
    with pytest.raises(ValueError, match="Milestone amount must be >= 1 paise"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "Nidhi"},
                {"role": "provider", "name": "Sam"},
            ],
            milestones=[
                {"seq": 1, "name": "X", "amount_minor": -100, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
            ],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


# --- Date parsing ---


def test_derive_date_from_date_object():
    """Date object works."""
    from datetime import date
    ir = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "Nidhi"},
            {"role": "provider", "name": "Sam"},
        ],
        milestones=[
            {"seq": 1, "name": "X", "amount_minor": 5000000, "due_date": date(2026, 12, 1), "acceptance_criteria": "OK"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    assert ir.milestones[0].due_date.isoformat() == "2026-12-01"


def test_derive_date_from_string_iso():
    """ISO string date works."""
    ir = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "Nidhi"},
            {"role": "provider", "name": "Sam"},
        ],
        milestones=[
            {"seq": 1, "name": "X", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "OK"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    assert ir.milestones[0].due_date.isoformat() == "2026-12-01"


def test_derive_date_invalid():
    """Invalid date raises ValueError."""
    with pytest.raises(ValueError, match="Invalid date"):
        derive_ir_from_agreement(
            agreement_type="freelance_milestone",
            currency="INR",
            total_amount=50000.0,
            parties=[
                {"role": "client", "name": "Nidhi"},
                {"role": "provider", "name": "Sam"},
            ],
            milestones=[
                {"seq": 1, "name": "X", "amount_minor": 1000000, "due_date": "invalid", "acceptance_criteria": "OK"},
            ],
            review_period_days=5,
            review_period_basis="calendar",
            dispute_behavior="freeze_affected_payment",
        )


# --- Multilingual / Unicode ---


def test_derive_unicode_party_names():
    """Unicode party names are supported."""
    ir = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "निधि", "email": "nidhi@legalx.demo"},
            {"role": "provider", "name": "समीर"},
        ],
        milestones=[
            {"seq": 1, "name": "डिज़ाइन अनुमोदन", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "ठीक है"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    assert ir.parties[0].name == "निधि"
    assert ir.parties[1].name == "समीर"
    assert ir.milestones[0].name == "डिज़ाइन अनुमोदन"


def test_derive_unicode_milestone_names():
    """Unicode milestone names are supported."""
    ir = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="USD",
        total_amount=10000.0,
        parties=[
            {"role": "client", "name": "Client"},
            {"role": "provider", "name": "Provider"},
        ],
        milestones=[
            {"seq": 1, "name": "Design → Hand-off", "amount_minor": 1000000, "due_date": "2026-06-01", "acceptance_criteria": "Approved"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    assert "→" in ir.milestones[0].name


# --- Determinism ---


def test_derive_determinism():
    """Identical inputs produce identical IRs."""
    ir1 = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "Nidhi"},
            {"role": "provider", "name": "Sam"},
        ],
        milestones=[
            {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "Signed off"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    ir2 = derive_ir_from_agreement(
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount=50000.0,
        parties=[
            {"role": "client", "name": "Nidhi"},
            {"role": "provider", "name": "Sam"},
        ],
        milestones=[
            {"seq": 1, "name": "Design", "amount_minor": 5000000, "due_date": "2026-12-01", "acceptance_criteria": "Signed off"},
        ],
        review_period_days=5,
        review_period_basis="calendar",
        dispute_behavior="freeze_affected_payment",
    )
    assert ir1.agreement_id == ir2.agreement_id
    assert ir1.version_id == ir2.version_id
    assert ir1.total_amount_minor == ir2.total_amount_minor
    assert ir1.review_period_days == ir2.review_period_days