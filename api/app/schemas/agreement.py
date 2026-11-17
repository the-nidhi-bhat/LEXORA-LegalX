"""Agreement request schemas — API_CONTRACTS.md §4 (shape-level validation).

Type/shape rules live here (pydantic): strict integer money fields reject
floats, bools and numeric strings with ``TYPE_MISMATCH``. Business rules
(sum of milestones, date windows, policy enums, party rules) live in
``api.app.validation`` so every failure can carry a precise ``details[]`` entry.
"""

from __future__ import annotations

import re
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,253}\.)+[a-zA-Z]{2,63}$"
)

PartyRole = Literal["client", "provider", "witness"]


class PartyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: PartyRole
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., max_length=320)

    @field_validator("email")
    @classmethod
    def _email_shape(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not _EMAIL_RE.fullmatch(normalized):
            raise ValueError("Enter a valid email address")
        return normalized


class MilestoneIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seq: StrictInt = Field(..., ge=1, le=1000)
    name: str = Field(..., min_length=1, max_length=200)
    # StrictInt: 50000.5, true or "50000" are TYPE_MISMATCH (contract §4.2).
    amount_minor: StrictInt = Field(..., gt=0)
    due_date: str = Field(..., max_length=10)
    acceptance_criteria: str = Field("", max_length=20000)


class CreateAgreementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., max_length=200)
    agreement_type: str = Field(..., max_length=32)
    currency: str = Field(..., max_length=3)
    total_amount_minor: StrictInt = Field(..., gt=0)
    approval_policy: str = Field(..., max_length=16)
    parties: List[PartyIn] = Field(..., max_length=20)
    milestones: List[MilestoneIn] = Field(..., max_length=100)
    review_period_days: StrictInt = Field(..., ge=1, le=90)
    review_period_basis: str = Field(..., max_length=8)
    extra_terms: str = Field("", max_length=20000)
    # Legal facts for the Contract IR (P0-06). Optional at creation; if never
    # supplied, IR derivation fails with 409 MISSING_CLARIFICATION instead of
    # inventing a term (contract §6.1).
    dispute_behavior: Optional[str] = Field(None, max_length=32)
    governing_law: Optional[str] = Field(None, max_length=32)
    # Optional initial text for version 1 (contract §4.2 example omits it).
    text: str = Field("", max_length=500000)


class PatchAgreementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(None, max_length=200)
    milestones: Optional[List[MilestoneIn]] = Field(None, max_length=100)
    review_period_days: Optional[StrictInt] = Field(None, ge=1, le=90)
    review_period_basis: Optional[str] = Field(None, max_length=8)
    approval_policy: Optional[str] = Field(None, max_length=16)
    # Additive fields (P0-06): the documented way to resolve a 409
    # MISSING_CLARIFICATION raised by IR derivation.
    dispute_behavior: Optional[str] = Field(None, max_length=32)
    governing_law: Optional[str] = Field(None, max_length=32)
