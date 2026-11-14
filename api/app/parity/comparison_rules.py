"""Field-by-field comparison logic with blocking/advisory classification.

Every compared field has a classification and rationale. See the approved design
for the complete blocking/advisory matrix.
"""

from typing import Any, List, Optional

from pydantic import BaseModel

from api.app.schemas.ir import PartyRole

from api.app.parity.execution_parameters import ExecutionParameters
from api.app.parity.result_schema import ParityFieldResult


def compare_parties(approved_parties, execution_parties) -> List[ParityFieldResult]:
    """Check party compliance with approved IR.

    CLIENT and PROVIDER are required. WITNESS is optional.
    """
    results = []
    exec_roles = {p.role for p in execution_parties}

    if PartyRole.CLIENT not in exec_roles:
        results.append(ParityFieldResult(
            field="parties",
            status="blocking",
            expected="At least one client party",
            actual=f"Roles present: {exec_roles}",
            error="Missing required party: client"
        ))
    if PartyRole.PROVIDER not in exec_roles:
        results.append(ParityFieldResult(
            field="parties",
            status="blocking",
            expected="At least one provider party",
            actual=f"Roles present: {exec_roles}",
            error="Missing required party: provider"
        ))

    exec_witnesses = [p for p in execution_parties if p.role == PartyRole.WITNESS]
    approved_witnesses = [p for p in approved_parties if p.role == PartyRole.WITNESS]

    if approved_witnesses and not exec_witnesses:
        results.append(ParityFieldResult(
            field="parties",
            status="advisory",
            expected="Witness(es) present in approved",
            actual="No witness parties",
            resolution="Optional: include witness parties if approved IR contains them"
        ))
    if not approved_witnesses and exec_witnesses:
        results.append(ParityFieldResult(
            field="parties",
            status="advisory",
            expected="No witness parties in approved",
            actual=f"Witness(es) present: {[p.name for p in exec_witnesses]}",
            resolution="Optional: witness parties OK if approved IR does not contain them"
        ))

    return results


def find_milestone_by_seq(milestones, seq: int):
    """Find milestone by stable sequence number."""
    for m in milestones:
        if m.seq == seq:
            return m
    return None


def compare_milestones(approved_milestones, exec_milestones) -> List[ParityFieldResult]:
    """Compare execution milestones against approved by seq number.

    Milestones are compared by stable sequence number, not list position.
    """
    results = []

    # Build lookup by seq
    approved_by_seq = {m.seq: m for m in approved_milestones}
    exec_by_seq = {m.seq: m for m in exec_milestones}

    all_seqs = set(list(approved_by_seq.keys()) + list(exec_by_seq.keys()))

    for seq in sorted(all_seqs):
        approved_m = approved_by_seq.get(seq)
        exec_m = exec_by_seq.get(seq)

        if approved_m is None:
            # Extra milestone in execution
            results.append(ParityFieldResult(
                field=f"milestones[{seq}]",
                status="blocking",
                expected="Not present in approved",
                actual=f"Present: seq={seq}, amount={exec_m.amount_minor}, due_date={exec_m.due_date}",
                error="Unexpected milestone: not present in approved IR"
            ))
        elif exec_m is None:
            # Missing milestone from approved
            results.append(ParityFieldResult(
                field=f"milestones[{seq}]",
                status="blocking",
                expected=f"Present: seq={seq}, amount={approved_m.amount_minor}, due_date={approved_m.due_date}",
                actual="Missing from execution",
                error="Missing required milestone: seq {seq}"
            ))
        else:
            # Compare fields
            if approved_m.amount_minor != exec_m.amount_minor:
                results.append(ParityFieldResult(
                    field=f"milestones[{seq}].amount_minor",
                    status="blocking",
                    expected=approved_m.amount_minor,
                    actual=exec_m.amount_minor,
                    error=f"Milestone {seq} amount mismatch"
                ))
            if approved_m.due_date != exec_m.due_date:
                results.append(ParityFieldResult(
                    field=f"milestones[{seq}].due_date",
                    status="blocking",
                    expected=approved_m.due_date,
                    actual=exec_m.due_date,
                    error=f"Milestone {seq} due-date mismatch"
                ))
            if approved_m.acceptance_criteria != exec_m.acceptance_criteria:
                results.append(ParityFieldResult(
                    field=f"milestones[{seq}].acceptance_criteria",
                    status="advisory",
                    expected=approved_m.acceptance_criteria,
                    actual=exec_m.acceptance_criteria,
                    resolution="Advisory: acceptance criteria difference"
                ))

    return results


