"""LEGALX P0-07 Parity Engine — deterministic, version-bound, auditable.

Public API:
    ParityEngine          — core comparison engine
    ExecutionParameters   — strict execution-parameter model
    ParityResult          — structured comparison result
    ParityFieldResult     — field-level comparison result
    VersionBinding        — hash/version binding for stale detection
"""

from api.app.parity.engine import ParityEngine, run_parity_comparison
from api.app.parity.execution_parameters import ExecutionParameters
from api.app.parity.result_schema import ParityResult, ParityFieldResult
from api.app.parity.version_binding import VersionBinding, ParityResultMetadata

__all__ = [
    "ParityEngine",
    "run_parity_comparison",
    "ExecutionParameters",
    "ParityResult",
    "ParityFieldResult",
    "VersionBinding",
    "ParityResultMetadata",
]
