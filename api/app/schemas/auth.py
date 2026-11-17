"""Authentication schemas — API_CONTRACTS.md §3."""

from __future__ import annotations

import re
from typing import List

from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,253}\.)+[a-zA-Z]{2,63}$")


class SignInRequest(BaseModel):
    email: str = Field(..., max_length=320)
    password: str = Field(..., min_length=1, max_length=1024)

    @field_validator("email")
    @classmethod
    def _email_shape(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not _EMAIL_RE.fullmatch(normalized):
            raise ValueError("Enter a valid email address")
        return normalized


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    initials: str
    role: str
    organization_id: str
    organization_name: str


class SessionOut(BaseModel):
    """Sign-in and ``GET /me`` share this shape (§3.1/§3.3)."""

    user: UserOut
    permissions: List[str]
    csrf_token: str
    expires_at: str
