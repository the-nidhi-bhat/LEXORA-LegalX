"""The evaluation harness: dataset integrity and measured results."""

import json

from api.app.intelligence.evaluation import (
    Scenario,
    evaluate_dataset,
    load_dataset,
    main,
)

METRIC_KEYS = (
    "status_match_rate",
    "schema_validation_success",
    "field_level_accuracy",
    "amount_accuracy",
    "date_accuracy",
    "party_role_accuracy",
    "unsupported_value_hallucination_rate",
    "missing_information_detection",
)


def test_dataset_loads_with_unique_ids():
    """The dataset is well formed and every scenario is identifiable."""
    scenarios = load_dataset()
    assert len(scenarios) >= 8
    ids = [scenario.id for scenario in scenarios]
    assert len(ids) == len(set(ids))


def test_dataset_covers_the_required_scenarios():
    """The dataset covers every scenario class the brief requires."""
    scenarios = load_dataset()
    by_id = {scenario.id: scenario for scenario in scenarios}
    assert "complete_freelance_inr" in by_id
    assert "missing_payment_amounts" in by_id
    assert "relative_deadlines" in by_id
    assert "ambiguous_numeric_date" in by_id
    assert "conflicting_party_identities" in by_id
    assert "multiple_milestones" in by_id
    assert "unsupported_legal_terms" in by_id
    assert "prompt_injection_unknown_field" in by_id
    assert "prompt_injection_conflicting_total" in by_id
    assert "malformed_provider_output" in by_id


def test_dataset_expectations_are_consistent_with_the_recorded_output():
    """Each scenario declares the status the pipeline must reach."""
    for scenario in load_dataset():
        assert scenario.expected.get("status") in (
            "complete",
            "needs_clarification",
            "rejected",
        )
        assert "ir" in scenario.expected


def test_every_scenario_reaches_its_expected_status():
    """The deterministic pipeline behaves as the dataset expects."""
    report = evaluate_dataset(load_dataset())
    assert report.totals["status_match_rate"] == 1.0
    for outcome in report.scenarios:
        assert outcome.status_match, f"{outcome.id} did not match its expectation"


def test_measured_metrics_stay_within_bounds():
    """No metric is outside 0..1, and "not measurable" is never a score."""
    report = evaluate_dataset(load_dataset())
    for key in METRIC_KEYS:
        value = report.totals[key]
        assert value is None or 0.0 <= value <= 1.0, f"{key} out of bounds: {value}"
    for key, value in report.totals["denominators"].items():
        assert isinstance(value, int) and value >= 0, f"{key} is not a count: {value}"


def test_complete_scenarios_are_extracted_exactly():
    """Field, amount, date and role accuracy are perfect on the complete cases."""
    report = evaluate_dataset(load_dataset())
    by_id = {outcome.id: outcome for outcome in report.scenarios}
    complete = by_id["complete_freelance_inr"]
    assert complete.field_level_accuracy == 1.0
    assert complete.amount_accuracy == 1.0
    assert complete.date_accuracy == 1.0
    assert complete.party_role_accuracy == 1.0
    assert complete.unsupported_value_hallucination_rate == 0.0
    assert complete.hallucination_values_checked > 0
    # Nothing is missing from this scenario, so detection has no denominator.
    # Absence of a case is reported as "not measurable", never as a perfect 1.0.
    assert complete.missing_information_detection is None


def test_injected_output_is_counted_as_a_schema_failure_not_a_hallucination():
    """A payload that fails validation has no measurable values.

    It used to be reported as a 100% hallucination rate, which conflated "the
    payload could not be validated" with "every value was fabricated". The two
    failures are now counted separately.
    """
    report = evaluate_dataset(load_dataset())
    by_id = {outcome.id: outcome for outcome in report.scenarios}
    injected = by_id["prompt_injection_unknown_field"]
    assert injected.status == "rejected"
    assert injected.schema_valid is False
    assert injected.unsupported_value_hallucination_rate is None
    assert injected.hallucination_values_checked == 0
    assert report.totals["denominators"]["scenarios_schema_invalid"] >= 1


def test_fabricated_value_paired_with_a_real_quote_is_measured_as_unsupported():
    """Presence of a quote is not enough: the value must come from it."""
    scenarios = load_dataset()
    scenario = next(s for s in scenarios if s.id == "complete_freelance_inr")
    payload = json.loads(json.dumps(scenario.provider_output))
    payload["total_amount"] = {
        "value": "INR 90,000",
        "evidence": payload["total_amount"]["evidence"],
    }
    fabricated = Scenario(
        id="fabricated_total",
        description=scenario.description,
        provider_output=payload,
        expected=scenario.expected,
        tags=["adversarial"],
    )
    report = evaluate_dataset([fabricated])
    outcome = report.scenarios[0]
    assert outcome.hallucination_values_checked > 0
    assert outcome.hallucination_unsupported_values >= 1
    assert outcome.unsupported_value_hallucination_rate > 0.0
    assert outcome.status == "needs_clarification"
    assert report.totals["denominators"]["unsupported_extracted_values"] >= 1


def test_totals_report_the_population_behind_each_rate():
    """Every aggregate is accompanied by the denominator it was computed over."""
    report = evaluate_dataset(load_dataset())
    denominators = report.totals["denominators"]
    assert denominators["scenarios"] == len(report.scenarios)
    assert (
        denominators["scenarios_with_valid_schema"]
        + denominators["scenarios_schema_invalid"]
        == len(report.scenarios)
    )
    assert (
        denominators["extracted_values_checked_for_support"]
        >= denominators["unsupported_extracted_values"]
    )


def test_missing_information_is_detected_in_every_scenario():
    """The pipeline reports every missing field the dataset expects."""
    report = evaluate_dataset(load_dataset())
    assert report.totals["missing_information_detection"] == 1.0


def test_scorer_reports_a_wrong_value_instead_of_hiding_it():
    """A wrong expectation lowers the measured accuracy."""
    scenarios = load_dataset()
    scenario = next(s for s in scenarios if s.id == "complete_freelance_inr")
    expected = json.loads(json.dumps(scenario.expected))
    expected["ir"]["total_amount_minor"] = 123456
    broken = Scenario(
        id=scenario.id,
        description=scenario.description,
        provider_output=scenario.provider_output,
        expected=expected,
        tags=scenario.tags,
    )
    report = evaluate_dataset([broken])
    outcome = report.scenarios[0]
    assert outcome.amount_accuracy < 1.0
    assert outcome.field_level_accuracy < 1.0
    assert outcome.status_match is True


def test_cli_prints_a_machine_readable_report(capsys):
    """The evaluation can be run from the command line."""
    exit_code = main(["--provider", "scripted"])
    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["mode"] == "scripted"
    assert payload["totals"]["scenarios"] >= 8
