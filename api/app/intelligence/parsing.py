"""Strict parsing of extracted values.

Every helper here either returns a value that the source text supports, or
raises :class:`ParsingError` with a reason. Nothing defaults, rounds silently
or guesses:

- amounts become exact integer minor units (paise/cents); a value with more
  than two decimal places is an error, not a rounded number;
- dates must be unambiguous — ``01/12/2026`` is rejected because the day/month
  order is not stated, and relative dates are rejected because they need a
  reference date;
- enums are matched against the supported IR values and an explicit alias table.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date as date_type
from decimal import Decimal, InvalidOperation
from typing import Optional, Type, TypeVar

from api.app.intelligence.errors import ParsingError
from api.app.schemas.ir import (
    AgreementType,
    Currency,
    DisputeBehavior,
    GoverningLaw,
    PartyRole,
    ReviewPeriodBasis,
)

EnumT = TypeVar("EnumT")

#: Minor units per major unit for every supported currency.
MINOR_UNITS = 100

_CURRENCY_PATTERNS = (
    (re.compile(r"(?i)₹|\b(?:inr|rupees?)\b|\brs\.?"), Currency.INR),
    (re.compile(r"(?i)\bus\$|\$|\b(?:usd|dollars?)\b"), Currency.USD),
    (re.compile(r"(?i)€|\b(?:eur|euros?)\b"), Currency.EUR),
    (re.compile(r"(?i)£|\b(?:gbp|pounds?)\b"), Currency.GBP),
)

_MINOR_UNIT_MARKERS = re.compile(r"(?i)\b(?:paise|paisa|cents?|minor units?)\b")

#: Characters a number token may contain. Anything else ends the token, so an
#: unsupported notation is detected rather than silently truncated.
_NUMBER_TOKEN_RE = re.compile(r"-?\d[\d,._]*")

#: Grammars an amount may be written in. The Indian lakh/crore grouping
#: (``1,20,000``) and the thousands grouping (``1,000,000``) are both accepted;
#: a malformed grouping such as ``1.20.000`` is not.
_ALLOWED_NUMBER_RE = re.compile(
    r"^-?(?:\d{1,2}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?$"
)

#: Percentages are not amounts. The symbol is checked separately; these are the
#: written forms that would otherwise be parsed as a plain number.
_PERCENT_WORD_RE = re.compile(r"(?i)\bpercent(?:age)?\b|\bper\s+cent\b")

#: Notations that historically truncated to a wrong value: ``1e6`` → 1,
#: ``1_000`` → 1, ``1.5e3`` → 1.5, ``50k`` → 50.
_UNSUPPORTED_NOTATION_RE = re.compile(r"(?i)(?:\d\s*e\s*[-+]?\d)|(?:\d_\d)|(?:\d[A-Za-z])")

_MONTHS = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DAY_MONTH_YEAR_RE = re.compile(r"^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$")
_MONTH_DAY_YEAR_RE = re.compile(r"^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$")

PARTY_ROLE_ALIASES = {
    "client": PartyRole.CLIENT,
    "customer": PartyRole.CLIENT,
    "hiring party": PartyRole.CLIENT,
    "buyer": PartyRole.CLIENT,
    "employer": PartyRole.CLIENT,
    "provider": PartyRole.PROVIDER,
    "contractor": PartyRole.PROVIDER,
    "freelancer": PartyRole.PROVIDER,
    "vendor": PartyRole.PROVIDER,
    "supplier": PartyRole.PROVIDER,
    "service provider": PartyRole.PROVIDER,
    "developer": PartyRole.PROVIDER,
    "designer": PartyRole.PROVIDER,
    "witness": PartyRole.WITNESS,
    "observer": PartyRole.WITNESS,
}

REVIEW_PERIOD_BASIS_ALIASES = {
    "calendar": ReviewPeriodBasis.CALENDAR,
    "calendar day": ReviewPeriodBasis.CALENDAR,
    "calendar days": ReviewPeriodBasis.CALENDAR,
    "days": ReviewPeriodBasis.CALENDAR,
    "business": ReviewPeriodBasis.BUSINESS,
    "business day": ReviewPeriodBasis.BUSINESS,
    "business days": ReviewPeriodBasis.BUSINESS,
    "working day": ReviewPeriodBasis.BUSINESS,
    "working days": ReviewPeriodBasis.BUSINESS,
}

DISPUTE_BEHAVIOR_ALIASES = {
    "mediate": DisputeBehavior.MEDIATE,
    "mediated": DisputeBehavior.MEDIATE,
    "mediation": DisputeBehavior.MEDIATE,
    "negotiation": DisputeBehavior.MEDIATE,
    "negotiate": DisputeBehavior.MEDIATE,
    "arbitrate": DisputeBehavior.ARBITRATE,
    "arbitration": DisputeBehavior.ARBITRATE,
    "binding arbitration": DisputeBehavior.ARBITRATE,
    "freeze affected payment": DisputeBehavior.FREEZE_AFFECTED_PAYMENT,
    "freeze affected payments": DisputeBehavior.FREEZE_AFFECTED_PAYMENT,
    "freeze payment": DisputeBehavior.FREEZE_AFFECTED_PAYMENT,
    "freeze payments": DisputeBehavior.FREEZE_AFFECTED_PAYMENT,
    "hold affected payment": DisputeBehavior.FREEZE_AFFECTED_PAYMENT,
}

GOVERNING_LAW_ALIASES = {
    "india": GoverningLaw.INDIA,
    "indian": GoverningLaw.INDIA,
    "indian law": GoverningLaw.INDIA,
    "laws of india": GoverningLaw.INDIA,
    "united kingdom": GoverningLaw.UNITED_KINGDOM,
    "uk": GoverningLaw.UNITED_KINGDOM,
    "english law": GoverningLaw.UNITED_KINGDOM,
    "england and wales": GoverningLaw.UNITED_KINGDOM,
    "british law": GoverningLaw.UNITED_KINGDOM,
    "united states": GoverningLaw.UNITED_STATES,
    "us": GoverningLaw.UNITED_STATES,
    "usa": GoverningLaw.UNITED_STATES,
    "american law": GoverningLaw.UNITED_STATES,
    "united states of america": GoverningLaw.UNITED_STATES,
    "australia": GoverningLaw.AUSTRALIA,
    "australian": GoverningLaw.AUSTRALIA,
    "australian law": GoverningLaw.AUSTRALIA,
}

AGREEMENT_TYPE_ALIASES = {
    "freelance": AgreementType.FREELANCE_MILESTONE,
    "freelance milestone": AgreementType.FREELANCE_MILESTONE,
    "freelance milestone contract": AgreementType.FREELANCE_MILESTONE,
    "freelance milestone agreement": AgreementType.FREELANCE_MILESTONE,
    "milestone contract": AgreementType.MILESTONE_CONTRACT,
    "milestone agreement": AgreementType.MILESTONE_CONTRACT,
    "milestone based contract": AgreementType.MILESTONE_CONTRACT,
    "service agreement": AgreementType.SERVICE_AGREEMENT,
    "services agreement": AgreementType.SERVICE_AGREEMENT,
    "consulting agreement": AgreementType.SERVICE_AGREEMENT,
    "retainer": AgreementType.SERVICE_AGREEMENT,
    "retainer agreement": AgreementType.SERVICE_AGREEMENT,
}


@dataclass(frozen=True)
class ParsedAmount:
    """An amount in integer minor units, plus the currency it was written in."""

    amount_minor: int
    currency: Optional[Currency]


def normalize_text(text: str) -> str:
    """Normalize source text: NFC, strip outer whitespace, normalise newlines.

    Non-string input is treated as an empty description rather than raising, so
    a malformed request is rejected by the pipeline instead of crashing it.
    """
    if not isinstance(text, str):
        return ""
    normalized = unicodedata.normalize("NFC", text.replace("\r\n", "\n").replace("\r", "\n"))
    return normalized.strip()


def find_byte_span(text: str, quote: str) -> Optional[tuple[int, int]]:
    """Locate ``quote`` in ``text`` and return its byte offsets, or ``None``.

    Offsets are byte offsets into the UTF-8 encoding of ``text``, so they match
    the P0-06 convention that provenance points into the stored agreement text.
    """
    if not quote:
        return None
    haystack = text.encode("utf-8")
    needle = quote.encode("utf-8")
    index = haystack.find(needle)
    if index < 0:
        return None
    return index, index + len(needle)


def detect_currency(value: str) -> Optional[Currency]:
    """Detect the currency an amount was written in, if any."""
    if not value:
        return None
    for pattern, currency in _CURRENCY_PATTERNS:
        if pattern.search(value):
            return currency
    return None


def parse_amount(value: str, field: str = "") -> ParsedAmount:
    """Parse an amount written in ordinary language into integer minor units.

    Accepts ``₹50,000``, ``INR 1,20,000``, ``$5,000.50``, ``500000 paise``.
    Rejects: percentages, amounts with more than two decimal places, zero and
    negative amounts, and values that contain no number at all.
    """
    if value is None:
        raise ParsingError("amount is missing", field)
    if not isinstance(value, str):
        raise ParsingError("amount is not text", field)
    text = value.strip()
    if not text:
        raise ParsingError("amount is empty", field)
    if "%" in text or _PERCENT_WORD_RE.search(text):
        raise ParsingError(
            "amount is a percentage; the base amount is not stated", field
        )

    currency = None
    for pattern, candidate in _CURRENCY_PATTERNS:
        if pattern.search(text):
            currency = candidate
            # Remove the currency token so a leading sign stays attached to the
            # number ("-₹100" must not lose its minus sign).
            text = pattern.sub("", text)
            break

    is_minor_units = bool(_MINOR_UNIT_MARKERS.search(text))
    text = _MINOR_UNIT_MARKERS.sub(" ", text)

    if _UNSUPPORTED_NOTATION_RE.search(text):
        raise ParsingError(
            f"amount '{value.strip()}' uses an unsupported numeric notation", field
        )

    tokens = [token for token in _NUMBER_TOKEN_RE.findall(text) if token not in ("", "-")]
    if not tokens:
        raise ParsingError("amount contains no number", field)
    if len(tokens) > 1:
        raise ParsingError(
            "amount contains more than one number; the amount is ambiguous", field
        )

    numeric_raw = tokens[0]
    if not _ALLOWED_NUMBER_RE.match(numeric_raw):
        raise ParsingError(
            f"amount '{numeric_raw}' is not written in a supported format", field
        )

    numeric = numeric_raw.replace(",", "")
    try:
        amount = Decimal(numeric)
    except InvalidOperation:  # pragma: no cover - guarded by the regex
        raise ParsingError("amount is not a number", field)

    if amount <= 0:
        raise ParsingError("amount must be greater than zero", field)

    if is_minor_units:
        if amount != amount.to_integral_value():
            raise ParsingError(
                "amount in minor units must be a whole number", field
            )
        amount_minor = int(amount)
    else:
        scaled = amount * MINOR_UNITS
        if scaled != scaled.to_integral_value():
            raise ParsingError(
                "amount has more than two decimal places and cannot be represented "
                "exactly in minor units",
                field,
            )
        amount_minor = int(scaled)

    if amount_minor < 1:
        raise ParsingError("amount must be greater than zero", field)
    return ParsedAmount(amount_minor=amount_minor, currency=currency)


def parse_date(value: str, field: str = "") -> date_type:
    """Parse an unambiguous date.

    Accepts ISO (``2026-12-01``), ``1 December 2026`` and ``December 1, 2026``.
    Rejects ambiguous numeric formats (``01/12/2026``) and relative dates.
    """
    if value is None:
        raise ParsingError("date is missing", field)
    text = value.strip()
    if not text:
        raise ParsingError("date is empty", field)

    if _ISO_DATE_RE.match(text):
        try:
            return date_type.fromisoformat(text)
        except ValueError:
            raise ParsingError(f"date is not a real calendar date: {text}", field)

    match = _DAY_MONTH_YEAR_RE.match(text)
    if match:
        day, month_name, year = match.groups()
        month = _MONTHS.get(month_name.lower())
        if month is None:
            raise ParsingError(f"unknown month in date: {text}", field)
        return _make_date(int(day), month, int(year), text, field)

    match = _MONTH_DAY_YEAR_RE.match(text)
    if match:
        month_name, day, year = match.groups()
        month = _MONTHS.get(month_name.lower())
        if month is None:
            raise ParsingError(f"unknown month in date: {text}", field)
        return _make_date(int(day), month, int(year), text, field)

    if re.match(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$", text):
        raise ParsingError(
            f"date '{text}' is ambiguous: the day and month order is not stated",
            field,
        )
    if re.match(r"(?i)^(next|last|this|in|within|after|before)\b", text):
        raise ParsingError(
            f"date '{text}' is relative; it needs a reference date", field
        )
    raise ParsingError(f"date '{text}' is not in a supported format", field)


def _make_date(day: int, month: int, year: int, text: str, field: str) -> date_type:
    try:
        return date_type(year, month, day)
    except ValueError:
        raise ParsingError(f"date is not a real calendar date: {text}", field)


def parse_enum_value(
    value: str,
    enum_cls: Type[EnumT],
    aliases: dict[str, EnumT],
    field: str = "",
) -> EnumT:
    """Map free text onto a supported enum value, or raise :class:`ParsingError`."""
    if value is None:
        raise ParsingError("value is missing", field)
    text = value.strip()
    if not text:
        raise ParsingError("value is empty", field)

    key = text.lower()
    if key in aliases:
        return aliases[key]
    for member in enum_cls:  # type: ignore[attr-defined]
        if member.value.lower() == key:
            return member
    supported = ", ".join(sorted(member.value for member in enum_cls))  # type: ignore[attr-defined]
    raise ParsingError(
        f"value '{text}' is not a supported option (supported: {supported})", field
    )


def parse_party_role(value: str, field: str = "") -> PartyRole:
    """Map free text onto a party role."""
    return parse_enum_value(value, PartyRole, PARTY_ROLE_ALIASES, field)


def parse_review_period_basis(value: str, field: str = "") -> ReviewPeriodBasis:
    """Map free text onto a review-period basis."""
    return parse_enum_value(
        value, ReviewPeriodBasis, REVIEW_PERIOD_BASIS_ALIASES, field
    )


def parse_dispute_behavior(value: str, field: str = "") -> DisputeBehavior:
    """Map free text onto a dispute behaviour."""
    return parse_enum_value(
        value, DisputeBehavior, DISPUTE_BEHAVIOR_ALIASES, field
    )


def parse_governing_law(value: str, field: str = "") -> GoverningLaw:
    """Map free text onto a supported governing law."""
    return parse_enum_value(
        value, GoverningLaw, GOVERNING_LAW_ALIASES, field
    )


def parse_agreement_type(value: str, field: str = "") -> AgreementType:
    """Map free text onto an agreement type."""
    return parse_enum_value(
        value, AgreementType, AGREEMENT_TYPE_ALIASES, field
    )


def parse_review_period_days(value: str, field: str = "") -> int:
    """Parse a review period in days.

    Accepts ``30`` and ``30 days``. The 1-90 range is enforced by the Contract
    IR schema; this helper only guarantees an exact integer.
    """
    if value is None:
        raise ParsingError("review period is missing", field)
    text = value.strip().lower()
    if not text:
        raise ParsingError("review period is empty", field)
    text = re.sub(r"\s*(?:calendar|business|working)?\s*days?\b", "", text).strip()
    if not text:
        raise ParsingError("review period contains no number", field)
    try:
        days = int(text)
    except ValueError:
        raise ParsingError(f"review period '{value}' is not a whole number of days", field)
    if days < 1 or days > 90:
        raise ParsingError(
            f"review period {days} is outside the supported range 1-90 days", field
        )
    return days


__all__ = [
    "AGREEMENT_TYPE_ALIASES",
    "DISPUTE_BEHAVIOR_ALIASES",
    "GOVERNING_LAW_ALIASES",
    "MINOR_UNITS",
    "PARTY_ROLE_ALIASES",
    "REVIEW_PERIOD_BASIS_ALIASES",
    "ParsedAmount",
    "detect_currency",
    "find_byte_span",
    "normalize_text",
    "parse_agreement_type",
    "parse_amount",
    "parse_date",
    "parse_dispute_behavior",
    "parse_enum_value",
    "parse_governing_law",
    "parse_party_role",
    "parse_review_period_basis",
    "parse_review_period_days",
]
