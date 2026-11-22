"""Password hashing and session token primitives (decision D-02).

Rules (EXECUTION_PLAN.md §1, D-02 — no custom crypto):
- passwords: ``argon2-cffi`` (argon2id) — an established, reviewed algorithm;
- session tokens: ``secrets.token_urlsafe(32)`` — opaque, never a JWT;
- only the SHA-256 of a token is stored (API_CONTRACTS.md §1.2), so a database
  dump cannot be replayed as a live session;
- CSRF tokens are random values bound to the session row.

``hashlib``/``secrets`` here are exactly the usages the plan authorised:
token generation and SHA-256 storage helpers.
"""

from __future__ import annotations

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

# Library defaults (argon2id). Tuned by argon2-cffi, never hand-rolled.
_hasher = PasswordHasher()

# Build the timing-equalisation hash with the *live* hasher so its parameters
# can never drift from those of real password hashes. A hard-coded dummy with
# hash_len=4 (instead of the default 32) was previously used (B-14).
_dummy_hash = _hasher.hash("legalx-timing-equalisation-placeholder")


def hash_password(password: str) -> str:
    """Return an argon2id hash string for ``password``."""
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """Constant-ish-time verification; returns False on any mismatch."""
    if not password_hash:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, Exception):  # noqa: BLE001
        # Includes "too many hashes" rehash races: never leak the reason.
        return False


def dummy_verify(password: str) -> None:
    """Burn comparable CPU for unknown accounts so timing cannot enumerate users."""
    try:
        _hasher.verify(_dummy_hash, password)
    except Exception:  # noqa: BLE001 - expected: the dummy hash never verifies
        pass


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 hex of a raw session token (storage form; contract §1.2)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_equal(a: str, b: str) -> bool:
    return secrets.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
