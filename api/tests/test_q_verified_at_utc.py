"""Regression tests for UTC-aware verification timestamps (B-26)."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from api.app.parity.engine import ParityEngine
from api.app.parity.service import build_comparison_inputs
from api.app.schemas.parity import ExecutionParametersInput
from api.app.timeutil import to_wire, utcnow, utcnow_aware


def test_to_wire_normalises_aware_datetimes_to_utc():
    aware = datetime(2026, 11, 22, 12, 0, tzinfo=timezone.utc)
    assert to_wire(aware) == "2026-11-22T12:00:00Z"

    ist = timezone(timedelta(hours=5, minutes=30))
    assert to_wire(datetime(2026, 11, 22, 17, 30, tzinfo=ist)) == "2026-11-22T12:00:00Z"


def test_utcnow_aware_is_utc_and_matches_naive_convention():
    aware = utcnow_aware()
    assert aware.tzinfo == timezone.utc
    assert aware.replace(tzinfo=None) == utcnow()


def test_engine_result_serialises_aware_verified_at_with_single_z():
    paise = 5000000
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
                seq=1, name="Whole", amount_minor=paise,
                due_date=datetime(2027, 1, 1).date(),
                acceptance_criteria="Done", status="pending",
            )
        ],
    )
    inputs = build_comparison_inputs(
        agreement,
        SimpleNamespace(id="ver-1"),
        ExecutionParametersInput(dispute_behavior="mediate", governing_law="India"),
    )
    result = ParityEngine(inputs.approved_ir, inputs.execution_params).compare(
        verified_at=utcnow_aware()
    )

    assert result.verified_at.tzinfo == timezone.utc
    wire = to_wire(result.verified_at)
    assert wire.endswith("Z")
    assert "+00:00" not in wire
    assert wire.count("Z") == 1
