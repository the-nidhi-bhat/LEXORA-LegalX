"""Field-by-field comparison logic with blocking/advisory classification.

Every compared field has a classification and rationale. See the approved design
(``engine_design.md`` section 5) for the complete blocking/advisory matrix.

Two design entries are conditional, and the current models do not carry an
explicit "does this affect the deadline / execution obligations" signal. They are
implemented conservatively using only signals that *do* exist, so behaviour never
becomes more permissive:

* ``review_period_basis`` (A.12 vs B.4): blocking when the review-period length
  matches, because a differing basis then changes the computed deadline by
  itself. When the length already differs the deadline is blocked on
  ``review_period_days`` and the basis result is advisory, since it adds no
  further deadline effect.
* ``governing_law`` (A.14 vs B.5): blocking when both inputs declare a
  governing law and the values conflict, because a contradictory jurisdiction
  can change execution obligations. Advisory when one side omits the
  declaration (a gap does not contradict the approved terms) or the approved IR
  carries none.

Party *identity* is reported only (name and email, advisory). Identity-binding
enforcement as required by A.3 depends on trusted context that does not exist
yet, so it is deferred to P0-08 and remains a deployment blocker — see
``engine_design.md`` section 7.
"""

from typing import Dict, List

from api.app.schemas.ir import Party, PartyRole

from api.app.parity.execution_parameters import ExecutionParameters
from api.app.parity.result_schema import ParityFieldResult


#: Roles that must be present in execution parameters.
REQUIRED_ROLES = (PartyRole.CLIENT, PartyRole.PROVIDER)


def _normalize(value) -> str:
    """Whitespace-only normalization, matching the approved canonical policy."""
    return (value or "").strip()


def _group_by_role(parties) -> Dict[PartyRole, List[Party]]:
    """Group parties by role, ordered deterministically by name then email."""
    groups: Dict[PartyRole, List[Party]] = {}
    for party in parties or []:
        groups.setdefault(party.role, []).append(party)
    for group in groups.values():
        group.sort(key=lambda p: (_normalize(p.name), _normalize(p.email)))
    return groups


def compare_parties(approved_parties, execution_parties) -> List[ParityFieldResult]:
    """Check party compliance with approved IR.

    CLIENT and PROVIDER are required. WITNESS is optional.

    Identity (name/email) differences are advisory: they are surfaced for human
    review, but they are not treated as identity verification. Binding an
    execution party to the approved party requires trusted identity context
    (P0-08).
    """
    results: List[ParityFieldResult] = []
    exec_roles = {p.role for p in execution_parties}

    for role in REQUIRED_ROLES:
        if role not in exec_roles:
            results.append(ParityFieldResult(
                field="parties",
                status="blocking",
                expected=f"At least one {role.value} party",
                actual=f"Roles present: {exec_roles}",
                error=f"Missing required party: {role.value}",
            ))

    exec_witnesses = [p for p in execution_parties if p.role == PartyRole.WITNESS]
    approved_witnesses = [p for p in approved_parties or [] if p.role == PartyRole.WITNESS]

    if approved_witnesses and not exec_witnesses:
        results.append(ParityFieldResult(
            field="parties",
            status="advisory",
            expected="Witness(es) present in approved",
            actual="No witness parties",
            resolution="Optional: include witness parties if approved IR contains them",
        ))
    if not approved_witnesses and exec_witnesses:
        results.append(ParityFieldResult(
            field="parties",
            status="advisory",
            expected="No witness parties in approved",
            actual=f"Witness(es) present: {[p.name for p in exec_witnesses]}",
            resolution="Optional: witness parties OK if approved IR does not contain them",
        ))

    results.extend(_compare_party_identity(approved_parties, execution_parties))
    return results


