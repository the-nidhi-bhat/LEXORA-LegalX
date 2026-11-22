"""Regression tests for integer-safe money arithmetic (B-20 / B-22)."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from api.app.parity.service import build_comparison_inputs
from api.app.schemas.parity import ExecutionParametersInput
from api.app.schemas.ir import rupees_to_paise


def test_rupees_to_paise_rounds_decimal_values_exactly():
    """1.015 * 100 is 101.49999999999999 in binary float (paise 101)."""
    assert rupees_to_paise(1.015) == 102
    assert rupees_to_paise(0.575) == 58
    assert rupees_to_paise(50000) == 5000000
    assert rupees_to_paise("50.005") == 5000  # half-even, like round()


def test_rupees_to_paise_preserves_paise_beyond_float_precision():
    """A paise value above 2**53 must survive the rupee round trip unchanged."""
    paise = 9007199254740993
    assert rupees_to_paise(Decimal(paise) / Decimal(100)) == paise


def test_build_comparison_inputs_keeps_large_total_exact():
    """The derived IR must agree with execution parameters on a huge total.

    The old ``total_amount_minor / 100`` float division turned 9007199254740993
    paise into 9007199254740994, producing a spurious blocking parity diff.
    """
    paise = 9007199254740993
    agreement = SimpleNamespace(
        id="ag-1",
        agreement_type="freelance_milestone",
        currency="INR",
        total_amount_minor=paise,
        review_period_days=30,
        review_period_basis="calendar",
        dispute_behavior="mediate",
        governing_law="India",
        parties=[
            SimpleNamespace(role="client", name="Client", email="client@example.com"),
            SimpleNamespace(role="provider", name="Provider", email="provider@example.com"),
        ],
        milestones=[
            SimpleNamespace(
                seq=1,
                name="Whole",
                amount_minor=paise,
                due_date=date(2027, 1, 1),
                acceptance_criteria="Done",
                status="pending",
            )
        ],
    )
    version = SimpleNamespace(id="ver-1")

    inputs = build_comparison_inputs(
        agreement,
        version,
        ExecutionParametersInput(dispute_behavior="mediate", governing_law="India"),
    )

    assert inputs.approved_ir.total_amount_minor == paise
    assert inputs.execution_params.total_amount_minor == paise
