"""B-14: the dummy hash used for timing equalisation must not drift.

The dummy hash is verified for unknown accounts to make their response time
match a real Argon2 verification. If its parameters differ from real hashes,
the timing difference becomes a user-enumeration oracle. Deriving it from the
live PasswordHasher at import makes drift impossible.
"""

from __future__ import annotations

import base64

from api.app import security


def _decode(encoded: str) -> bytes:
    return base64.b64decode(encoded + "=" * (-len(encoded) % 4))


def test_dummy_hash_uses_the_same_argon2_parameters_as_real_hashes():
    real = security.hash_password("probe").split("$")
    dummy = security._dummy_hash.split("$")

    assert real[1] == dummy[1] == "argon2id"  # algorithm
    assert real[2] == dummy[2]  # version
    assert real[3] == dummy[3]  # memory / time / parallelism
    assert len(_decode(real[4])) == len(_decode(dummy[4]))  # salt length
    assert len(_decode(real[5])) == len(_decode(dummy[5]))  # hash length


def test_dummy_verify_does_not_raise_on_a_normal_mismatch():
    security.dummy_verify("not-the-dummy-password")
