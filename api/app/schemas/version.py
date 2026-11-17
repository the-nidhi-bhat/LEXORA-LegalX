"""Version and approval schemas — API_CONTRACTS.md §5."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CreateVersionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., max_length=500000)
    change_summary: str = Field(..., max_length=1000)

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must not be blank")
        return value


class ApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm_sha256: str = Field(..., min_length=64, max_length=64)

    @field_validator("confirm_sha256")
    @classmethod
    def _hex_lower(cls, value: str) -> str:
        if not all(c in "0123456789abcdef" for c in value):
            raise ValueError("confirm_sha256 must be 64 lowercase hex characters")
        return value


class ApprovalOut(BaseModel):
    party_role: str
    actor_name: str
    approved_at: str
    confirmed_sha256: str


class VersionCreatedOut(BaseModel):
    """Response for POST …/versions (contract §5.1)."""

    version_id: str
    version: int
    status: str
    sha256: str
    hash_algorithm: str
    canonical_length: int
    created_at: str
    created_by: str
    is_fully_approved: bool
    required_approvals: List[str]
    approvals: List[ApprovalOut]


class ApprovalRecordedOut(BaseModel):
    """Response for POST …/approve (contract §5.2)."""

    version: int
    approvals: List[ApprovalOut]
    required_approvals: List[str]
    is_fully_approved: bool


class VersionListItem(BaseModel):
    version: int
    status: str
    sha256: str
    created_at: str
    created_by: str
    is_fully_approved: bool
    approvals: List[ApprovalOut]


class VersionListOut(BaseModel):
    items: List[VersionListItem]
