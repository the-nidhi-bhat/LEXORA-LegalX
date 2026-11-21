"""Version binding and stale-verification rules for the Parity Engine.

The parity engine does not independently approve agreements or grant execution
authorization. The caller supplies trusted verification context.

Stale-verification: a parity result becomes invalid when its bound inputs change.
"""

from typing import Optional

from api.app.parity.canonicalization import CANONICALIZATION_VERSION


class VersionBinding:
    """Bindings that tie a parity result to specific versioned inputs."""

    def __init__(
        self,
        agreement_id: str,
        version_id: str,
        approved_ir_hash: str,
        execution_params_hash: str,
        canonicalization_version: str = CANONICALIZATION_VERSION,
        parity_rules_version: str = "v1",
    ):
        self.agreement_id = agreement_id
        self.version_id = version_id
        self.approved_ir_hash = approved_ir_hash
        self.execution_params_hash = execution_params_hash
        self.canonicalization_version = canonicalization_version
        self.parity_rules_version = parity_rules_version

    def is_stale(
        self,
        other_agreement_id: Optional[str] = None,
        other_version_id: Optional[str] = None,
        other_approved_ir_hash: Optional[str] = None,
        other_execution_params_hash: Optional[str] = None,
        other_canonicalization_version: Optional[str] = None,
        other_parity_rules_version: Optional[str] = None,
    ) -> bool:
        """Check if this binding is stale due to input changes.

        A parity result becomes stale when any of these change:
        1. The approved version changes (different version_id).
        2. Execution parameters change (different ExecutionParameters object).
        3. Canonicalization version changes (different normalization rules).
        4. Parity rules change in a way that invalidates the previous result.
        5. Required approval state is revoked or changed.
        """
        changes = []
        if other_agreement_id is not None and other_agreement_id != self.agreement_id:
            changes.append("agreement_id")
        if other_version_id is not None and other_version_id != self.version_id:
            changes.append("version_id")
        if other_approved_ir_hash is not None and other_approved_ir_hash != self.approved_ir_hash:
            changes.append("approved_ir_hash")
        if other_execution_params_hash is not None and other_execution_params_hash != self.execution_params_hash:
            changes.append("execution_params_hash")
        if other_canonicalization_version is not None and other_canonicalization_version != self.canonicalization_version:
            changes.append("canonicalization_version")
        if other_parity_rules_version is not None and other_parity_rules_version != self.parity_rules_version:
            changes.append("parity_rules_version")

        return len(changes) > 0


class ParityResultMetadata:
    """Metadata binding for parity result traceability."""

    def __init__(
        self,
        agreement_id: str,
        version_id: str,
        approved_ir_hash: str,
        execution_params_hash: str,
        canonicalization_version: str = CANONICALIZATION_VERSION,
        parity_rules_version: str = "v1",
    ):
        self.binding = VersionBinding(
            agreement_id=agreement_id,
            version_id=version_id,
            approved_ir_hash=approved_ir_hash,
            execution_params_hash=execution_params_hash,
            canonicalization_version=canonicalization_version,
            parity_rules_version=parity_rules_version,
        )

    def stale(self, other_agreement_id=None, other_version_id=None,
              other_approved_ir_hash=None, other_execution_params_hash=None,
              other_canonicalization_version=None, other_parity_rules_version=None) -> bool:
        return self.binding.is_stale(
            other_agreement_id=other_agreement_id,
            other_version_id=other_version_id,
            other_approved_ir_hash=other_approved_ir_hash,
            other_execution_params_hash=other_execution_params_hash,
            other_canonicalization_version=other_canonicalization_version,
            other_parity_rules_version=other_parity_rules_version,
        )