"""Authoritative business validation for agreements — API_CONTRACTS.md §4.2/§13.

The server is the only authority: these functions run inside the request
before any row is written and return **all** problems at once as
``details[]`` entries (``{field, code, message}``). The client mirrors these
rules purely for inline UX; a client check with no counterpart here is a bug.

``agreement_type`` accepts the values of Nidhi's ``AgreementType`` enum
(``service_agreement`` | ``freelance_milestone`` | ``milestone_contract``) so
that IR derivation (P0-06) always receives a supported type. This is a
recorded divergence from the illustrative ``"services"`` value in the §4.2
example body — the contract's validation table does not enumerate
``agreement_type`` values.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from api.app.schemas.ir import DisputeBehavior, GoverningLaw

AGREEMENT_TYPES = ("service_agreement", "freelance_milestone", "milestone_contract")
CURRENCY_ALLOWLIST = ("INR",)
APPROVAL_POLICIES = ("all_parties", "client_only")
REVIEW_BASES = ("calendar", "business")
PARTY_ROLES = ("client", "provider", "witness")
# Single source of truth: Nidhi's IR enums (P0-06) — an agreement must only
# ever carry facts her deriver can represent.
DISPUTE_BEHAVIORS = tuple(member.value for member in DisputeBehavior)
GOVERNING_LAWS = tuple(member.value for member in GoverningLaw)

Detail = Dict[str, str]


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """Read a field from either a pydantic model or a plain dict."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _detail(field: str, code: str, message: str) -> Detail:
    return {"field": field, "code": code, "message": message}


def _validate_title(title: Any, details: List[Detail]) -> None:
    if not isinstance(title, str) or not title.strip():
        details.append(_detail("title", "VALUE_ERROR", "Title must not be blank"))
    elif not (3 <= len(title.strip()) <= 200):
        details.append(
            _detail("title", "VALUE_ERROR", "Title must be 3 to 200 characters")
        )


def _validate_policy_fields(
    data: Dict[str, Any], details: List[Detail], *, present: Sequence[str]
) -> None:
    if "agreement_type" in present:
        if data.get("agreement_type") not in AGREEMENT_TYPES:
            details.append(
                _detail(
                    "agreement_type",
                    "VALUE_ERROR",
                    "agreement_type must be one of: " + ", ".join(AGREEMENT_TYPES),
                )
            )
    if "currency" in present:
        if data.get("currency") not in CURRENCY_ALLOWLIST:
            details.append(
                _detail(
                    "currency",
                    "VALUE_ERROR",
                    "Only INR is supported in this release",
                )
            )
    if "approval_policy" in present:
        if data.get("approval_policy") not in APPROVAL_POLICIES:
            details.append(
                _detail(
                    "approval_policy",
                    "VALUE_ERROR",
                    "approval_policy must be one of: " + ", ".join(APPROVAL_POLICIES),
                )
            )
    if "review_period_basis" in present:
        if data.get("review_period_basis") not in REVIEW_BASES:
            details.append(
                _detail(
                    "review_period_basis",
                    "VALUE_ERROR",
                    "review_period_basis must be calendar or business",
                )
            )
    if "review_period_days" in present:
        days = data.get("review_period_days")
        if not isinstance(days, int) or isinstance(days, bool) or not (1 <= days <= 90):
            details.append(
                _detail(
                    "review_period_days",
                    "VALUE_ERROR",
                    "review_period_days must be an integer between 1 and 90",
                )
            )
    if "extra_terms" in present:
        terms = data.get("extra_terms", "")
        if isinstance(terms, str) and len(terms) > 20000:
            details.append(
                _detail("extra_terms", "VALUE_ERROR", "extra_terms is limited to 20000 characters")
            )
    if "dispute_behavior" in present:
        value = data.get("dispute_behavior")
        # None is allowed (the fact may simply be absent until IR time).
        if value is not None and value not in DISPUTE_BEHAVIORS:
            details.append(
                _detail(
                    "dispute_behavior",
                    "VALUE_ERROR",
                    "dispute_behavior must be one of: " + ", ".join(DISPUTE_BEHAVIORS),
                )
            )
    if "governing_law" in present:
        value = data.get("governing_law")
        if value is not None and value not in GOVERNING_LAWS:
            details.append(
                _detail(
                    "governing_law",
                    "VALUE_ERROR",
                    "governing_law must be one of: " + ", ".join(GOVERNING_LAWS),
                )
            )


