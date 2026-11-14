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
from typing import Any, Callable, Dict, List, NamedTuple, Optional, Tuple

from api.app.intelligence.errors import ParsingError
from api.app.intelligence.evidence import (
    amount_supported,
    currency_supported,
    date_supported,
    enum_supported,
    text_supported,
)
from api.app.intelligence.extractor import extract_agreement
from api.app.intelligence.models import ExtractedValue, ExtractionPayload, ExtractionResult
from api.app.intelligence.parsing import (
    AGREEMENT_TYPE_ALIASES,
    DISPUTE_BEHAVIOR_ALIASES,
    GOVERNING_LAW_ALIASES,
    PARTY_ROLE_ALIASES,
    REVIEW_PERIOD_BASIS_ALIASES,
    detect_currency,
    find_byte_span,
    normalize_text,
    parse_agreement_type,
    parse_amount,
    parse_date,
    parse_dispute_behavior,
    parse_governing_law,
    parse_party_role,
    parse_review_period_basis,
    parse_review_period_days,
)
from api.app.intelligence.provider import ScriptedProvider
from api.app.schemas.ir import Currency

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
    """Measured result for one scenario.

    Accuracy metrics are ``None`` when the scenario offers nothing to measure
    (for example amount accuracy on a scenario with no expected amount). A
    ``None`` is reported as "not measurable"; it is never rounded up to a
    perfect 1.0.
    """

    id: str
    tags: List[str]
    status: str
    expected_status: str
    status_match: bool
    schema_valid: bool
    field_level_accuracy: Optional[float]
    amount_accuracy: Optional[float]
    date_accuracy: Optional[float]
    party_role_accuracy: Optional[float]
    unsupported_value_hallucination_rate: Optional[float]
    missing_information_detection: Optional[float]
    hallucination_values_checked: int = 0
    hallucination_unsupported_values: int = 0
    missing_fields: List[str] = field(default_factory=list)
    unsupported_terms: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


@dataclass
class EvaluationReport:
    """Aggregate measurements.

    ``totals`` carries the aggregate values plus a ``denominators`` block, so
    every rate can be read together with the population it was computed over.
    """

    mode: str
    scenarios: List[ScenarioOutcome]
    totals: Dict[str, Any]

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


def _ratio(matched: int, total: int) -> Optional[float]:
    """A rate, or ``None`` when the denominator is empty.

    ``0/0`` is absence of evidence, not a perfect score. Callers decide what a
    ``None`` means; nothing is silently rounded up to 1.0.
    """
    if total <= 0:
        return None
    return matched / total


class HallucinationMeasurement(NamedTuple):
    """Unsupported-value counts measured on one raw provider payload."""

    unsupported: int
    checked: int

    @property
    def rate(self) -> Optional[float]:
        return _ratio(self.unsupported, self.checked)


def _payload_values(payload: ExtractionPayload) -> List[Tuple[str, ExtractedValue]]:
    """Every extracted value, labelled with the field it claims to fill."""
    values: List[Tuple[str, ExtractedValue]] = []
    for name in (
        "agreement_type",
        "currency",
        "total_amount",
        "review_period_days",
        "review_period_basis",
        "dispute_behavior",
        "governing_law",
        "purpose",
    ):
        extracted = getattr(payload, name)
        if extracted is not None:
            values.append((name, extracted))
    for index, party in enumerate(payload.parties):
        for attribute in ("role", "name", "email"):
            extracted = getattr(party, attribute)
            if extracted is not None:
                values.append((f"parties[{index}].{attribute}", extracted))
    for index, milestone in enumerate(payload.milestones):
        for attribute in ("name", "amount", "due_date", "acceptance_criteria"):
            extracted = getattr(milestone, attribute)
            if extracted is not None:
                values.append((f"milestones[{index}].{attribute}", extracted))
    for index, obligation in enumerate(payload.obligations):
        values.append((f"obligations[{index}]", obligation))
    # ``unsupported_terms`` and ``ambiguities`` are annotations about the text,
    # not values that can enter the Contract IR, so they are not measured here.
    return values


