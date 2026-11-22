"""Regression tests for IR provenance offset bounds (B-30)."""

import json

import pytest

from api.app.intelligence.extractor import _span_is_within_text, extract_agreement
from api.app.intelligence.models import SourceSpan
from api.app.intelligence.provider import ScriptedProvider

TEXT = "Total fee INR 50,000 for design."
PAYLOAD = {
    "agreement_type": {"value": "freelance milestone", "evidence": "freelance milestone"},
    "currency": {"value": "INR", "evidence": "INR"},
    "total_amount": {"value": "INR 50,000", "evidence": "INR 50,000"},
}


def test_span_within_text_rejects_out_of_range_offsets():
    assert _span_is_within_text((0, len(TEXT.encode("utf-8"))), TEXT) is True
    assert _span_is_within_text((0, 10**9), TEXT) is False
    assert _span_is_within_text((-1, 3), TEXT) is False
    assert _span_is_within_text((3, 3), TEXT) is False
    assert _span_is_within_text((5, 2), TEXT) is False
    assert _span_is_within_text((True, 4), TEXT) is False


def test_source_span_rejects_non_positive_length():
    with pytest.raises(ValueError, match="end must be greater than start"):
        SourceSpan(start=5, end=5)
    with pytest.raises(ValueError):
        SourceSpan(start=5, end=2)


def test_extractor_discards_out_of_range_provenance(monkeypatch):
    """A span beyond the source bytes is treated as missing, never persisted."""
    import api.app.intelligence.extractor as extractor

    monkeypatch.setattr(
        extractor, "find_byte_span", lambda text, quote: (0, 10**9)
    )
    result = extract_agreement(TEXT, ScriptedProvider([json.dumps(PAYLOAD)]))

    assert result.provenance == []
    assert result.missing_fields
    assert any("outside the source text" in m.reason for m in result.missing_fields)