def _compare_party_identity(approved_parties, execution_parties) -> List[ParityFieldResult]:
    """Report party name and email differences per role (advisory only).

    Reproduces design B.3 (party email difference) and makes design A.3's
    identity gap visible instead of silent: a swapped counterparty no longer
    produces an empty result list.
    """
    results: List[ParityFieldResult] = []
    approved_by_role = _group_by_role(approved_parties)
    exec_by_role = _group_by_role(execution_parties)

    for role in (PartyRole.CLIENT, PartyRole.PROVIDER, PartyRole.WITNESS):
        approved_group = approved_by_role.get(role, [])
        exec_group = exec_by_role.get(role, [])

        # Witness presence is already reported above; avoid a duplicate count note.
        if role != PartyRole.WITNESS and len(approved_group) != len(exec_group):
            results.append(ParityFieldResult(
                field=f"parties.{role.value}.count",
                status="advisory",
                expected=len(approved_group),
                actual=len(exec_group),
                resolution=f"Party count difference for {role.value}",
            ))

        for position, (approved_party, exec_party) in enumerate(
            zip(approved_group, exec_group), start=1
        ):
            if _normalize(approved_party.name) != _normalize(exec_party.name):
                results.append(ParityFieldResult(
                    field=f"parties.{role.value}.name",
                    status="advisory",
                    expected=approved_party.name,
                    actual=exec_party.name,
                    resolution=(
                        f"Party name difference for {role.value} (position {position}) — "
                        "advisory only: identity binding is enforced by trusted "
                        "context (P0-08), not by the parity engine"
                    ),
                ))
            if _normalize(approved_party.email) != _normalize(exec_party.email):
                results.append(ParityFieldResult(
                    field=f"parties.{role.value}.email",
                    status="advisory",
                    expected=approved_party.email,
                    actual=exec_party.email,
                    resolution=f"Party email difference for {role.value}",
                ))

    return results


def compare_milestones(approved_milestones, exec_milestones) -> List[ParityFieldResult]:
    """Compare execution milestones against approved by seq number.

    Milestones are compared by stable sequence number, not list position.
    Missing and unexpected sequences are detected here, so no separate
    milestone-count check is needed.
    """
    results: List[ParityFieldResult] = []

    approved_by_seq = {m.seq: m for m in approved_milestones}
    exec_by_seq = {m.seq: m for m in exec_milestones}

    all_seqs = set(approved_by_seq) | set(exec_by_seq)

    for seq in sorted(all_seqs):
        approved_m = approved_by_seq.get(seq)
        exec_m = exec_by_seq.get(seq)

        if approved_m is None:
            results.append(ParityFieldResult(
                field=f"milestones[{seq}]",
                status="blocking",
                expected="Not present in approved",
                actual=f"Present: seq={seq}, amount={exec_m.amount_minor}, due_date={exec_m.due_date}",
                error="Unexpected milestone: not present in approved IR",
            ))
        elif exec_m is None:
            results.append(ParityFieldResult(
                field=f"milestones[{seq}]",
                status="blocking",
                expected=f"Present: seq={seq}, amount={approved_m.amount_minor}, due_date={approved_m.due_date}",
                actual="Missing from execution",
                error=f"Missing required milestone: seq {seq}",
            ))
        else:
            if approved_m.name != exec_m.name:
                results.append(ParityFieldResult(
                    field=f"milestones[{seq}].name",
                    status="advisory",
                    expected=approved_m.name,
                    actual=exec_m.name,
                    resolution=(
                        f"Milestone {seq} name difference: "
                        f"approved '{approved_m.name}' vs executed '{exec_m.name}'"
                    ),
                ))
            if approved_m.amount_minor != exec_m.amount_minor:
                results.append(ParityFieldResult(
                    field=f"milestones[{seq}].amount_minor",
                    status="blocking",
                    expected=approved_m.amount_minor,
                    actual=exec_m.amount_minor,
                    error=f"Milestone {seq} amount mismatch",
                ))
            if approved_m.due_date != exec_m.due_date:
                results.append(ParityFieldResult(
                    field=f"milestones[{seq}].due_date",
                    status="blocking",
                    expected=approved_m.due_date,
                    actual=exec_m.due_date,
                    error=f"Milestone {seq} due-date mismatch",
                ))
            if approved_m.acceptance_criteria != exec_m.acceptance_criteria:
                results.append(ParityFieldResult(
                    field=f"milestones[{seq}].acceptance_criteria",
                    status="advisory",
                    expected=approved_m.acceptance_criteria,
                    actual=exec_m.acceptance_criteria,
                    resolution="Advisory: acceptance criteria difference",
                ))

    return results


def _label(value) -> str:
    """Render an optional enum/None for reporting."""
    if value is None:
        return "None"
    return getattr(value, "value", str(value))


