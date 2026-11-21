"""Request schemas for the bounded parity HTTP surface.

Only the fields an executor may legitimately choose are accepted from a
client. Agreement identity, version identity, agreed money, parties,
milestones and review terms are always derived server-side from stored
agreement rows; ``agreement_id``, ``version_id`` and ``schema_version`` are
therefore rejected here (``extra="forbid"`` → 422).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict

from api.app.schemas.ir import DisputeBehavior, GoverningLaw


class ExecutionParametersInput(BaseModel):
    """Client-supplied execution clarification subset.

    These are the only ExecutionParameters fields a caller may provide. When
    the stored agreement already carries a legal term it wins; the client value
    is used to clarify a gap. Missing clarification on both sides is reported
    as 409 MISSING_CLARIFICATION by the parity service.
    """

    model_config = ConfigDict(extra="forbid")

    dispute_behavior: Optional[DisputeBehavior] = None
    governing_law: Optional[GoverningLaw] = None


class ParityVerifyRequest(BaseModel):
    """Body of POST /agreements/{id}/versions/{version}/verify."""

    model_config = ConfigDict(extra="forbid")

    execution_parameters: ExecutionParametersInput