def compare_execution_parameters(
    approved_ir,
    execution_params: ExecutionParameters,
) -> List[ParityFieldResult]:
    """Compare execution parameters against approved ContractIR.

    Applies the approved blocking/advisory matrix per field.
    """
    from api.app.parity.result_schema import ParityResult

    results = []

    # 1. Agreement ID
    if hasattr(approved_ir, 'agreement_id') and approved_ir.agreement_id != execution_params.agreement_id:
        results.append(ParityFieldResult(
            field="agreement_id",
            status="blocking",
            expected=approved_ir.agreement_id,
            actual=execution_params.agreement_id,
            error="Agreement ID mismatch"
        ))

    # 2. Version ID
    if hasattr(approved_ir, 'version_id') and approved_ir.version_id != execution_params.version_id:
        results.append(ParityFieldResult(
            field="version_id",
            status="blocking",
            expected=approved_ir.version_id,
            actual=execution_params.version_id,
            error="Version ID mismatch"
        ))

    # 3. Currency
    if approved_ir.currency != execution_params.currency:
        results.append(ParityFieldResult(
            field="currency",
            status="blocking",
            expected=str(approved_ir.currency),
            actual=str(execution_params.currency),
            error="Currency mismatch"
        ))

    # 4. Total amount
    if approved_ir.total_amount_minor != execution_params.total_amount_minor:
        results.append(ParityFieldResult(
            field="total_amount_minor",
            status="blocking",
            expected=approved_ir.total_amount_minor,
            actual=execution_params.total_amount_minor,
            error="Total amount mismatch"
        ))

    # 5. Milestone count
    approved_msr_count = len(approved_ir.milestones) if hasattr(approved_ir, 'milestones') else 0
    exec_msr_count = len(execution_params.milestones)
    if approved_msr_count != exec_msr_count:
        results.append(ParityFieldResult(
            field="milestone_count",
            status="blocking",
            expected=approved_msr_count,
            actual=exec_msr_count,
            error=f"Milestone count mismatch: approved {approved_msr_count} vs executed {exec_msr_count}"
        ))

    # 6. Milestone sequences and details (via compare_milestones)
    approved_milestones = approved_ir.milestones if hasattr(approved_ir, 'milestones') else []
    exec_milestones = execution_params.milestones
    milestone_results = compare_milestones(approved_milestones, exec_milestones)
    results.extend(milestone_results)

    # 7. Review period days
    if hasattr(approved_ir, 'review_period_days'):
        if approved_ir.review_period_days != execution_params.review_period_days:
            results.append(ParityFieldResult(
                field="review_period_days",
                status="blocking",
                expected=approved_ir.review_period_days,
                actual=execution_params.review_period_days,
                error=f"Review period days mismatch: {approved_ir.review_period_days} vs {execution_params.review_period_days}"
            ))

    # 8. Review period basis
    if hasattr(approved_ir, 'review_period_basis'):
        if approved_ir.review_period_basis != execution_params.review_period_basis:
            # Check if this affects deadline calculation
            results.append(ParityFieldResult(
                field="review_period_basis",
                status="blocking",
                expected=str(approved_ir.review_period_basis),
                actual=str(execution_params.review_period_basis),
                error="Review period basis mismatch: affects deadline calculation"
            ))

    # 9. Dispute behavior
    if approved_ir.dispute_behavior != execution_params.dispute_behavior:
        results.append(ParityFieldResult(
            field="dispute_behavior",
            status="blocking",
            expected=str(approved_ir.dispute_behavior),
            actual=str(execution_params.dispute_behavior),
            error="Dispute behavior mismatch"
        ))

    # 10. Governing law
    if hasattr(approved_ir, 'governing_law'):
        if approved_ir.governing_law != execution_params.governing_law:
            results.append(ParityFieldResult(
                field="governing_law",
                status="advisory",
                expected=str(approved_ir.governing_law) if approved_ir.governing_law else "None",
                actual=str(execution_params.governing_law) if execution_params.governing_law else "None",
                resolution="Governing law difference (advisory)"
            ))

    # 11. Parties comparison
    if hasattr(approved_ir, 'parties'):
        party_results = compare_parties(approved_ir.parties, execution_params.parties)
        results.extend(party_results)

    return results