def _validate_parties(parties: Any, details: List[Detail]) -> None:
    if not isinstance(parties, list) or len(parties) < 2:
        details.append(
            _detail("parties", "VALUE_ERROR", "At least two parties are required")
        )
        return
    seen: set = set()
    for index, party in enumerate(parties):
        role = _get(party, "role")
        email = _get(party, "email")
        if role not in PARTY_ROLES:
            details.append(
                _detail(
                    f"parties[{index}].role",
                    "VALUE_ERROR",
                    "role must be client, provider or witness",
                )
            )
        if not email:
            details.append(
                _detail(f"parties[{index}].email", "VALUE_ERROR", "A valid email is required")
            )
            continue
        key = (role, email)
        if key in seen:
            details.append(
                _detail(
                    f"parties[{index}].email",
                    "VALUE_ERROR",
                    "Duplicate party: role and email must be unique",
                )
            )
        seen.add(key)
        name = _get(party, "name", "")
        if not isinstance(name, str) or not name.strip():
            details.append(
                _detail(f"parties[{index}].name", "VALUE_ERROR", "Party name must not be blank")
            )


def _validate_milestones(
    milestones: Any, total: Optional[int], details: List[Detail]
) -> None:
    if not isinstance(milestones, list) or len(milestones) < 1:
        details.append(
            _detail("milestones", "VALUE_ERROR", "At least one milestone is required")
        )
        return

    seqs = [_get(m, "seq") for m in milestones]
    if any(not isinstance(s, int) for s in seqs) or len(set(seqs)) != len(seqs):
        details.append(
            _detail("milestones", "VALUE_ERROR", "Milestone seq values must be unique")
        )
    elif sorted(seqs) != list(range(1, len(seqs) + 1)):
        details.append(
            _detail(
                "milestones",
                "VALUE_ERROR",
                "Milestone seq values must be contiguous from 1",
            )
        )

    running_sum = 0
    for index, milestone in enumerate(milestones):
        amount = _get(milestone, "amount_minor")
        if isinstance(amount, int) and not isinstance(amount, bool) and amount > 0:
            running_sum += amount
        else:
            details.append(
                _detail(
                    f"milestones[{index}].amount_minor",
                    "VALUE_ERROR",
                    "Milestone amount must be a positive integer in minor units",
                )
            )
        raw_due = _get(milestone, "due_date", "")
        try:
            parsed = date.fromisoformat(raw_due) if isinstance(raw_due, str) else None
        except ValueError:
            parsed = None
        if parsed is None:
            details.append(
                _detail(
                    f"milestones[{index}].due_date",
                    "VALUE_ERROR",
                    "due_date must be a valid YYYY-MM-DD date",
                )
            )
        elif parsed < _today():
            details.append(
                _detail(
                    f"milestones[{index}].due_date",
                    "VALUE_ERROR",
                    "due_date cannot be in the past",
                )
            )
        if not str(_get(milestone, "name", "") or "").strip():
            details.append(
                _detail(
                    f"milestones[{index}].name", "VALUE_ERROR", "Milestone name must not be blank"
                )
            )

    if total is not None and running_sum != total and not any(
        d["code"] == "SUM_MISMATCH" for d in details
    ):
        details.append(
            _detail(
                "milestones",
                "SUM_MISMATCH",
                f"{running_sum} != {total}",
            )
        )


def validate_create_agreement(data: Dict[str, Any]) -> List[Detail]:
    """Full rule set for ``POST /api/v1/agreements`` (contract §4.2 table)."""
    details: List[Detail] = []
    _validate_title(data.get("title"), details)
    _validate_policy_fields(
        data,
        details,
        present=(
            "agreement_type",
            "currency",
            "approval_policy",
            "review_period_days",
            "review_period_basis",
            "extra_terms",
            "dispute_behavior",
            "governing_law",
        ),
    )
    _validate_parties(data.get("parties"), details)
    _validate_milestones(data.get("milestones"), data.get("total_amount_minor"), details)
    return details


def validate_patch_agreement(
    data: Dict[str, Any], *, current_total: int, present: Sequence[str]
) -> List[Detail]:
    """Only the fields the client actually sent (contract §4.4)."""
    details: List[Detail] = []
    if "title" in present:
        _validate_title(data.get("title"), details)
    _validate_policy_fields(data, details, present=present)
    if "milestones" in present:
        # The agreement total is not patchable, so the sum rule still binds.
        _validate_milestones(data.get("milestones"), current_total, details)
    return details


def client_only_requires_client_detail(
    approval_policy: Any, party_roles: Sequence[str]
) -> Optional[Detail]:
    """Safety rule: ``client_only`` needs a ``client`` party to be meaningful.

    Without it ``required_approvals`` would be empty and the execution gate's
    approval check could never be satisfied honestly. Used for create *and*
    patch (the patch path passes the stored party roles).
    """
    if approval_policy == "client_only" and "client" not in party_roles:
        return _detail(
            "approval_policy",
            "VALUE_ERROR",
            "client_only requires a party with role 'client'",
        )
    return None
