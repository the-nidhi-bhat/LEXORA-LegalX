"""Activity event schemas — API_CONTRACTS.md §9."""

from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel, Field


class ActivityEventOut(BaseModel):
    id: str
    agreement_id: str
    event_type: str
    payload: Dict[str, Any]
    created_at: str

    model_config = {"from_attributes": True}