"""B-21: IR provenance spans must point at the quoted source text.

A byte span that is within the text's length but points at different bytes than
the evidence quote is fabricated provenance. It must be omitted instead of
being persisted into the draft Contract IR.
"""

import json

from api.app.intelligence.extractor import _span_matches_quote, extract_agreement
from api.app.intelligence.parsing import find_byte_span as real_find_byte_span
from api.app.intelligence.provider import ScriptedProvider

TEXT = "Total fee INR 50,000 for design."
PAYLOAD = {
    "currency": {"value": "INR", "evidence": "INR"},
    "total_amount": {"value": "INR 50,000", "evidence": "INR 50,000"},
}


def test_span_matches_quote_checks_the_actual_bytes():
    assert _span_matches_quote((10, 13), TEXT, "INR") is True
    # In range, but bytes 0:5 are "Total" - not the quoted passage.
    assert _span_matches_quote((0, 5), TEXT, "INR") is False
    assert _span_matches_quote((0, 10**9), TEXT, "INR") is False


def test_multibyte_quote_is_validated_as_bytes_not_characters():
    text = "Fee ₹50,000 due."
    span = real_find_byte_span(text, "₹50,000")
    assert span is not None
    assert _span_matches_quote(span, text, "₹50,000") is True
    # The character-offset span points at the wrong bytes.
    assert _span_matches_quote((4, 11), text, "₹50,000") is False


def test_fabricated_in_range_span_is_omitted_from_provenance(monkeypatch):
    """An in-range span that does not match the quote is never persisted."""
    import api.app.intelligence.extractor as extractor

    def fake_find_byte_span(text, quote):
        # Correct for every quote except the total: return an in-range span
        # that actually points at "Total", not at "INR 50,000".
        if quote == "INR 50,000":
            return (0, 5)
        return real_find_byte_span(text, quote)

    monkeypatch.setattr(extractor, "find_byte_span", fake_find_byte_span)
    result = extract_agreement(TEXT, ScriptedProvider([json.dumps(PAYLOAD)]))

    provenance = {entry.field: entry for entry in result.provenance}
    # The honest value is still recorded with its correct span.
    assert "currency" in provenance
    assert provenance["currency"].source_span.start == 10
    # The fabricated span is discarded and turned into a clarification.
    assert "total_amount_minor" not in provenance
    assert any(
        entry.field == "total_amount_minor" and "does not match" in entry.reason
        for entry in result.missing_fields
    )
