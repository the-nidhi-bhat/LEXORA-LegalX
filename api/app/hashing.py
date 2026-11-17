"""Canonical text hashing (EXECUTION_PLAN.md §7, API_CONTRACTS.md §5.1).

The stored version text is preserved byte-for-byte. The hash is computed over
the **canonical** form:

1. CRLF (and CR) → LF
2. trailing whitespace stripped from every line
3. leading/trailing blank lines trimmed
4. Unicode NFC normalisation
5. ``sha256(utf-8 bytes)``, lowercase hex

``hashlib`` is the standard library primitive the plan explicitly authorised;
the *canonicalisation* steps above are the product's own documented rule, not
bespoke cryptography.
"""

from __future__ import annotations

import hashlib
import unicodedata
from typing import Tuple


def canonicalize(text: str) -> str:
    """Return the canonical form of ``text`` (never mutates the original)."""
    # 4. Unicode NFC first so line-level rules see composed characters.
    normalized = unicodedata.normalize("NFC", text)
    # 1. Newlines → LF.
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    # 2. Trailing whitespace per line.
    lines = [line.rstrip() for line in normalized.split("\n")]
    # 3. Trim outer blank lines.
    while lines and lines[0] == "":
        lines.pop(0)
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def canonical_sha256(text: str) -> Tuple[str, int]:
    """Return ``(sha256_hex, canonical_length)`` for ``text``.

    ``canonical_length`` is the UTF-8 byte length of the canonical form —
    the number a client can reproduce by canonicalising locally.
    """
    canonical = canonicalize(text)
    encoded = canonical.encode("utf-8")
    return hashlib.sha256(encoded).hexdigest(), len(encoded)


def sha256_hex(value: str) -> str:
    """Lowercase hex SHA-256 of a UTF-8 string (used for idempotency bodies)."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def is_sha256(value: str) -> bool:
    if len(value) != 64:
        return False
    return all(c in "0123456789abcdef" for c in value)
