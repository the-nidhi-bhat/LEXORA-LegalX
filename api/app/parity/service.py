"""Application service for the bounded parity HTTP surface.

This module is the ONLY bridge between the HTTP layer and the existing,
unchanged parity engine. It:

- derives the approved ContractIR from stored agreement rows (never from the
  request body) and overwrites the derive helper's synthetic ids with the
  trusted database ids for the exact target version;
- builds ExecutionParameters from the same stored rows, allowing the caller to
  clarify only ``dispute_behavior`` / ``governing_law``;
- runs the engine with a server clock and appends the full evidence set in a
  single transaction (the request-scoped session commits once on success);
- re-derives and re-hashes on every trust-passport read so a stored "match" is
  never silently reused after the bound inputs changed.

No legal logic lives here: comparison rules, canonicalization and stale rules
belong to ``api.app.parity`` and are used unmodified.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from api.app.approvals import compute_approval_state
from api.app.deps import SessionContext
from api.app.errors import ApiError, field_detail
from api.app.ir.derive import derive_ir_from_agreement
from api.app.models.agreements import Agreement, AgreementVersion
from api.app.models.verification import (
    ExecutionParametersRow,
    IRDocument,
    ParityRun,
    VerificationRun,
)
from api.app.parity.canonicalization import CANONICALIZATION_VERSION
from api.app.parity.engine import ParityEngine
from api.app.parity.execution_parameters import ExecutionParameters
from api.app.routers.agreements import _current_version, _milestone_dicts, _party_dicts
from api.app.schemas.ir import ContractIR, DisputeBehavior, GoverningLaw
from api.app.schemas.parity import ExecutionParametersInput
from api.app.timeutil import to_wire, utcnow


#: Reported as ``engine_version`` on every appended verification run.
ENGINE_VERSION = "parity_v1"


@dataclass(frozen=True)
class _ComparisonInputs:
    """The two trusted in-memory objects handed to the parity engine."""

    approved_ir: ContractIR
    execution_params: ExecutionParameters


@dataclass(frozen=True)
class _LegalFacts:
    """Resolved legal terms for each side of the comparison.

    The approved IR takes the stored agreement's term and falls back to the
    client value only to clarify a gap. The execution parameters take the
    client's term and fall back to the agreement only when the client omits
    it. A deliberate client change therefore produces a real, blocker-able
    difference instead of being silently overwritten.
    """

    ir_dispute: DisputeBehavior
    ir_law: GoverningLaw
    ep_dispute: DisputeBehavior
    ep_law: GoverningLaw


def _resolve_legal_facts(
    agreement: Agreement,
    clarification: ExecutionParametersInput,
) -> _LegalFacts:
    """Resolve legal facts for the approved IR and the execution parameters.

    If either side has no value for a term, the service refuses to guess it
    (409 MISSING_CLARIFICATION).
    """
    ir_dispute_raw = (
        agreement.dispute_behavior
        if agreement.dispute_behavior is not None
        else clarification.dispute_behavior
    )
    ir_law_raw = (
        agreement.governing_law
        if agreement.governing_law is not None
        else clarification.governing_law
    )
    ep_dispute_raw = (
        clarification.dispute_behavior
        if clarification.dispute_behavior is not None
        else agreement.dispute_behavior
    )
    ep_law_raw = (
        clarification.governing_law
        if clarification.governing_law is not None
        else agreement.governing_law
    )

    missing: List[str] = []
    if ir_dispute_raw is None or ep_dispute_raw is None:
        missing.append("dispute_behavior")
    if ir_law_raw is None or ep_law_raw is None:
        missing.append("governing_law")
    if missing:
        raise ApiError.conflict(
            "MISSING_CLARIFICATION",
            "The agreement does not declare: " + ", ".join(missing) + ".",
            [
                field_detail(
                    f"execution_parameters.{name}",
                    "MISSING_CLARIFICATION",
                    "This legal term must be clarified before verification.",
                )
                for name in missing
            ],
        )

    # Values come from either an Agreement column (DB CHECK-constrained) or the
    # strict request schema, so all four enums are safe to construct here.
    return _LegalFacts(
        ir_dispute=DisputeBehavior(ir_dispute_raw),
        ir_law=GoverningLaw(ir_law_raw),
        ep_dispute=DisputeBehavior(ep_dispute_raw),
        ep_law=GoverningLaw(ep_law_raw),
    )


def build_comparison_inputs(
    agreement: Agreement,
    version: AgreementVersion,
    clarification: ExecutionParametersInput,
) -> _ComparisonInputs:
    """Derive the approved IR and execution parameters from stored rows.

    ``derive_ir_from_agreement`` takes rupees and generates synthetic ids; the
    stored total is in paise and the trusted ids are the exact agreement/version
    loaded by the router, so both are corrected here.
    """
    facts = _resolve_legal_facts(agreement, clarification)

    parties = _party_dicts(agreement.parties)
    milestones = _milestone_dicts(agreement.milestones)
    total_rupees = agreement.total_amount_minor / 100

    try:
        derived = derive_ir_from_agreement(
            agreement_type=agreement.agreement_type,
            currency=agreement.currency,
            total_amount=total_rupees,
            parties=parties,
            milestones=milestones,
            review_period_days=agreement.review_period_days,
            review_period_basis=agreement.review_period_basis,
            dispute_behavior=facts.ir_dispute.value,
            governing_law=facts.ir_law.value,
        )
        approved_ir = derived.model_copy(
            update={
                "agreement_id": agreement.id,
                "version_id": version.id,
            }
        )
        execution_params = ExecutionParameters(
            agreement_id=agreement.id,
            version_id=version.id,
            agreement_type=agreement.agreement_type,
            currency=agreement.currency,
            total_amount_minor=agreement.total_amount_minor,
            parties=parties,
            milestones=milestones,
            review_period_days=agreement.review_period_days,
            review_period_basis=agreement.review_period_basis,
            dispute_behavior=facts.ep_dispute,
            governing_law=facts.ep_law,
        )
    except (ValueError, TypeError, ValidationError) as exc:
        raise ApiError.validation(
            "Stored agreement data cannot be derived into a valid parity input.",
            [field_detail("execution_parameters", "VALIDATION_FAILED", str(exc))],
        ) from exc

    return _ComparisonInputs(approved_ir=approved_ir, execution_params=execution_params)


def _field_result_dicts(result) -> List[Dict[str, Any]]:
    return [fr.model_dump(mode="json") for fr in result.field_results]


def _json_canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _append_verification_artifacts(
    db: DbSession,
    *,
    agreement: Agreement,
    version: AgreementVersion,
    inputs: _ComparisonInputs,
    result,
    approvals_complete: bool,
    ctx: SessionContext,
    verified_at,
    request_id: str,
) -> VerificationRun:
    """Append all four artefacts to the open (single) transaction."""
    # IR documents are uniquely stamped per version; a repeat verification
    # reuses the immutable approved snapshot instead of UPDATE-ing it.
    existing_ir = db.scalar(
        select(IRDocument).where(IRDocument.version_id == version.id)
    )
    if existing_ir is None:
        db.add(
            IRDocument(
                id=str(uuid.uuid4()),
                agreement_id=agreement.id,
                version_id=version.id,
                schema_version=inputs.approved_ir.schema_version,
                agreement_type=agreement.agreement_type,
                currency=agreement.currency,
                total_amount_minor=agreement.total_amount_minor,
                ir_json=inputs.approved_ir.model_dump_json(),
                ir_sha256=result.approved_ir_hash,
                derived_by="deterministic",
                provenance_json=_json_canonical(inputs.approved_ir.provenance),
                created_by=ctx.user_id,
            )
        )

    db.add(
        ExecutionParametersRow(
            id=str(uuid.uuid4()),
            agreement_id=agreement.id,
            version_id=version.id,
            source="derived",
            params_json=inputs.execution_params.model_dump_json(),
            params_sha256=result.execution_params_hash,
            created_by=ctx.user_id,
        )
    )

    field_results = _field_result_dicts(result)
    blocking_fields = [fr["field"] for fr in field_results if fr["status"] == "blocking"]
    advisory_count = sum(1 for fr in field_results if fr["status"] == "advisory")

    parity_run = ParityRun(
        id=str(uuid.uuid4()),
        agreement_id=agreement.id,
        version_id=version.id,
        policy_version=result.parity_rules_version,
        passed=not result.is_blocked,
        checked_at=verified_at,
        critical_count=len(blocking_fields),
        advisory_count=advisory_count,
        rows_json=_json_canonical(field_results),
        result_sha256=hashlib.sha256(result.model_dump_json().encode("utf-8")).hexdigest(),
        canonicalization_version=result.canonicalization_version,
        parity_rules_version=result.parity_rules_version,
        created_by=ctx.user_id,
    )
    db.add(parity_run)

    run = VerificationRun(
        id=str(uuid.uuid4()),
        agreement_id=agreement.id,
        version_id=version.id,
        organization_id=ctx.organization_id,
        parity_run_id=parity_run.id,
        approved_ir_hash=result.approved_ir_hash,
        execution_params_hash=result.execution_params_hash,
        canonicalization_version=result.canonicalization_version,
        parity_rules_version=result.parity_rules_version,
        overall_status=result.overall_status,
        recommendation=result.recommendation,
        is_blocked=result.is_blocked,
        has_advisory_diffs=result.has_advisory_diffs,
        passed=(not result.is_blocked) and approvals_complete,
        critical_count=len(blocking_fields),
        blocking_fields_json=_json_canonical(blocking_fields),
        approvals_complete=approvals_complete,
        field_results_json=_json_canonical(field_results),
        message=result.message,
        verified_at=verified_at,
        verified_by=ctx.user_id,
        engine_version=ENGINE_VERSION,
        request_id=request_id or "",
        created_at=utcnow(),
    )
    db.add(run)
    db.flush()
    return run


def run_verification(
    db: DbSession,
    *,
    agreement: Agreement,
    version: AgreementVersion,
    clarification: ExecutionParametersInput,
    ctx: SessionContext,
    request_id: str = "",
) -> Dict[str, Any]:
    """Run the engine for one exact version and append its evidence."""
    approvals_complete = compute_approval_state(db, agreement, version)[2]
    inputs = build_comparison_inputs(agreement, version, clarification)

    verified_at = utcnow()
    engine = ParityEngine(inputs.approved_ir, inputs.execution_params)
    result = engine.compare(verified_at=verified_at)
    stale = engine.is_stale()

    run = _append_verification_artifacts(
        db,
        agreement=agreement,
        version=version,
        inputs=inputs,
        result=result,
        approvals_complete=approvals_complete,
        ctx=ctx,
        verified_at=verified_at,
        request_id=request_id,
    )

    # Serialize through the ParityResult schema, then apply the project's
    # Z-suffix UTC wire convention to the caller-supplied timestamp.
    result_payload = json.loads(result.model_dump_json())
    result_payload["verified_at"] = to_wire(result.verified_at)

    return {
        "result": result_payload,
        "verification_run_id": run.id,
        "approvals_complete": approvals_complete,
        # Informational only. A True value NEVER grants execution.
        "passed": (not result.is_blocked) and approvals_complete,
        "stale": stale,
    }


def _latest_run(
    db: DbSession, agreement: Agreement, version: AgreementVersion, org_id: str
) -> VerificationRun:
    run = db.scalar(
        select(VerificationRun)
        .where(
            VerificationRun.agreement_id == agreement.id,
            VerificationRun.version_id == version.id,
            VerificationRun.organization_id == org_id,
        )
        .order_by(VerificationRun.verified_at.desc(), VerificationRun.created_at.desc())
    )
    if run is None:
        raise ApiError.not_found("No verification run exists for this version.")
    return run


def build_trust_passport(
    db: DbSession,
    *,
    agreement: Agreement,
    version: AgreementVersion,
    ctx: SessionContext,
) -> Dict[str, Any]:
    """Evidence-only view, re-derived and re-hashed on every call.

    Returns no private document text and no IR JSON. A stored "match" whose
    bound inputs have since changed is surfaced as ``stale`` rather than
    being presented as a valid result.
    """
    run = _latest_run(db, agreement, version, ctx.organization_id)

    params_row = db.scalar(
        select(ExecutionParametersRow)
        .where(
            ExecutionParametersRow.agreement_id == agreement.id,
            ExecutionParametersRow.version_id == version.id,
            ExecutionParametersRow.source == "derived",
        )
        .order_by(ExecutionParametersRow.created_at.desc())
    )
    if params_row is None:
        raise ApiError.not_found("No execution parameters exist for this version.")
    try:
        stored_params = ExecutionParameters.model_validate_json(params_row.params_json)
    except ValidationError as exc:
        raise ApiError.validation(
            "Stored execution parameters cannot be revalidated.",
            [field_detail("execution_parameters", "VALIDATION_FAILED", str(exc))],
        ) from exc

    clarification = ExecutionParametersInput(
        dispute_behavior=stored_params.dispute_behavior,
        governing_law=stored_params.governing_law,
    )
    inputs = build_comparison_inputs(agreement, version, clarification)
    engine = ParityEngine(inputs.approved_ir, stored_params)
    current = engine.compare(verified_at=utcnow())
    stale = engine.is_stale(
        other_agreement_id=agreement.id,
        other_version_id=version.id,
        other_approved_ir_hash=run.approved_ir_hash,
        other_execution_params_hash=run.execution_params_hash,
        other_canonicalization_version=run.canonicalization_version,
        other_parity_rules_version=run.parity_rules_version,
    )

    field_results = json.loads(run.field_results_json)
    approvals_complete = compute_approval_state(db, agreement, version)[2]
    return {
        "agreement_id": run.agreement_id,
        "version": version.version,
        "version_id": run.version_id,
        "verification_run_id": run.id,
        "overall_status": "stale" if stale else run.overall_status,
        "stale": stale,
        "recommendation": run.recommendation,
        "is_blocked": run.is_blocked,
        "has_advisory_diffs": run.has_advisory_diffs,
        "passed": run.passed,
        "approvals_complete": approvals_complete,
        "approved_ir_hash": run.approved_ir_hash,
        "execution_params_hash": run.execution_params_hash,
        "canonicalization_version": run.canonicalization_version,
        "parity_rules_version": run.parity_rules_version,
        "current_approved_ir_hash": current.approved_ir_hash,
        "current_execution_params_hash": current.execution_params_hash,
        "canonicalization_version_current": CANONICALIZATION_VERSION,
        "field_results": field_results,
        "critical_count": run.critical_count,
        "message": run.message,
        "verified_at": to_wire(run.verified_at),
    }


def resolve_target_version(
    db: DbSession, agreement: Agreement, version: Optional[int]
):
    """Resolve an explicit version number, or the agreement's current version."""
    if version is not None:
        from api.app.routers.versions import _load_version

        return _load_version(db, agreement, version)
    target = _current_version(db, agreement)
    if target is None:
        raise ApiError.not_found("Version not found.")
    return target
