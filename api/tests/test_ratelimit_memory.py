"""H-02: the shared limiter must not retain empty per-key buckets forever.

``check()`` prunes expired timestamps, but leaving the emptied deques in the
``_attempts`` dict makes the dict grow without bound as distinct users and
agreements are seen. An allowed check must leave no bucket behind.
"""

from __future__ import annotations

import time

from api.app.config import get_settings
from api.app.ratelimit import limiter


def test_check_does_not_retain_empty_buckets():
    limiter.reset()
    key = ("memory:user", "memory-agreement")
    try:
        allowed, retry_after = limiter.check(key)
        assert (allowed, retry_after) == (True, 0)
        assert key not in limiter._attempts, "a check with no failures leaked a bucket"
    finally:
        limiter.reset()


def test_check_prunes_fully_expired_bucket():
    limiter.reset()
    key = ("memory:user", "expired-agreement")
    try:
        limiter.record_failure(key)
        assert key in limiter._attempts

        # Age the recorded timestamp past the configured window.
        window = get_settings().login_rate_limit_window_seconds
        with limiter._lock:
            limiter._attempts[key].clear()
            limiter._attempts[key].append(time.monotonic() - window - 1)

        allowed, retry_after = limiter.check(key)
        assert (allowed, retry_after) == (True, 0)
        assert key not in limiter._attempts, "expired bucket was not deleted"
    finally:
        limiter.reset()


def test_repeated_distinct_keys_do_not_grow_bucket_dict():
    limiter.reset()
    try:
        for i in range(25):
            limiter.check((f"memory:user-{i}", f"agreement-{i}"))
        assert len(limiter._attempts) == 0
    finally:
        limiter.reset()
