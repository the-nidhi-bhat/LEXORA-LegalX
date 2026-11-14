"""Strict ExecutionParameters model for parity comparison.

Represents the parameters that an execution system would actually consume.
All monetary values in integer minor currency units. No floating-point money.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from api.app.schemas.ir import (
    AgreementType,
    Currency,
    DisputeBehavior,
    GoverningLaw,
    Milestone,
    Party,
    PartyRole,
    ReviewPeriodBasis,
    require_plain_int,
)


class ExecutionParameters(BaseModel):
    """Strict execution-parameter model for parity comparison.

    Represents the parameters that an execution system would actually consume.
    All monetary values in integer minor currency units. No floating-point money.
    """

    schema_version: str = Field(
        default="v1",
        description="Execution schema version",
    )
    agreement_id: str = Field(
        ...,
        description="Stable agreement identity from trusted verification context",
    )
    version_id: str = Field(
        ...,
        description="Stable version identity of the approved agreement version",
    )
    agreement_type: AgreementType = Field(
        ...,
        description="Agreement category from approved ContractIR",
    )
    currency: Currency = Field(
        ...,
        description="ISO-4217 currency code; integer minor units only",
    )
    total_amount_minor: int = Field(
        ...,
        ge=1,
        description="Total amount in paise (integer). No floats. ₹50,000 = 5000000 paise.",
    )
    parties: List[Party] = Field(
        ...,
        min_length=2,
        description="At least client + provider; witness optional. Party identity "
                    "must match the approved IR under the approved identity policy.",
    )
    milestones: List[Milestone] = Field(
        ...,
        min_length=1,
        description="Milestones must have stable sequence numbers. Sum of "
                    "amount_minor must equal total_amount_minor.",
    )
    review_period_days: int = Field(
        ...,
        ge=1,
        le=90,
        description="Review window; 1-90 days inclusive",
    )
    review_period_basis: ReviewPeriodBasis = Field(
        ...,
        description="calendar or business",
    )
    dispute_behavior: DisputeBehavior = Field(
        ...,
        description="How disputes are handled",
    )
    governing_law: Optional[GoverningLaw] = Field(
        None,
        description="Governning law jurisdiction from approved ContractIR",
    )

    @model_validator(mode="after")
    def _validate_milestone_sum_matches_total(self) -> "ExecutionParameters":
        """Execution parameters milestone sum must equal total_amount_minor."""
        milestones = self.milestones
        total_amount_minor = self.total_amount_minor
        computed_sum = sum(m.amount_minor for m in milestones)
        if computed_sum != total_amount_minor:
            raise ValueError(
                f"Milestone sum ({computed_sum} paise) != total_amount_minor ({total_amount_minor} paise)"
            )
        return self

    @model_validator(mode="after")
    def _validate_milestone_sequences_unique_and_positive(self) -> "ExecutionParameters":
        """Milestone sequences must be unique positive integers."""
        sequences = [m.seq for m in self.milestones]
        if len(sequences) != len(set(sequences)):
            raise ValueError("Milestone sequences must be unique")
        if any(s < 1 for s in sequences):
            raise ValueError("Milestone sequences must be positive integers")
        return self

    @model_validator(mode="after")
    def _validate_parties_have_required_roles(self) -> "ExecutionParameters":
        """At least client and provider must be present."""
        parties = self.parties
        roles = {p.role for p in parties}
        has_client = PartyRole.CLIENT in roles
        has_provider = PartyRole.PROVIDER in roles
        if not has_client:
            raise ValueError("At least one party with role 'client' is required")
        if not has_provider:
            raise ValueError("At least one party with role 'provider' is required")
        return self

    @field_validator("total_amount_minor", "review_period_days", mode="before")
    @classmethod
    def _strict_int_fields(cls, value, info):
        """Reject booleans, floats and numeric strings where integers are expected.

        ``mode="before"`` matters: an ``mode="after"`` validator inspects the
        already-coerced value, so ``"5000000"``, ``5000000.0`` and ``True`` would
        have been silently accepted as ``5000000``, ``5000000`` and ``1``.
        """
        return require_plain_int(value, info.field_name)