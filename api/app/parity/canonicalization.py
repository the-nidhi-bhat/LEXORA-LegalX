"""Canonical serialization for Parity Engine.

Two independent canonical forms, never interchangeable:

- Approved ContractIR canonical form
- Execution Parameters canonical form

Both are deterministic: identical logical inputs always produce identical
canonical bytes, and different logical inputs always produce different bytes.
"""

import hashlib
import json
import unicodedata
from typing import Any

# Bumped whenever the canonical byte representation of an input changes, so a
# hash produced under an older algorithm can never be mistaken for a current one.
CANONICALIZATION_VERSION = "v2"


def canonicalize_approved_ir(ir) -> str:
    """Canonicalize the approved ContractIR using its defined rules.

    Same as ir_to_hash(): CRLF→LF, strip per-line trailing whitespace,
    NFC normalize, sha256(utf-8).
    """
    text = ir.model_dump_json(by_alias=True, exclude={"provenance"}, round_trip=True)
    # Parse back to dict to strip, then renormalise
    norm = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = norm.split("\n")
    stripped = "\n".join(line.rstrip() for line in lines).strip("\n")
    normalized = unicodedata.normalize("NFC", stripped)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _party_payload(party) -> dict[str, Any]:
    """Extract the hash-relevant fields of a party, whitespace-normalised."""
    email = party.email.strip() if party.email else None
    return {
        "role": party.role.value,
        "name": party.name.strip(),
        "email": email,
    }


def _milestone_payload(milestone) -> dict[str, Any]:
    """Extract the hash-relevant fields of a milestone."""
    return {
        "seq": milestone.seq,
        "amount_minor": milestone.amount_minor,
        "due_date": milestone.due_date.isoformat(),
        "acceptance_criteria": milestone.acceptance_criteria,
    }


def canonicalize_execution_params(params) -> str:
    """Canonicalize execution parameters independently.

    Separate canonicalization from the approved IR. Never interchangeable.

    The payload is serialised as JSON with sorted keys and no insignificant
    whitespace. A delimiter-joined string (the previous v1 form) allowed
    free-text fields containing ``|`` or ``:`` to shift field boundaries, so two
    different parameter sets could hash identically. JSON quoting removes that
    ambiguity entirely.

    Every field that parity compares is included, including
    ``review_period_days`` — omitting it would mean two parameter sets that
    differ only in review period shared a hash.
    """
    sorted_parties = sorted(
        (_party_payload(p) for p in params.parties),
        key=lambda p: (p["role"], p["name"], p["email"] or ""),
    )
    sorted_milestones = sorted(
        (_milestone_payload(m) for m in params.milestones),
        key=lambda m: m["seq"],
    )

    payload = {
        "schema_version": params.schema_version,
        "agreement_id": params.agreement_id,
        "version_id": params.version_id,
        "agreement_type": params.agreement_type.value,
        "currency": params.currency.value,
        "total_amount_minor": params.total_amount_minor,
        "parties": sorted_parties,
        "milestones": sorted_milestones,
        "review_period_days": params.review_period_days,
        "review_period_basis": params.review_period_basis.value,
        "dispute_behavior": params.dispute_behavior.value,
        "governing_law": (
            params.governing_law.value if params.governing_law is not None else None
        ),
    }

    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    canonical = unicodedata.normalize("NFC", canonical)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
