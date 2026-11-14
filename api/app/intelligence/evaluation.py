"""Evaluation harness for contract extraction.

Two modes:

- **scripted** (default, deterministic): each scenario carries the provider
  output that is replayed, so the pipeline can be measured reproducibly. This
  measures the *pipeline* — validation, provenance checking, clarification
  generation — not a language model.
- **live**: the same scenarios are run against the Gemini provider. This
  measures the model. It requires ``GEMINI_API_KEY`` and network access, so it
  is never part of the deterministic test suite.

Metrics are computed from real runs. Nothing here fabricates a score.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from api.app.intelligence.extractor import extract_agreement
from api.app.intelligence.models import ExtractionPayload, ExtractionResult
from api.app.intelligence.parsing import find_byte_span, normalize_text
from api.app.intelligence.provider import ScriptedProvider

DEFAULT_DATASET = Path(__file__).with_name("dataset.json")


@dataclass(frozen=True)
class Scenario:
    """One evaluation scenario."""

    id: str
    description: str
    provider_output: Dict[str, Any]
    expected: Dict[str, Any]
    tags: List[str] = field(default_factory=list)


@dataclass
class ScenarioOutcome:
    """Measured result for one scenario."""

    id: str
    tags: List[str]
    status: str
    expected_status: str
    status_match: bool
    schema_valid: bool
    field_level_accuracy: float
    amount_accuracy: float
    date_accuracy: float
    party_role_accuracy: float
    unsupported_value_hallucination_rate: Optional[float]
    missing_information_detection: float
    missing_fields: List[str] = field(default_factory=list)
    unsupported_terms: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


@dataclass
class EvaluationReport:
    """Aggregate measurements."""

    mode: str
    scenarios: List[ScenarioOutcome]
    totals: Dict[str, float]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "totals": self.totals,
            "scenarios": [asdict(outcome) for outcome in self.scenarios],
        }


def load_dataset(path: Optional[Path] = None) -> List[Scenario]:
    """Load the evaluation dataset from disk."""
    dataset_path = Path(path or DEFAULT_DATASET)
    data = json.loads(dataset_path.read_text(encoding="utf-8"))
    scenarios = []
    for entry in data["scenarios"]:
        scenarios.append(
            Scenario(
                id=entry["id"],
                description=entry["description"],
                provider_output=entry["provider_output"],
                expected=entry["expected"],
                tags=list(entry.get("tags", [])),
            )
        )
    return scenarios


def _ratio(matched: int, total: int) -> float:
    if total <= 0:
        return 1.0
    return matched / total


def _hallucination_rate(description: str, provider_output: Dict[str, Any]) -> Optional[float]:
    """Fraction of extracted values whose evidence is absent from the source.

    This is measured on the raw provider output, so it detects a provider that
    returns a value the source text does not support even when the pipeline
    later discards it. Returns ``None`` when the payload is not an object and
    the metric is therefore not measurable.
    """
    text = normalize_text(description)
    if not isinstance(provider_output, dict):
        # A non-object payload cannot be validated at all.
        return None
    try:
        payload = ExtractionPayload.model_validate(provider_output)
    except Exception:  # noqa: BLE001 - invalid payloads are handled elsewhere
        return 1.0

    values = [
        payload.agreement_type,
        payload.currency,
        payload.total_amount,
        payload.review_period_days,
        payload.review_period_basis,
        payload.dispute_behavior,
        payload.governing_law,
        payload.purpose,
    ]
    for party in payload.parties:
        values.extend([party.role, party.name, party.email])
    for milestone in payload.milestones:
        values.extend(
            [
                milestone.name,
                milestone.amount,
                milestone.due_date,
                milestone.acceptance_criteria,
            ]
        )
    values.extend(payload.obligations)
    values.extend(payload.unsupported_terms)
    values.extend(payload.ambiguities)

    present = [value for value in values if value is not None]
    if not present:
        return 0.0
    unsupported = sum(
        1 for value in present if find_byte_span(text, value.evidence) is None
    )
    return unsupported / len(present)


def _score_scenario(
    scenario: Scenario, result: ExtractionResult, schema_valid: bool
) -> ScenarioOutcome:
    expected = scenario.expected
    expected_ir = expected.get("ir", {}) or {}
    actual_ir = result.contract_ir

    field_matched = field_total = 0
    amount_matched = amount_total = 0
    date_matched = date_total = 0
    role_matched = role_total = 0

    if actual_ir is not None:
        for key in ("agreement_type", "currency", "review_period_days",
                    "review_period_basis", "dispute_behavior", "governing_law"):
            if key not in expected_ir:
                continue
            field_total += 1
            actual_value = getattr(actual_ir, key)
            actual_value = getattr(actual_value, "value", actual_value)
            expected_value = expected_ir[key]
            if str(actual_value) == str(expected_value):
                field_matched += 1

        if "total_amount_minor" in expected_ir:
            field_total += 1
            amount_total += 1
            if actual_ir.total_amount_minor == expected_ir["total_amount_minor"]:
                field_matched += 1
                amount_matched += 1

        expected_milestones = expected_ir.get("milestones", [])
        actual_milestones = {m.seq: m for m in actual_ir.milestones}
        for expected_milestone in expected_milestones:
            actual_milestone = actual_milestones.get(expected_milestone["seq"])
            # Each milestone contributes three field checks: amount, due date, name.
            field_total += 3
            if actual_milestone is None:
                continue
            amount_total += 1
            date_total += 1
            if actual_milestone.amount_minor == expected_milestone["amount_minor"]:
                amount_matched += 1
                field_matched += 1
            if actual_milestone.due_date.isoformat() == expected_milestone["due_date"]:
                date_matched += 1
                field_matched += 1
            if actual_milestone.name == expected_milestone["name"]:
                field_matched += 1

        expected_parties = expected_ir.get("parties", [])
        actual_parties = {p.role.value: p for p in actual_ir.parties}
        for expected_party in expected_parties:
            role_total += 1
            field_total += 1
            actual_party = actual_parties.get(expected_party["role"])
            if actual_party is None:
                continue
            if actual_party.name == expected_party["name"]:
                field_matched += 1
                role_matched += 1

    if actual_ir is None and expected_ir:
        # The pipeline did not produce a draft even though one was expected.
        field_total += 1

    expected_missing = set(expected.get("missing_fields", []) or [])
    actual_missing = {entry.field for entry in result.missing_fields}
    detected = len(expected_missing & actual_missing)

    expected_unsupported = set(expected.get("unsupported_terms", []) or [])
    actual_unsupported = set(result.unsupported_terms)

    notes: List[str] = []
    if expected_unsupported != actual_unsupported:
        notes.append(
            f"unsupported terms differ: expected {sorted(expected_unsupported)}, "
            f"got {sorted(actual_unsupported)}"
        )

    return ScenarioOutcome(
        id=scenario.id,
        tags=list(scenario.tags),
        status=result.status,
        expected_status=expected.get("status", "complete"),
        status_match=result.status == expected.get("status", "complete"),
        schema_valid=schema_valid and (actual_ir is not None or not expected_ir),
        field_level_accuracy=_ratio(field_matched, field_total),
        amount_accuracy=_ratio(amount_matched, amount_total),
        date_accuracy=_ratio(date_matched, date_total),
        party_role_accuracy=_ratio(role_matched, role_total),
        unsupported_value_hallucination_rate=_hallucination_rate(
            scenario.description, scenario.provider_output
        ),
        missing_information_detection=_ratio(detected, len(expected_missing)),
        missing_fields=sorted(actual_missing),
        unsupported_terms=sorted(actual_unsupported),
        notes=notes,
    )


def evaluate_dataset(
    scenarios: List[Scenario],
    provider_factory: Optional[Callable[[Scenario], Any]] = None,
    *,
    mode: str = "scripted",
) -> EvaluationReport:
    """Run every scenario and measure the result.

    ``provider_factory`` defaults to a scripted provider that replays the
    scenario's recorded provider output.
    """
    if provider_factory is None:
        provider_factory = lambda scenario: ScriptedProvider(  # noqa: E731
            [
                scenario.provider_output
                if isinstance(scenario.provider_output, str)
                else json.dumps(scenario.provider_output, ensure_ascii=False)
            ],
            model="scripted-model",
        )

    outcomes: List[ScenarioOutcome] = []
    for scenario in scenarios:
        provider = provider_factory(scenario)
        result = extract_agreement(scenario.description, provider)
        try:
            ExtractionPayload.model_validate(scenario.provider_output)
            schema_valid = True
        except Exception:  # noqa: BLE001
            schema_valid = False
        outcomes.append(_score_scenario(scenario, result, schema_valid))

    # Field/amount/date/role metrics only make sense for scenarios that expect
    # a draft IR; clarification and rejection scenarios are scored on status,
    # schema validity, hallucination rate and missing-information detection.
    def mean_over(attribute: str, eligible: List[bool]) -> float:
        values = [
            getattr(outcome, attribute)
            for outcome, ok in zip(outcomes, eligible)
            if ok
        ]
        return _ratio(sum(values), len(values)) if values else 0.0

    expect_draft = [
        bool((scenario.expected or {}).get("ir"))
        for scenario, outcome in zip(scenarios, outcomes)
    ]

    totals = {
        "scenarios": float(len(outcomes)),
        "status_match_rate": _ratio(
            sum(1 for outcome in outcomes if outcome.status_match), len(outcomes)
        ),
        "schema_validation_success": _ratio(
            sum(1 for outcome in outcomes if outcome.schema_valid), len(outcomes)
        ),
        "field_level_accuracy": mean_over("field_level_accuracy", expect_draft),
        "amount_accuracy": mean_over("amount_accuracy", expect_draft),
        "date_accuracy": mean_over("date_accuracy", expect_draft),
        "party_role_accuracy": mean_over("party_role_accuracy", expect_draft),
        "unsupported_value_hallucination_rate": _ratio(
            sum(
                outcome.unsupported_value_hallucination_rate
                for outcome in outcomes
                if outcome.unsupported_value_hallucination_rate is not None
            ),
            sum(1 for outcome in outcomes if outcome.unsupported_value_hallucination_rate is not None),
        ),
        "missing_information_detection": _ratio(
            sum(outcome.missing_information_detection for outcome in outcomes),
            len(outcomes),
        ),
    }
    return EvaluationReport(mode=mode, scenarios=outcomes, totals=totals)


def _live_provider_factory(scenario: Scenario):  # pragma: no cover - needs credentials
    from api.app.intelligence.gemini_provider import GeminiExtractionProvider

    return GeminiExtractionProvider()


def main(argv: Optional[List[str]] = None) -> int:
    """Run the evaluation and print a JSON report."""
    parser = argparse.ArgumentParser(description="Evaluate contract extraction")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET))
    parser.add_argument(
        "--provider",
        choices=("scripted", "gemini"),
        default="scripted",
        help="scripted replays recorded provider output; gemini calls the live API",
    )
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)

    scenarios = load_dataset(Path(args.dataset))
    if args.provider == "gemini":
        if not os.environ.get("GEMINI_API_KEY"):
            raise SystemExit(
                "GEMINI_API_KEY is not set; live evaluation cannot run."
            )
        report = evaluate_dataset(
            scenarios, _live_provider_factory, mode="live-gemini"
        )
    else:
        report = evaluate_dataset(scenarios, mode="scripted")

    payload = json.dumps(report.to_dict(), indent=2, ensure_ascii=False)
    if args.out:
        Path(args.out).write_text(payload, encoding="utf-8")
    print(payload)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


__all__ = [
    "DEFAULT_DATASET",
    "EvaluationReport",
    "Scenario",
    "ScenarioOutcome",
    "evaluate_dataset",
    "load_dataset",
    "main",
]