def compare_execution_parameters(
    approved_ir,
    execution_params: ExecutionParameters,
) -> List[ParityFieldResult]:
    """Compare execution parameters against approved ContractIR.

    Applies the approved blocking/advisory matrix per field.
    """
    results: List[ParityFieldResult] = []

    # 1. Agreement ID
    if approved_ir.agreement_id != execution_params.agreement_id:
        results.append(ParityFieldResult(
            field="agreement_id",
            status="blocking",
            expected=approved_ir.agreement_id,
            actual=execution_params.agreement_id,
            error="Agreement ID mismatch",
        ))

    # 2. Version ID
    if approved_ir.version_id != execution_params.version_id:
        results.append(ParityFieldResult(
            field="version_id",
            status="blocking",
            expected=approved_ir.version_id,
            actual=execution_params.version_id,
            error="Version ID mismatch",
        ))

    # 3. Currency
    if approved_ir.currency != execution_params.currency:
        results.append(ParityFieldResult(
            field="currency",
            status="blocking",
            expected=str(approved_ir.currency),
            actual=str(execution_params.currency),
            error="Currency mismatch",
        ))

    # 4. Total amount
    if approved_ir.total_amount_minor != execution_params.total_amount_minor:
        results.append(ParityFieldResult(
            field="total_amount_minor",
            status="blocking",
            expected=approved_ir.total_amount_minor,
            actual=execution_params.total_amount_minor,
            error="Total amount mismatch",
        ))

    # 5. Milestones (count, sequences and per-field detail in one pass)
    results.extend(compare_milestones(approved_ir.milestones, execution_params.milestones))

    # 6. Review period days
    if approved_ir.review_period_days != execution_params.review_period_days:
        results.append(ParityFieldResult(
            field="review_period_days",
            status="blocking",
            expected=approved_ir.review_period_days,
            actual=execution_params.review_period_days,
            error=(
                f"Review period days mismatch: {approved_ir.review_period_days} "
                f"vs {execution_params.review_period_days}"
            ),
        ))

    # 7. Review period basis — blocking only while it can change the deadline alone
    if approved_ir.review_period_basis != execution_params.review_period_basis:
        days_already_blocked = approved_ir.review_period_days != execution_params.review_period_days
        if days_already_blocked:
            results.append(ParityFieldResult(
                field="review_period_basis",
                status="advisory",
                expected=_label(approved_ir.review_period_basis),
                actual=_label(execution_params.review_period_basis),
                resolution=(
                    f"Review period basis difference: {_label(approved_ir.review_period_basis)} "
                    f"vs {_label(execution_params.review_period_basis)} "
                    "(advisory — review period length already blocks)"
                ),
            ))
        else:
            results.append(ParityFieldResult(
                field="review_period_basis",
                status="blocking",
                expected=_label(approved_ir.review_period_basis),
                actual=_label(execution_params.review_period_basis),
                error=(
                    f"Review period basis mismatch: {_label(approved_ir.review_period_basis)} "
                    f"vs {_label(execution_params.review_period_basis)} "
                    "(affects deadline calculation)"
                ),
            ))

    # 8. Dispute behavior
    if approved_ir.dispute_behavior != execution_params.dispute_behavior:
        results.append(ParityFieldResult(
            field="dispute_behavior",
            status="blocking",
            expected=_label(approved_ir.dispute_behavior),
            actual=_label(execution_params.dispute_behavior),
            error="Dispute behavior mismatch",
        ))

    # 9. Governing law — blocking on a declared conflict, advisory otherwise
    approved_law = getattr(approved_ir, "governing_law", None)
    exec_law = execution_params.governing_law
    if approved_law != exec_law:
        if approved_law is not None and exec_law is not None:
            results.append(ParityFieldResult(
                field="governing_law",
                status="blocking",
                expected=_label(approved_law),
                actual=_label(exec_law),
                error=f"Governing law mismatch: approved {_label(approved_law)} vs executed {_label(exec_law)}",
            ))
        else:
            results.append(ParityFieldResult(
                field="governing_law",
                status="advisory",
                expected=_label(approved_law),
                actual=_label(exec_law),
                resolution=(
                    f"Governing law difference: approved {_label(approved_law)} "
                    f"vs executed {_label(exec_law)} (advisory — declaration missing on one side)"
                ),
            ))

    # 10. Parties (required roles, witness presence, identity/email reporting)
    results.extend(compare_parties(approved_ir.parties, execution_params.parties))

    return results