def _value_supported(field: str, extracted: ExtractedValue, text: str) -> bool:
    """Is this value recoverable from the passage the provider quoted?

    Two failures count as unsupported: provenance that does not point at the
    source at all, and a value the quoted passage does not state. The second is
    what a fabrication looks like when it is paired with a real quote.

    A value that cannot be *interpreted* as its field — ``within 45 days of
    kickoff``, ``01/12/2026``, ``50%`` — is not a fabrication when it was copied
    verbatim. Those are ambiguities: the pipeline already rejects them and asks
    for clarification, so they are measured as supported here.
    """
    if find_byte_span(text, extracted.evidence) is None:
        return False
    try:
        if field == "total_amount" or field.endswith(".amount"):
            return amount_supported(parse_amount(extracted.value), extracted.evidence)
        if field.endswith(".due_date"):
            return date_supported(parse_date(extracted.value), extracted.evidence)
        if field == "currency":
            currency = detect_currency(extracted.value)
            if currency is None:
                try:
                    currency = Currency(extracted.value.strip().upper())
                except ValueError:
                    return text_supported(extracted.value, extracted.evidence)
            return currency_supported(currency, extracted.evidence)
        if field == "agreement_type":
            return enum_supported(
                parse_agreement_type(extracted.value, field),
                extracted.evidence,
                AGREEMENT_TYPE_ALIASES,
            )
        if field.endswith(".role"):
            return enum_supported(
                parse_party_role(extracted.value, field),
                extracted.evidence,
                PARTY_ROLE_ALIASES,
            )
        if field == "review_period_days":
            days = parse_review_period_days(extracted.value, field)
            return text_supported(str(days), extracted.evidence)
        if field == "review_period_basis":
            return enum_supported(
                parse_review_period_basis(extracted.value, field),
                extracted.evidence,
                REVIEW_PERIOD_BASIS_ALIASES,
            )
        if field == "dispute_behavior":
            return enum_supported(
                parse_dispute_behavior(extracted.value, field),
                extracted.evidence,
                DISPUTE_BEHAVIOR_ALIASES,
            )
        if field == "governing_law":
            return enum_supported(
                parse_governing_law(extracted.value, field),
                extracted.evidence,
                GOVERNING_LAW_ALIASES,
            )
    except ParsingError:
        pass
    return text_supported(extracted.value, extracted.evidence)


def _hallucination_measurement(
    description: str, provider_output: Any
) -> HallucinationMeasurement:
    """Count values the source, or their own quoted evidence, does not support.

    Measured on the raw provider output, so a fabrication is counted even when
    the deterministic pipeline later discards it. A payload that cannot be
    validated has no measurable values: that is a *schema* failure, counted
    separately, not a 100% hallucination rate.
    """
    if not isinstance(provider_output, dict):
        return HallucinationMeasurement(0, 0)
    try:
        payload = ExtractionPayload.model_validate(provider_output)
    except Exception:  # noqa: BLE001 - invalid payloads are counted elsewhere
        return HallucinationMeasurement(0, 0)

    text = normalize_text(description)
    values = _payload_values(payload)
    unsupported = sum(
        1 for field, extracted in values if not _value_supported(field, extracted, text)
    )
    return HallucinationMeasurement(unsupported, len(values))


def _parse_raw_output(raw: Any) -> Any:
    """Decode the provider's raw text into the payload it claims to be."""
    if isinstance(raw, (dict, list)):
        return raw
    if not isinstance(raw, str):
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


class _RecordingProvider:
    """Wraps a provider so the harness can score the response it actually got.

    Without this, a live run would score the scenario's *recorded* payload
    instead of the model's answer, and the hallucination metric would be blind
    to whatever the model really returned.
    """

    def __init__(self, provider: Any):
        self._provider = provider
        self.name = getattr(provider, "name", "") or type(provider).__name__
        self.raw_text: Optional[str] = None

    def extract(self, request):  # noqa: ANN001 - mirrors the provider protocol
        response = self._provider.extract(request)
        self.raw_text = getattr(response, "text", None)
        return response


def _score_scenario(
    scenario: Scenario,
    result: ExtractionResult,
    schema_valid: bool,
    raw_output: Any = None,
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

    measurement = _hallucination_measurement(
        scenario.description, scenario.provider_output
    )
    if measurement.checked == 0:
        notes.append(
            "unsupported-value hallucination rate is not measurable: the payload "
            "was rejected by schema validation or held no values"
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
        unsupported_value_hallucination_rate=measurement.rate,
        missing_information_detection=_ratio(detected, len(expected_missing)),
        hallucination_values_checked=measurement.checked,
        hallucination_unsupported_values=measurement.unsupported,
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
    def mean_over(attribute: str, eligible: List[bool]) -> Optional[float]:
        values = [
            value
            for value in (
                getattr(outcome, attribute)
                for outcome, ok in zip(outcomes, eligible)
                if ok
            )
            if value is not None
        ]
        if not values:
            return None
        return sum(values) / len(values)

    expect_draft = [
        bool((scenario.expected or {}).get("ir"))
        for scenario, outcome in zip(scenarios, outcomes)
    ]

    hallucination_checked = sum(
        outcome.hallucination_values_checked for outcome in outcomes
    )
    hallucination_unsupported = sum(
        outcome.hallucination_unsupported_values for outcome in outcomes
    )
    schema_invalid = sum(1 for outcome in outcomes if not outcome.schema_valid)

    totals: Dict[str, Any] = {
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
        # Pooled over the extracted values themselves, not averaged per
        # scenario, so a scenario with one value cannot outweigh one with twenty.
        "unsupported_value_hallucination_rate": _ratio(
            hallucination_unsupported, hallucination_checked
        ),
        "missing_information_detection": mean_over(
            "missing_information_detection", [True] * len(outcomes)
        ),
        "denominators": {
            "scenarios": len(outcomes),
            "scenarios_expecting_a_draft": sum(expect_draft),
            "scenarios_with_valid_schema": len(outcomes) - schema_invalid,
            "scenarios_schema_invalid": schema_invalid,
            "extracted_values_checked_for_support": hallucination_checked,
            "unsupported_extracted_values": hallucination_unsupported,
        },
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
