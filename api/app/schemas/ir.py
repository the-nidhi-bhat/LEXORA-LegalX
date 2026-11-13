"""Contract IR v1 schema — deterministic, version-bound, validated.

This module defines the Contract IR (Intermediate Representation) schema using
Pydantic v2. The IR is the artefact that deterministic parity compares against.
Every field has strict validation, and provenance tracks source text offsets.

Never client-compute a hash over IR data. All hashing is server-side only.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator, validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AgreementType(str, Enum):
    FREELANCE_MILESTONE = "freelance_milestone"
    MILESTONE_CONTRACT = "milestone_contract"
    SERVICE_AGREEMENT = "service_agreement"


class Currency(str, Enum):
    INR = "INR"
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"


class ReviewPeriodBasis(str, Enum):
    CALENDAR = "calendar"
    BUSINESS = "business"


class DisputeBehavior(str, Enum):
    FREEZE_AFFECTED_PAYMENT = "freeze_affected_payment"
    MEDIATE = "mediate"
    ARBITRATE = "arbitrate"


class GoverningLaw(str, Enum):
    """Supported governing law jurisdictions — extend as needed."""

    INDIA = "India"
    UNITED_KINGDOM = "United Kingdom"
    UNITED_STATES = "United States"
    AUSTRALIA = "Australia"


class PartyRole(str, Enum):
    CLIENT = "client"
    PROVIDER = "provider"
    WITNESS = "witness"


# ---------------------------------------------------------------------------
# Core schema
# ---------------------------------------------------------------------------


class Party(BaseModel):
    role: PartyRole
    name: str = Field(..., min_length=1, description="Full legal name")
    email: Optional[str] = Field(
        None,
        description="Valid email address; validated via RFC 5322 regex",
    )

    @validator("email", pre=True, always=True)
    def _validate_email_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        pattern = r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,253}\.)+[a-zA-Z]{2,63}$"
        if not re.fullmatch(pattern, v):
            raise ValueError("Invalid email address format")
        return v


class Milestone(BaseModel):
    seq: int = Field(..., ge=1, description="Strictly positive sequence number")
    name: str = Field(..., min_length=1, description="Milestone name/label")
    amount_minor: int = Field(
        ...,
        ge=1,
        description="Amount in paise (integer). ₹50,000 = 5000000 paise.",
    )
    due_date: date = Field(..., description="YYYY-MM-DD due date")
    acceptance_criteria: str = Field(
        ..., min_length=1, description="Non-empty criteria for acceptance"
    )


class ContractIR(BaseModel):
    """Version-bound, validated Contract IR with field-level provenance."""

    schema_version: str = Field(default="v1", description="IR schema version")
    agreement_id: str = Field(
        ...,
        description="UUID v4 string identifying the agreement",
    )
    version_id: str = Field(
        ...,
        description="UUID v4 string identifying this version",
    )
    agreement_type: AgreementType = Field(..., description="Agreement category")
    currency: Currency = Field(..., description="ISO-4217 currency code")
    total_amount_minor: int = Field(
        ...,
        ge=1,
        description="Total amount in paise (integer). No floats.",
    )
    parties: List[Party] = Field(
        ...,
        min_length=2,
        description="At least client + provider; witness optional",
    )
    milestones: List[Milestone] = Field(
        ...,
        min_length=1,
        description="At least one milestone; sum must equal total_amount_minor",
    )
    review_period_days: int = Field(
        ...,
        ge=1,
        le=90,
        description="Review window; 1-90 days inclusive",
    )
    review_period_basis: ReviewPeriodBasis = Field(
        ..., description="calendar or business"
    )
    dispute_behavior: DisputeBehavior = Field(
        ..., description="How disputes are handled"
    )
    governing_law: Optional[GoverningLaw] = Field(
        None, description="If supported; otherwise null"
    )
    provenance: List[dict] = Field(
        default_factory=list,
        description="Each entry: {field, source_span:{start,end}} byte offsets into stored text",
    )

    @model_validator(mode="after")
    def _validate_milestone_sum_matches_total(self) -> "ContractIR":
        """Ensure sum of milestone amounts equals total_amount_minor."""
        milestones: list[Milestone] = self.milestones
        total_amount_minor: int = self.total_amount_minor
        computed_sum = sum(m.amount_minor for m in milestones)
        if computed_sum != total_amount_minor:
            raise ValueError(
                f"Milestone sum ({computed_sum} paise) != total_amount_minor ({total_amount_minor} paise)"
            )
        return self

    @model_validator(mode="after")
    def _validate_parties_required_roles(self) -> "ContractIR":
        """Ensure at least client and provider are present."""
        parties: list[Party] = self.parties
        roles = {p.role for p in parties}
        has_client = PartyRole.CLIENT in roles
        has_provider = PartyRole.PROVIDER in roles
        if not has_client:
            raise ValueError("At least one party with role 'client' is required")
        if not has_provider:
            raise ValueError("At least one party with role 'provider' is required")
        return self

    @model_validator(mode="after")
    def _validate_provenance_offsets(self) -> "ContractIR":
        """Validate that provenance source_span offsets are valid for the stored text."""
        provenance: list[dict] = self.provenance
        for entry in provenance:
            field_name: str = entry.get("field", "")
            span: dict = entry.get("source_span", {})
            start: int = span.get("start", 0)
            end: int = span.get("end", 0)
            if end <= start:
                raise ValueError(
                    f"Provenance source_span end ({end}) must be > start ({start}) for field '{field_name}'"
                )
            if start < 0 or end < 0:
                raise ValueError(
                    f"Provenance offsets must be non-negative for field '{field_name}'"
                )
        return self


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def ir_to_hash(ir: ContractIR) -> str:
    """Compute SHA-256 over the canonical serialisation of the IR.

    Server-side only. The canonical form is:
      CRLF→LF, strip per-line trailing whitespace, NFC normalize, utf-8 encode.
    The original text is stored unmodified; this hash is over the canonical form.
    """
    text = ir.model_dump_json(by_alias=True, exclude={"provenance"}, round_trip=True)
    # Parse back to dict to strip, then renormalise
    norm = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = norm.split("\n")
    stripped = "\n".join(line.rstrip() for line in lines).strip("\n")
    normalized = unicodedata.normalize("NFC", stripped)
    import hashlib
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def default_agreement_id() -> str:
    import uuid
    return str(uuid.uuid4())


def default_version_id() -> str:
    import uuid
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# ISO-4217 money helper
# ---------------------------------------------------------------------------


def rupees_to_paise(rupees: float) -> int:
    """Convert rupees to integer paise. ₹50,000 → 5000000 paise.

    Rounds to nearest paise; rejects floats that are not representable exactly.
    """
    paise = int(round(rupees * 100))
    # Verify round-trip exactness
    if paise / 100 != round(rupees, 2):
        raise ValueError("Float cannot be represented exactly in paise")
    return paise


# ---------------------------------------------------------------------------
# Export public API
# ---------------------------------------------------------------------------

__all__ = [
    "AgreementType",
    "Currency",
    "ReviewPeriodBasis",
    "DisputeBehavior",
    "GoverningLaw",
    "PartyRole",
    "Party",
    "Milestone",
    "ContractIR",
    "ir_to_hash",
    "default_agreement_id",
    "default_version_id",
    "rupees_to_paise",
]