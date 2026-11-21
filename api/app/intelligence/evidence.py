"""Evidence verification: does the quoted passage actually support the value?

The extractor previously checked only that the quoted evidence *appeared* in the
description. A fabricated value backed by a real but unrelated passage
(``value="INR 9,99,999"`` with ``evidence="INR 40,000"``, both real numbers in
the text) was therefore accepted. These helpers answer the stronger question: is
the resolved value recoverable from the quoted passage itself?

Every helper is deliberately conservative. A false negative costs one
clarification request; a false positive is a fabricated legal value.
"""

from __future__ import annotations

import re
from datetime import date as date_type
from typing import Any, Mapping

from api.app.intelligence.errors import ParsingError
from api.app.intelligence.parsing import ParsedAmount, detect_currency, parse_amount, parse_date
from api.app.schemas.ir import Currency

#: Date shapes the parser accepts when they appear inside a longer sentence.
_DATE_TOKEN_RE = re.compile(
    r"\d{4}-\d{2}-\d{2}"
    r"|\d{1,2}\s+[A-Za-z]+\.?\s+\d{4}"
    r"|[A-Za-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}"
)


def _haystack(text: str) -> str:
    """Case- and whitespace-insensitive form used for substring checks."""
    return re.sub(r"\s+", " ", (text or "")).casefold().strip()


def text_supported(text: str, evidence: str) -> bool:
    """True when the passage contains the resolved text."""
    needle = _haystack(text)
    return bool(needle) and needle in _haystack(evidence)


def amount_supported(parsed: ParsedAmount, evidence: str) -> bool:
    """True when a number in the passage parses to the same minor-unit amount."""
    if not isinstance(parsed, ParsedAmount):
        return False
    candidates = [evidence or ""]
    candidates.extend(re.findall(r"-?\d[\d,_]*(?:\.\d+)?", evidence or ""))
    for candidate in candidates:
        try:
            if parse_amount(candidate).amount_minor == parsed.amount_minor:
                return True
        except ParsingError:
            continue
    return False


def date_supported(value: date_type, evidence: str) -> bool:
    """True when a date written in the passage parses to the same calendar date."""
    if not isinstance(value, date_type):
        return False
    if value.isoformat() in (evidence or ""):
        return True
    for match in _DATE_TOKEN_RE.finditer(evidence or ""):
        try:
            if parse_date(match.group(0)) == value:
                return True
        except ParsingError:
            continue
    return False


def currency_supported(value: Currency, evidence: str) -> bool:
    """True when the passage states the currency explicitly."""
    detected = detect_currency(evidence or "")
    if detected is not None:
        return detected == value
    return _haystack(getattr(value, "value", str(value))) in _haystack(evidence)


def enum_supported(value: Any, evidence: str, aliases: Mapping[str, Any]) -> bool:
    """True when the passage uses the canonical term or one of its aliases."""
    haystack = _haystack(evidence)
    canonical = _haystack(getattr(value, "value", str(value)))
    if canonical and canonical in haystack:
        return True
    for alias, mapped in aliases.items():
        if mapped == value and _haystack(alias) in haystack:
            return True
    return False


__all__ = [
    "amount_supported",
    "currency_supported",
    "date_supported",
    "enum_supported",
    "text_supported",
]
