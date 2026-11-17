"""Approval policy helpers shared by P0-04/P0-05/P0-08 (D-06 semantics).

``is_fully_approved`` is always *computed* from rows — never stored as a
single boolean that could stand in for multiple parties.
"""

from __future__ import annotations

from typing import Iterable, List, Sequence, Set

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from api.app.models.agreements import Agreement, AgreementParty, AgreementVersion, VersionApproval


def required_approvals(approval_policy: str, party_roles: Sequence[str]) -> List[str]:
    """The party roles that must approve, given the agreement's policy.

    - ``all_parties``: every distinct party role, in first-seen order;
    - ``client_only``: ``["client"]`` (creation/patch validation guarantees a
      client party exists, so this is never an empty, vacuously-true set).
    """
    if approval_policy == "client_only":
        return ["client"]
    seen: List[str] = []
    for role in party_roles:
        if role not in seen:
            seen.append(role)
    return seen


def agreement_party_roles(db: DbSession, agreement_id: str) -> List[str]:
    parties = db.scalars(
        select(AgreementParty)
        .where(AgreementParty.agreement_id == agreement_id)
        .order_by(AgreementParty.created_at)
    ).all()
    return [p.role for p in parties]


def approved_roles(db: DbSession, version_id: str) -> Set[str]:
    rows = db.scalars(
        select(VersionApproval.party_role).where(VersionApproval.version_id == version_id)
    ).all()
    return set(rows)


def is_fully_approved(required: Iterable[str], approved: Iterable[str]) -> bool:
    """D-06: computed on every read; ``required ⊆ approved``."""
    return set(required).issubset(set(approved))


def approvals_for_version(db: DbSession, version_id: str) -> List[VersionApproval]:
    return list(
        db.scalars(
            select(VersionApproval)
            .where(VersionApproval.version_id == version_id)
            .order_by(VersionApproval.approved_at)
        ).all()
    )


def compute_approval_state(
    db: DbSession, agreement: Agreement, version: AgreementVersion
) -> tuple[List[str], Set[str], bool]:
    """Return ``(required_roles, approved_roles, fully_approved)`` for a version."""
    roles = agreement_party_roles(db, agreement.id)
    required = required_approvals(agreement.approval_policy, roles)
    approved = approved_roles(db, version.id)
    return required, approved, is_fully_approved(required, approved)
