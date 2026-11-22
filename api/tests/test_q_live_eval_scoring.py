"""B-28: a live evaluation must score the model's output, not the dataset fixture.

The harness ships a ``_RecordingProvider`` and a ``_parse_raw_output`` helper
whose entire purpose is to capture what the provider actually returned. Before
this fix they were dead code: schema validity and the hallucination metric were
computed from ``scenario.provider_output`` (the recorded/simulated fixture). In
``--provider gemini`` mode that fabricates a "live" score without ever looking
at the model's answer.

These tests use fake providers only. No credential is read or required.
"""

import json

from api.app.intelligence.errors import ProviderError
from api.app.intelligence.evaluation import Scenario, evaluate_dataset, load_dataset
from api.app.intelligence.provider import ProviderResponse


class _StubProvider:
    """A provider that returns a fixed raw text, independent of the fixture."""

    name = "stub"

    def __init__(self, text):
        self.text = text
        self.calls = 0

    def extract(self, request):
        self.calls += 1
        return ProviderResponse(text=self.text, model="stub-model", provider=self.name)


def _complete_scenario():
    return next(s for s in load_dataset() if s.id == "complete_freelance_inr")


def _factory(text):
    provider = _StubProvider(text)

    def factory(scenario):
        return provider

    return factory, provider


def test_hallucination_is_measured_on_actual_model_output_not_the_fixture():
    """A fabricated value in the model's answer must be counted as unsupported."""
    scenario = _complete_scenario()
    actual = json.loads(json.dumps(scenario.provider_output))
    # The fixture is clean, but the model hallucinated a total that is nowhere in
    # the description. Its evidence is also not present verbatim in the text.
    actual["total_amount"] = {"value": "INR 99,999", "evidence": "INR 99,999"}

    factory, provider = _factory(json.dumps(actual))
    report = evaluate_dataset([scenario], factory, mode="live-gemini")
    outcome = report.scenarios[0]

    assert provider.calls == 1
    # The hallucination metric must reflect the ACTUAL output, not the fixture.
    assert outcome.hallucination_values_checked > 0
    assert outcome.hallucination_unsupported_values >= 1
    assert outcome.unsupported_value_hallucination_rate > 0.0


def test_schema_validity_is_computed_from_actual_model_output():
    """A valid model payload cannot inherit the fixture's invalid schema score."""
    base = _complete_scenario()
    # The recorded fixture is structurally invalid (unknown key), while the
    # model returned a clean, valid payload. The score must follow the model.
    invalid_fixture = json.loads(json.dumps(base.provider_output))
    invalid_fixture["approved"] = True
    scenario = Scenario(
        id=base.id,
        description=base.description,
        provider_output=invalid_fixture,
        expected=base.expected,
        tags=list(base.tags),
    )

    factory, _ = _factory(json.dumps(base.provider_output))
    report = evaluate_dataset([scenario], factory, mode="live-gemini")
    assert report.scenarios[0].schema_valid is True


def test_no_captured_model_output_never_yields_a_live_score():
    """When the model returns nothing, no score may be reported as live."""
    scenario = _complete_scenario()

    def failing_factory(scenario):
        class _Failing:
            name = "failing"

            def extract(self, request):
                raise ProviderError("upstream unavailable", provider="failing")

        return _Failing()

    report = evaluate_dataset([scenario], failing_factory, mode="live-gemini")
    outcome = report.scenarios[0]

    assert outcome.scored_from_model_output is False
    assert outcome.schema_valid is False
    assert outcome.unsupported_value_hallucination_rate is None
    assert outcome.hallucination_values_checked == 0
    assert any("no model output" in note.lower() for note in outcome.notes)
    assert report.totals["denominators"]["scenarios_with_captured_model_output"] == 0
    # The honest guard: this report must not present itself as a valid live score.
    assert report.live_scores_valid is False
    assert report.to_dict()["live_scores_valid"] is False


def test_scripted_mode_still_scores_the_replayed_fixture():
    """The default scripted path is unchanged: fixture == actual output."""
    report = evaluate_dataset(load_dataset())
    by_id = {o.id: o for o in report.scenarios}
    complete = by_id["complete_freelance_inr"]
    assert complete.scored_from_model_output is True
    assert complete.schema_valid is True
    assert complete.unsupported_value_hallucination_rate == 0.0
    assert report.totals["denominators"]["scenarios_with_captured_model_output"] == len(
        report.scenarios
    )
