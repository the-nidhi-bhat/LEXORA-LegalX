"""Provider-independent models for P1-04 contract intelligence.

Two contracts live here:

1. :class:`ExtractionPayload` — what an extraction provider must return. Every
   value carries the exact source text it was taken from, so the pipeline can
   verify that the provider did not invent it. Unknown keys are rejected.
2. :class:`ExtractionResult` — what the deterministic pipeline returns: a
   draft Contract IR (only when the source supports a complete one), field
   provenance, confidence, missing fields, clarifications and unsupported terms.

The result can never approve a contract: ``approved`` is typed as ``Literal[False]``
and ``human_review_required`` as ``Literal[True]``, so an accidental attempt to
set them is a validation error rather than a silent success.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from api.app.schemas.ir import ContractIR


class StrictModel(BaseModel):
    """Base for provider payloads: unknown keys are rejected, not ignored."""

    model_config = ConfigDict(extra="forbid")


class SourceSpan(BaseModel):
    """Byte offsets of a source passage.

    Offsets are byte offsets into the UTF-8 encoding of the normalized source
    text, matching the P0-06 convention that provenance points at the stored
    agreement text.
    """

    model_config = ConfigDict(extra="forbid")

    start: int = Field(..., ge=0)
    end: int = Field(..., gt=0)

    @model_validator(mode="after")
    def _validate_order(self) -> "SourceSpan":
        if self.end <= self.start:
            raise ValueError("source_span end must be greater than start")
        return self


class ExtractedValue(StrictModel):
    """One extracted value plus the source passage it came from.

    ``evidence`` must appear verbatim in the source text; the pipeline rejects
    values whose evidence cannot be located. ``confidence`` is optional and is
    only carried when the provider returned one — confidence is never invented.
    """

    value: str
    evidence: str = Field(..., min_length=1)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class ExtractedParty(StrictModel):
    """A party as proposed by the provider."""

    role: Optional[ExtractedValue] = None
    name: Optional[ExtractedValue] = None
    email: Optional[ExtractedValue] = None


class ExtractedMilestone(StrictModel):
    """A milestone as proposed by the provider.

    ``seq`` is optional: the pipeline assigns stable sequence numbers when the
    provider does not supply them.
    """

    name: Optional[ExtractedValue] = None
    amount: Optional[ExtractedValue] = None
    due_date: Optional[ExtractedValue] = None
    acceptance_criteria: Optional[ExtractedValue] = None
    seq: Optional[int] = Field(default=None, ge=1)


class ExtractionPayload(StrictModel):
    """The structured output an extraction provider must return.

    Every field is optional: a provider signals "not stated" by omitting it or
    by using ``null``. The pipeline — not the provider — decides which fields
    are required, and asks for clarification when one is missing.
    """

    agreement_type: Optional[ExtractedValue] = None
    currency: Optional[ExtractedValue] = None
    total_amount: Optional[ExtractedValue] = None
    parties: List[ExtractedParty] = Field(default_factory=list)
    milestones: List[ExtractedMilestone] = Field(default_factory=list)
    review_period_days: Optional[ExtractedValue] = None
    review_period_basis: Optional[ExtractedValue] = None
    dispute_behavior: Optional[ExtractedValue] = None
    governing_law: Optional[ExtractedValue] = None
    purpose: Optional[ExtractedValue] = None
    obligations: List[ExtractedValue] = Field(default_factory=list)
    unsupported_terms: List[ExtractedValue] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)
    ambiguities: List[ExtractedValue] = Field(default_factory=list)


class FieldProvenance(BaseModel):
    """Where a field came from, and how confident the provider was.

    Provenance is excluded from the Contract IR hash (P0-06 ``ir_to_hash`` and
    P0-07 ``canonicalize_approved_ir`` both exclude ``provenance``), so
    confidence can be recorded here without touching hash semantics.
    """

    model_config = ConfigDict(extra="forbid")

    field: str
    source_span: SourceSpan
    quote: str
    confidence: Optional[float] = None


class MissingField(BaseModel):
    """A required field the source text does not state."""

    model_config = ConfigDict(extra="forbid")

    field: str
    reason: str


class ClarificationRequest(BaseModel):
    """A question a human must answer before the draft can be completed."""

    model_config = ConfigDict(extra="forbid")

    field: str
    question: str
    reason: str


class ExtractionResult(BaseModel):
    """The outcome of one extraction attempt."""

    model_config = ConfigDict(extra="forbid")

    status: Literal[
        "complete",
        "needs_clarification",
        "rejected",
        "provider_error",
    ]
    contract_ir: Optional[ContractIR] = None
    provenance: List[FieldProvenance] = Field(default_factory=list)
    missing_fields: List[MissingField] = Field(default_factory=list)
    clarifications: List[ClarificationRequest] = Field(default_factory=list)
    ambiguities: List[str] = Field(default_factory=list)
    unsupported_terms: List[str] = Field(default_factory=list)
    proposed: Dict[str, Any] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    rejected_reasons: List[str] = Field(default_factory=list)
    provider: str = ""
    model: str = ""
    retryable: bool = False
    #: The model can never approve a contract. Typed as a literal so that
    #: setting it is a validation error, not a silent success.
    approved: Literal[False] = False
    #: Human review is always required before an extracted draft is used.
    human_review_required: Literal[True] = True


__all__ = [
    "ClarificationRequest",
    "ExtractionPayload",
    "ExtractionResult",
    "ExtractedMilestone",
    "ExtractedParty",
    "ExtractedValue",
    "FieldProvenance",
    "MissingField",
    "SourceSpan",
    "StrictModel",
]
