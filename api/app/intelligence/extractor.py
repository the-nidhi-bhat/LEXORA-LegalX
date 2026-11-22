"""The deterministic extraction pipeline.

Input: an ordinary-language agreement description plus an extraction provider.
Output: an :class:`ExtractionResult` containing a draft Contract IR (only when
the source supports one), field provenance, provider confidence, missing fields,
clarification requests and unsupported terms.

Guarantees:

- **Nothing is invented.** Every value must be traceable to a passage of the
  source text. A value whose evidence cannot be located is discarded and turned
  into a clarification request.
- **Nothing is approved.** The result always reports ``approved=False`` and
  ``human_review_required=True``.
- **Nothing is silently dropped.** Terms that do not fit the Contract IR schema
  are reported in ``unsupported_terms`` instead of being discarded.
- **Failures are explicit.** A provider outage, a rate limit or malformed JSON
  produces a named status, never an empty but successful-looking result.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Dict, List, Optional

from pydantic import ValidationError

from api.app.intelligence.errors import ParsingError, ProviderError
from api.app.intelligence.evidence import (
    amount_supported,
    currency_supported,
    date_supported,
    enum_supported,
    text_supported,
)
from api.app.intelligence.models import (
    ClarificationRequest,
    ExtractionPayload,
    ExtractionResult,
    FieldProvenance,
    MissingField,
    SourceSpan,
)
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
from api.app.intelligence.prompting import build_extraction_request
from api.app.intelligence.provider import ExtractionProvider
from api.app.schemas.ir import (
    ContractIR,
    Currency,
    Milestone,
    Party,
    PartyRole,
    default_agreement_id,
    default_version_id,
)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def extract_agreement(
    description: str,
    provider: ExtractionProvider,
    *,
    agreement_id: Optional[str] = None,
    version_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> ExtractionResult:
    """Extract a draft Contract IR from an agreement description.

    The returned result is never an approval. A complete result still requires
    human review before the draft can be used.
    """
    text = normalize_text(description)
    provider_name = getattr(provider, "name", "") or type(provider).__name__

    if not text:
        return ExtractionResult(
            status="rejected",
            rejected_reasons=["the agreement description is empty"],
            provider=provider_name,
        )

    request = build_extraction_request(text, metadata=metadata)

    try:
        response = provider.extract(request)
    except ProviderError as exc:
        return ExtractionResult(
            status="provider_error",
            rejected_reasons=[f"{type(exc).__name__}: {exc}"],
            retryable=bool(exc.retryable),
            provider=provider_name,
        )
    except Exception as exc:  # noqa: BLE001 - a provider must not crash the pipeline
        # Deliberately no str(exc): an arbitrary exception may carry credentials
        # or request details. A provider failure is reported, never swallowed.
        return ExtractionResult(
            status="provider_error",
            rejected_reasons=[
                f"{type(exc).__name__}: provider raised an unexpected error"
            ],
            retryable=False,
            provider=provider_name,
        )

    try:
        raw = json.loads(response.text)
    except (json.JSONDecodeError, TypeError) as exc:
        return ExtractionResult(
            status="rejected",
            rejected_reasons=[f"provider returned malformed JSON: {exc}"],
            provider=provider_name,
            model=response.model,
        )

    if not isinstance(raw, dict):
        return ExtractionResult(
            status="rejected",
            rejected_reasons=["provider output was not a JSON object"],
            provider=provider_name,
            model=response.model,
        )

    try:
        payload = ExtractionPayload.model_validate(raw)
    except ValidationError as exc:
        reasons = [
            f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
            for error in exc.errors()
        ]
        return ExtractionResult(
            status="rejected",
            rejected_reasons=reasons,
            provider=provider_name,
            model=response.model,
        )

    return _build_result(
        text=text,
        payload=payload,
        provider=provider_name,
        model=response.model,
        agreement_id=agreement_id or default_agreement_id(),
        version_id=version_id or default_version_id(),
    )


# ---------------------------------------------------------------------------
# Field resolution
# ---------------------------------------------------------------------------


def _span_is_within_text(span, text: str) -> bool:
    """True when a byte span is a valid, non-empty range inside ``text``.

    Provenance offsets are byte offsets into the UTF-8 encoding of the stored
    text. Without this check an out-of-range span could be persisted and later
    used to slice unrelated bytes from the source.
    """
    if not isinstance(span, (tuple, list)) or len(span) != 2:
        return False
    start, end = span
    if (
        isinstance(start, bool)
        or isinstance(end, bool)
        or not isinstance(start, int)
        or not isinstance(end, int)
    ):
        return False
    return 0 <= start < end <= len(text.encode("utf-8"))


class _Resolver:
    """Resolves extracted values against the source text."""

    def __init__(self, text: str):
        self.text = text
        self.provenance: List[FieldProvenance] = []
        self.missing: List[MissingField] = []
        self.clarifications: List[ClarificationRequest] = []

    def resolve(self, field: str, extracted, parser, *, required: bool = True,
                verify: Optional[Callable[[Any, str], bool]] = None):
        """Resolve one extracted value.

        Returns the parsed value, or ``None`` when the value is missing,
        unsupported by the source text, unparsable, or not supported by the
        passage the provider quoted. In every failing case a missing field and a
        clarification request are recorded.

        ``verify`` answers the stronger question "does this passage actually
        state this value?". Presence of the quote alone is not enough: a
        fabricated amount can be paired with any real quotation.
        """
        if extracted is None:
            if required:
                self._record_missing(
                    field,
                    "the description does not state this value",
                    f"What is the {field.replace('_', ' ')}?",
                )
            return None

        span = find_byte_span(self.text, extracted.evidence)
        if span is None:
            self._record_missing(
                field,
                "the quoted evidence for this value was not found in the description",
                f"Please quote the passage that states the {field.replace('_', ' ')}.",
            )
            return None
        if not _span_is_within_text(span, self.text):
            self._record_missing(
                field,
                "the quoted evidence points outside the source text",
                f"Please quote the passage that states the {field.replace('_', ' ')}.",
            )
            return None

        try:
            value = parser(extracted.value, field)
        except ParsingError as exc:
            self._record_missing(field, exc.reason, f"Could you clarify the {field.replace('_', ' ')}?")
            return None

        if verify is not None and not verify(value, extracted.evidence):
            self._record_missing(
                field,
                "the quoted evidence does not support the extracted value",
                f"Please quote the passage that states the {field.replace('_', ' ')}.",
            )
            return None

        self.provenance.append(
            FieldProvenance(
                field=field,
                source_span=SourceSpan(start=span[0], end=span[1]),
                quote=extracted.evidence,
                confidence=extracted.confidence,
            )
        )
        return value

    def _record_missing(self, field: str, reason: str, question: str) -> None:
        self.missing.append(MissingField(field=field, reason=reason))
        self.clarifications.append(
            ClarificationRequest(field=field, question=question, reason=reason)
        )


def _parse_text(value: str, field: str) -> str:
    text = (value or "").strip()
    if not text:
        raise ParsingError("value is empty", field)
    return text


def _parse_currency(value: str, field: str) -> Currency:
    detected = detect_currency(value)
    if detected is not None:
        return detected
    try:
        return Currency((value or "").strip().upper())
    except ValueError:
        raise ParsingError(
            f"currency '{value}' is not supported (supported: INR, USD, EUR, GBP)",
            field,
        )


def _parse_email(value: str, field: str) -> str:
    text = (value or "").strip()
    if not _EMAIL_RE.match(text):
        raise ParsingError("email address is not valid", field)
    return text


def _build_result(
    *,
    text: str,
    payload: ExtractionPayload,
    provider: str,
    model: str,
    agreement_id: str,
    version_id: str,
) -> ExtractionResult:
    """Turn a validated provider payload into a draft IR and its review notes."""
    resolver = _Resolver(text)
    proposed: Dict[str, Any] = {}
    warnings: List[str] = []
    ambiguities: List[str] = []
    unsupported_terms: List[str] = []

    agreement_type = resolver.resolve(
        "agreement_type", payload.agreement_type, parse_agreement_type,
        verify=lambda value, evidence: enum_supported(value, evidence, AGREEMENT_TYPE_ALIASES),
    )
    currency = resolver.resolve(
        "currency", payload.currency, _parse_currency, verify=currency_supported
    )
    total = resolver.resolve(
        "total_amount_minor", payload.total_amount, parse_amount, verify=amount_supported
    )

    parties: List[Party] = []
    party_names: Dict[str, int] = {}
    party_emails: Dict[str, int] = {}
    for index, party in enumerate(payload.parties):
        role = resolver.resolve(
            f"parties[{index}].role", party.role, parse_party_role,
            verify=lambda value, evidence: enum_supported(value, evidence, PARTY_ROLE_ALIASES),
        )
        name = resolver.resolve(
            f"parties[{index}].name", party.name, _parse_text, verify=text_supported
        )
        email = resolver.resolve(
            f"parties[{index}].email", party.email, _parse_email, required=False,
            verify=text_supported,
        )

        if name:
            key = name.casefold()
            if key in party_names:
                resolver._record_missing(
                    f"parties[{index}].name",
                    f"the same party name also appears at parties[{party_names[key]}]",
                    "Which distinct party does this name refer to?",
                )
            else:
                party_names[key] = index
        if email:
            key = email.casefold()
            if key in party_emails:
                resolver._record_missing(
                    f"parties[{index}].email",
                    f"the same email also appears at parties[{party_emails[key]}]",
                    "Which distinct party does this email address belong to?",
                )
            else:
                party_emails[key] = index

        if role and name:
            parties.append(Party(role=role, name=name, email=email))

    milestones: List[Milestone] = []
    used_seqs: Dict[int, int] = {}
    for index, milestone in enumerate(payload.milestones):
        name = resolver.resolve(
            f"milestones[{index}].name", milestone.name, _parse_text, verify=text_supported
        )
        amount = resolver.resolve(
            f"milestones[{index}].amount_minor", milestone.amount, parse_amount,
            verify=amount_supported,
        )
        due_date = resolver.resolve(
            f"milestones[{index}].due_date", milestone.due_date, parse_date,
            verify=date_supported,
        )
        criteria = resolver.resolve(
            f"milestones[{index}].acceptance_criteria",
            milestone.acceptance_criteria,
            _parse_text,
            verify=text_supported,
        )

        seq = milestone.seq if milestone.seq is not None else index + 1
        if seq in used_seqs:
            resolver._record_missing(
                f"milestones[{index}].seq",
                f"sequence {seq} is also used by milestones[{used_seqs[seq]}]",
                "Which order should the milestones follow?",
            )
            seq = index + 1
        used_seqs.setdefault(seq, index)

        if amount and currency and amount.currency and amount.currency != currency:
            resolver._record_missing(
                f"milestones[{index}].amount_minor",
                f"the amount is written in {amount.currency.value} but the agreement "
                f"is in {currency.value}",
                f"Should the milestone amount be converted to {currency.value}?",
            )

        if name and amount and due_date and criteria:
            milestones.append(
                Milestone(
                    seq=seq,
                    name=name,
                    amount_minor=amount.amount_minor,
                    due_date=due_date,
                    acceptance_criteria=criteria,
                )
            )

    review_period_days = resolver.resolve(
        "review_period_days", payload.review_period_days, parse_review_period_days,
        verify=lambda value, evidence: text_supported(str(value), evidence),
    )
    review_period_basis = resolver.resolve(
        "review_period_basis", payload.review_period_basis, parse_review_period_basis,
        verify=lambda value, evidence: enum_supported(
            value, evidence, REVIEW_PERIOD_BASIS_ALIASES
        ),
    )
    dispute_behavior = resolver.resolve(
        "dispute_behavior", payload.dispute_behavior, parse_dispute_behavior,
        verify=lambda value, evidence: enum_supported(
            value, evidence, DISPUTE_BEHAVIOR_ALIASES
        ),
    )
    governing_law = resolver.resolve(
        "governing_law", payload.governing_law, parse_governing_law, required=False,
        verify=lambda value, evidence: enum_supported(
            value, evidence, GOVERNING_LAW_ALIASES
        ),
    )
    purpose = resolver.resolve(
        "purpose", payload.purpose, _parse_text, required=False, verify=text_supported
    )

    obligations: List[str] = []
    for index, obligation in enumerate(payload.obligations):
        value = resolver.resolve(
            f"obligations[{index}]", obligation, _parse_text, required=False,
            verify=text_supported,
        )
        if value:
            obligations.append(value)

    for term in payload.unsupported_terms:
        unsupported_terms.append(term.evidence or term.value)
    if unsupported_terms:
        warnings.append(
            f"{len(unsupported_terms)} term(s) in the description have no Contract IR "
            "field and need human legal review"
        )

    for ambiguity in payload.ambiguities:
        ambiguities.append(ambiguity.value or ambiguity.evidence)

    for reported in payload.missing_fields:
        # A provider-reported gap must also become a clarification, otherwise a
        # payload that names a missing field while supplying every value could
        # still be reported as "complete".
        resolver._record_missing(
            reported,
            "the provider reported this field as not stated",
            f"Please provide the {reported.replace('_', ' ')}.",
        )

    # Required roles must be present for a usable draft.
    roles = {party.role for party in parties}
    if PartyRole.CLIENT not in roles:
        resolver._record_missing(
            "parties",
            "no client party was identified",
            "Which party is the client in this agreement?",
        )
    if PartyRole.PROVIDER not in roles:
        resolver._record_missing(
            "parties",
            "no provider party was identified",
            "Which party is the provider in this agreement?",
        )
    if len(parties) < 2:
        resolver._record_missing(
            "parties",
            "at least a client and a provider are required",
            "Who are the parties to this agreement?",
        )

    # Milestone amounts must add up to the stated total.
    if milestones and total:
        milestone_sum = sum(milestone.amount_minor for milestone in milestones)
        if milestone_sum != total.amount_minor:
            resolver._record_missing(
                "total_amount_minor",
                f"the milestone amounts add up to {milestone_sum} minor units but the "
                f"stated total is {total.amount_minor} minor units",
                "Which amount is correct — the total or the milestone split?",
            )

    proposed.update(
        {
            "agreement_type": agreement_type.value if agreement_type else None,
            "currency": currency.value if currency else None,
            "total_amount_minor": total.amount_minor if total else None,
            "parties": [
                {"role": party.role.value, "name": party.name, "email": party.email}
                for party in parties
            ],
            "milestones": [
                {
                    "seq": milestone.seq,
                    "name": milestone.name,
                    "amount_minor": milestone.amount_minor,
                    "due_date": milestone.due_date.isoformat(),
                    "acceptance_criteria": milestone.acceptance_criteria,
                }
                for milestone in milestones
            ],
            "review_period_days": review_period_days,
            "review_period_basis": review_period_basis.value if review_period_basis else None,
            "dispute_behavior": dispute_behavior.value if dispute_behavior else None,
            "governing_law": governing_law.value if governing_law else None,
            "purpose": purpose,
            "obligations": obligations,
        }
    )

    status = "complete" if not resolver.clarifications else "needs_clarification"

    contract_ir: Optional[ContractIR] = None
    if status == "complete":
        try:
            contract_ir = ContractIR(
                agreement_id=agreement_id,
                version_id=version_id,
                agreement_type=agreement_type,
                currency=currency,
                total_amount_minor=total.amount_minor,
                parties=parties,
                milestones=milestones,
                review_period_days=review_period_days,
                review_period_basis=review_period_basis,
                dispute_behavior=dispute_behavior,
                governing_law=governing_law,
                provenance=[
                    {
                        "field": entry.field,
                        "source_span": entry.source_span.model_dump(),
                        "quote": entry.quote,
                        "confidence": entry.confidence,
                    }
                    for entry in resolver.provenance
                ],
            )
        except ValidationError as exc:
            status = "needs_clarification"
            resolver._record_missing(
                "contract_ir",
                f"the extracted draft failed Contract IR validation: {exc}",
                "Please review the extracted values.",
            )

    return ExtractionResult(
        status=status,
        contract_ir=contract_ir,
        provenance=resolver.provenance,
        missing_fields=resolver.missing,
        clarifications=resolver.clarifications,
        ambiguities=ambiguities,
        unsupported_terms=unsupported_terms,
        proposed=proposed,
        warnings=warnings,
        provider=provider,
        model=model,
    )


__all__ = ["extract_agreement"]
