"""Strict parsing rules for extracted values."""

from datetime import date

import pytest

from api.app.intelligence.errors import ParsingError
from api.app.intelligence.parsing import (
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
from api.app.schemas.ir import Currency, DisputeBehavior, GoverningLaw, PartyRole


# ---- Amounts ----

def test_parse_amount_rupees_with_symbol():
    """₹50,000 is 5000000 paise."""
    parsed = parse_amount("₹50,000")
    assert parsed.amount_minor == 5000000
    assert parsed.currency == Currency.INR


def test_parse_amount_indian_grouping():
    """Indian grouping (1,20,000) is one hundred and twenty thousand rupees."""
    parsed = parse_amount("INR 1,20,000")
    assert parsed.amount_minor == 12000000
    assert parsed.currency == Currency.INR


def test_parse_amount_with_decimals():
    """Two decimal places are exact in minor units."""
    parsed = parse_amount("$5,000.50")
    assert parsed.amount_minor == 500050
    assert parsed.currency == Currency.USD


def test_parse_amount_in_minor_units():
    """An amount already written in paise is not multiplied again."""
    parsed = parse_amount("500000 paise")
    assert parsed.amount_minor == 500000


def test_parse_amount_rejects_more_than_two_decimals():
    """A third decimal place cannot be represented exactly and is rejected."""
    with pytest.raises(ParsingError, match="more than two decimal places"):
        parse_amount("₹1000.125")


def test_parse_amount_rejects_percentage():
    """A percentage has no base amount, so it is not a money value."""
    with pytest.raises(ParsingError, match="percentage"):
        parse_amount("50%")


def test_parse_amount_rejects_zero_and_negative():
    """Zero and negative amounts are rejected."""
    with pytest.raises(ParsingError, match="greater than zero"):
        parse_amount("₹0")
    with pytest.raises(ParsingError, match="greater than zero"):
        parse_amount("-₹100")


def test_parse_amount_rejects_text_without_number():
    """An amount with no number is rejected instead of defaulting to zero."""
    with pytest.raises(ParsingError, match="no number"):
        parse_amount("a mutually agreeable sum")


def test_detect_currency_handles_symbols():
    """Currency symbols are detected for the supported currencies."""
    assert detect_currency("₹100") == Currency.INR
    assert detect_currency("$100") == Currency.USD
    assert detect_currency("€100") == Currency.EUR
    assert detect_currency("£100") == Currency.GBP
    assert detect_currency("100") is None


# ---- Dates ----

def test_parse_date_iso():
    """ISO dates parse directly."""
    assert parse_date("2026-12-01") == date(2026, 12, 1)


def test_parse_date_day_month_year():
    """Day-first written dates parse."""
    assert parse_date("1 December 2026") == date(2026, 12, 1)
    assert parse_date("15 Jan 2027") == date(2027, 1, 15)


def test_parse_date_month_day_year():
    """Month-first written dates parse."""
    assert parse_date("December 1, 2026") == date(2026, 12, 1)


def test_parse_date_rejects_ambiguous_numeric_format():
    """01/12/2026 has no stated day/month order and is rejected."""
    with pytest.raises(ParsingError, match="ambiguous"):
        parse_date("01/12/2026")


def test_parse_date_rejects_relative_dates():
    """Relative dates need a reference date and are rejected."""
    with pytest.raises(ParsingError, match="relative"):
        parse_date("within 45 days of kickoff")


def test_parse_date_rejects_impossible_date():
    """An impossible calendar date is rejected."""
    with pytest.raises(ParsingError, match="not a real calendar date"):
        parse_date("31 February 2026")


# ---- Enums ----

def test_parse_party_role_aliases():
    """Common wording maps onto the supported roles."""
    assert parse_party_role("hiring party") == PartyRole.CLIENT
    assert parse_party_role("Freelancer") == PartyRole.PROVIDER
    assert parse_party_role("witness") == PartyRole.WITNESS


def test_parse_party_role_rejects_unsupported():
    """An unsupported role is an error, not a default."""
    with pytest.raises(ParsingError, match="not a supported option"):
        parse_party_role("guarantor")


def test_parse_review_period_basis_aliases():
    """Basis wording maps onto calendar or business."""
    assert parse_review_period_basis("calendar days") == "calendar"
    assert parse_review_period_basis("working days") == "business"


def test_parse_dispute_behavior_aliases():
    """Dispute wording maps onto the supported behaviours."""
    assert parse_dispute_behavior("mediation") == DisputeBehavior.MEDIATE
    assert parse_dispute_behavior("binding arbitration") == DisputeBehavior.ARBITRATE
    assert (
        parse_dispute_behavior("freeze affected payments")
        == DisputeBehavior.FREEZE_AFFECTED_PAYMENT
    )


def test_parse_governing_law_aliases():
    """Jurisdiction wording maps onto the supported laws."""
    assert parse_governing_law("Indian law") == GoverningLaw.INDIA
    assert parse_governing_law("English law") == GoverningLaw.UNITED_KINGDOM


def test_parse_governing_law_rejects_unsupported_jurisdiction():
    """An unsupported jurisdiction is an error, not a silent null."""
    with pytest.raises(ParsingError, match="not a supported option"):
        parse_governing_law("Republic of Wakanda")


def test_parse_agreement_type_aliases():
    """Agreement wording maps onto the supported types."""
    assert parse_agreement_type("freelance") == "freelance_milestone"
    assert parse_agreement_type("services agreement") == "service_agreement"


# ---- Review period ----

def test_parse_review_period_days_accepts_plain_and_written():
    """Both "30" and "30 calendar days" parse to 30."""
    assert parse_review_period_days("30") == 30
    assert parse_review_period_days("30 calendar days") == 30
    assert parse_review_period_days("14 business days") == 14


def test_parse_review_period_days_rejects_out_of_range():
    """The supported 1-90 day window is enforced."""
    with pytest.raises(ParsingError, match="outside the supported range"):
        parse_review_period_days("0")
    with pytest.raises(ParsingError, match="outside the supported range"):
        parse_review_period_days("91")


# ---- Text helpers ----

def test_normalize_text_is_idempotent():
    """Normalization is stable, so provenance offsets stay valid."""
    raw = "  Line one\r\nLine two  \r\n"
    once = normalize_text(raw)
    assert normalize_text(once) == once
    assert "Line one\nLine two" in once


def test_find_byte_span_returns_offsets():
    """Byte offsets of a passage are located exactly."""
    text = "Total fee INR 50,000 for the build."
    span = find_byte_span(text, "INR 50,000")
    assert span is not None
    start, end = span
    assert text.encode("utf-8")[start:end].decode("utf-8") == "INR 50,000"


def test_find_byte_span_returns_none_when_absent():
    """A passage that is not in the text has no span."""
    assert find_byte_span("Total fee INR 50,000", "INR 9,99,999") is None
