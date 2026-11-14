"""Core ParityEngine — deterministic, version-bound, auditable parity comparison.

The engine compares an approved ContractIR against ExecutionParameters and
produces a structured ParityResult. It does NOT independently approve agreements
or grant execution authorization.

Key design guarantees:
- Separate canonical hashes for approved_ir and execution_params (never interchangeable)
- Identity binds to agreement_id and version_id from trusted verification context
- Successful comparison alone does NOT authorize execution
- Result becomes stale when bound inputs change
- Blocking mismatches prevent; advisory differences flag for review
"""

from datetime import datetime
from typing import Optional

from api.app.parity.comparison_rules import compare_execution_parameters
from api.app.parity.canonicalization import (
    CANONICALIZATION_VERSION,
    canonicalize_approved_ir,
    canonicalize_execution_params,
)
from api.app.parity.result_schema import ParityResult, ParityFieldResult
from api.app.parity.version_binding import VersionBinding, ParityResultMetadata


class ParityEngine:
    """Deterministic parity comparison engine.

    Compares an approved ContractIR against ExecutionParameters and produces
    a structured ParityResult. Does NOT independently approve agreements or
    grant execution authorization.
    """

    def __init__(self, approved_ir, execution_params: object):
        """Initialize the engine with the approved IR and execution parameters.

        The engine does NOT validate that the approved IR is current or authorized;
        that responsibility belongs to the caller's verification context.
        """
        self.approved_ir = approved_ir
        self.execution_params = execution_params
        self._binding = None
        self._results = None
        self._hashes_computed = False

    def _compute_hashes_and_binding(self):
        """Compute separate hashes and establish version binding.

        These are computed once and cached. The binding ties the result to
        specific inputs — if any change, the result is stale.
        """
        # Compute canonical hashes
        approved_hash = canonicalize_approved_ir(self.approved_ir)
        execution_hash = canonicalize_execution_params(self.execution_params)

        # Establish version binding
        self._binding = VersionBinding(
            agreement_id=self._get_agreement_id(),
            version_id=self._get_version_id(),
            approved_ir_hash=approved_hash,
            execution_params_hash=execution_hash,
        )
        self._hashes_computed = True

    def _get_agreement_id(self):
        """Extract agreement_id from either ContractIR or ExecutionParameters."""
        if hasattr(self.approved_ir, 'agreement_id'):
            return self.approved_ir.agreement_id
        return getattr(self.approved_ir, 'agreement_id', '')

    def _get_version_id(self):
        """Extract version_id from either ContractIR or ExecutionParameters."""
        if hasattr(self.approved_ir, 'version_id'):
            return self.approved_ir.version_id
        return getattr(self.approved_ir, 'version_id', '')

    def compare(self, verified_at: Optional[datetime] = None) -> ParityResult:
        """Run the full parity comparison and return a ParityResult.

        Returns a structured result with field-level breakdown, overall status,
        and execution recommendation. The result is bound to the specific inputs
        via version binding — it becomes stale if those inputs change.

        ``verified_at`` is the caller's clock. Pass it when you need byte-identical
        results across runs; the comparison itself depends only on the inputs.
        """
        if not self._hashes_computed:
            self._compute_hashes_and_binding()

        # Run field-level comparison
        field_results = compare_execution_parameters(
            self.approved_ir, self.execution_params
        )

        # Determine overall status and build result
        is_blocked = any(fr.status == "blocking" for fr in field_results)
        has_advisory_diffs = any(fr.status == "advisory" for fr in field_results) and not is_blocked

        # Build overall status
        if is_blocked:
            overall_status = "blocked"
            recommendation = "blocked"
        elif has_advisory_diffs:
            overall_status = "advisory"
            recommendation = "review"
        else:
            overall_status = "match"
            recommendation = "proceed"

        # Message
        if is_blocked:
            message = f"Parity check BLOCKED: {len([fr for fr in field_results if fr.status == 'blocking'])} blocking mismatch(es) detected"
        elif has_advisory_diffs:
            message = f"Parity check ADVISORY: {len([fr for fr in field_results if fr.status == 'advisory'])} advisory difference(s) detected"
        else:
            message = "Parity check MATCH: approved IR and execution parameters are identical"

        # Build message with details of blocking mismatches
        blocking_details = "; ".join(
            fr.error if fr.error else f"{fr.field}: {fr.expected} vs {fr.actual}"
            for fr in field_results if fr.status == "blocking"
        )
        if blocking_details:
            message += f" — {blocking_details}"

        # Build advisory details
        advisory_details = "; ".join(
            fr.resolution if fr.resolution else f"{fr.field}: {fr.expected} vs {fr.actual}"
            for fr in field_results if fr.status == "advisory"
        )
        if advisory_details and not is_blocked:
            message += f" — {advisory_details}"

        # Build field results list ordered by significance
        # Blocking first, then advisory, then ok
        sorted_results = sorted(
            field_results,
            key=lambda fr: (0 if fr.status == "blocking" else (1 if fr.status == "advisory" else 2)),
        )

        # Construct ParityResult
        result = ParityResult(
            agreement_id=self._get_agreement_id(),
            version_id=self._get_version_id(),
            approved_ir_hash=self._binding.approved_ir_hash if self._binding else "",
            execution_params_hash=self._binding.execution_params_hash if self._binding else "",
            canonicalization_version=self._binding.canonicalization_version if self._binding else CANONICALIZATION_VERSION,
            parity_rules_version=self._binding.parity_rules_version if self._binding else "v1",
            overall_status=overall_status,
            is_blocked=is_blocked,
            has_advisory_diffs=has_advisory_diffs,
            field_results=sorted_results,
            message=message,
            recommendation=recommendation,
            verified_at=verified_at if verified_at is not None else datetime.now(),
        )

        self._results = result
        return result

    def is_stale(self, other_agreement_id=None, other_version_id=None,
                 other_approved_ir_hash=None, other_execution_params_hash=None,
                 other_canonicalization_version=None, other_parity_rules_version=None) -> bool:
        """Check if this result is stale due to input changes.

        Returns True if the parity result must be considered invalid because its
        bound inputs have changed.

        Two independent things are checked:

        1. **In-memory mutation** — both hashes are recomputed from the live
           objects. If either input was modified after ``compare()`` (a TOCTOU
           hazard at any API boundary), the recomputed hash no longer matches the
           hash bound into the result, and the result is stale. The cached
           binding alone could never detect this.
        2. **Caller-supplied current state** — any ``other_*`` argument that
           differs from the binding marks the result stale.
        """
        if self._binding is None:
            return True  # No binding = considered stale

        if canonicalize_approved_ir(self.approved_ir) != self._binding.approved_ir_hash:
            return True
        if canonicalize_execution_params(self.execution_params) != self._binding.execution_params_hash:
            return True

        return self._binding.is_stale(
            other_agreement_id=other_agreement_id,
            other_version_id=other_version_id,
            other_approved_ir_hash=other_approved_ir_hash,
            other_execution_params_hash=other_execution_params_hash,
            other_canonicalization_version=other_canonicalization_version,
            other_parity_rules_version=other_parity_rules_version,
        )

    def get_binding(self) -> VersionBinding:
        """Return the version binding for this comparison."""
        if self._binding is None:
            self._compute_hashes_and_binding()
        return self._binding


def run_parity_comparison(approved_ir, execution_params) -> dict:
    """Convenience function: run parity comparison and return dict result.

    Useful for quick integration checks without constructing ParityEngine
    manually.
    """
    engine = ParityEngine(approved_ir, execution_params)
    result = engine.compare()
    return {
        "overall_status": result.overall_status,
        "is_blocked": result.is_blocked,
        "has_advisory_diffs": result.has_advisory_diffs,
        "agreement_id": result.agreement_id,
        "version_id": result.version_id,
        "approved_ir_hash": result.approved_ir_hash,
        "execution_params_hash": result.execution_params_hash,
        "schema_version": result.schema_version,
        "canonicalization_version": result.canonicalization_version,
        "parity_rules_version": result.parity_rules_version,
        "message": result.message,
        "recommendation": result.recommendation,
        "field_results": [
            {
                "field": fr.field,
                "status": fr.status,
                "expected": fr.expected,
                "actual": fr.actual,
                "error": fr.error,
                "resolution": fr.resolution,
            }
            for fr in result.field_results
        ],
    }