"""Structured parity result models."""

from typing import Any, List, Optional
from typing import Literal

from pydantic import BaseModel, Field

from api.app.parity.canonicalization import CANONICALIZATION_VERSION


class ParityFieldResult(BaseModel):
    """Field-level comparison result.

    Every field comparison produces exactly one ParityFieldResult.
    Blocking mismatches carry an error message; advisory differences carry
    a resolution hint.
    """

    field: str  # dot-path for nested, or simple field name
    status: Literal["blocking", "advisory", "ok"]
    expected: Any  # Value from approved ContractIR / ExecutionParameters
    actual: Any    # Value from the other input
    error: Optional[str] = None  # Populated only for blocking status
    resolution: Optional[str] = None  # Populated only for advisory status


class ParityResult(BaseModel):
    """Structured result from parity comparison.

    Binds the comparison to exact agreement and version identifiers,
    separate hashes, and schema/rule versions.

    Never describes execution authorization — that is the caller's responsibility.
    """

    # Schema version for the parity ruleset
    schema_version: str = Field(default="parity_v1")

    # Agreement and version binding — supplied by the trusted verification context
    agreement_id: str
    version_id: str

    # Hashes for auditability — never interchangeable
    approved_ir_hash: str  # SHA-256 of canonicalized approved ContractIR
    execution_params_hash: str  # SHA-256 of canonicalized ExecutionParameters

    # Canonicalization and rules versions
    canonicalization_version: str = Field(default=CANONICALIZATION_VERSION)
    parity_rules_version: str = Field(default="v1")

    # Overall status
    overall_status: Literal["match", "advisory", "blocked", "invalid_input", "stale"]

    # Convenience flags
    is_blocked: bool  # True if any blocking mismatch
    has_advisory_diffs: bool  # True if any advisory differences only

    # Field-level results (ordered by field significance)
    field_results: List[ParityFieldResult]

    # Human-readable message
    message: str

    # Execution recommendation
    recommendation: Literal["proceed", "blocked", "review"]

    # Timestamp supplied by the caller (not secretly generated inside a supposedly pure comparison function)
    verified_at: Any  # datetime.datetime