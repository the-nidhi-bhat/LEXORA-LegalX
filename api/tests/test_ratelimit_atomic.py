"""B-09: the login limiter must consume a slot atomically with its limit check.

``check()`` followed by ``record_failure()`` leaves a check-to-use window in
which every concurrent request sees a not-yet-full bucket and is admitted;
the burst is only noticed after it has already passed the gate.
"""

from __future__ import annotations

import threading

from api.app.config import get_settings
from api.app.ratelimit import limiter

EMAIL = "atomic@legalx.demo"
IP = "atomic-ip"


def test_each_check_and_record_consumes_a_slot():
    limiter.reset()
    key = (EMAIL, IP)
    try:
        limit = get_settings().login_rate_limit_attempts
        results = [limiter.check_and_record(key) for _ in range(limit + 1)]
        assert [allowed for allowed, _, _ in results] == [True] * limit + [False]
        assert results[-1][1] >= 1, "a denied attempt must carry Retry-After"
    finally:
        limiter.reset()


def test_concurrent_attempts_never_burst_past_the_limit():
    limiter.reset()
    key = (EMAIL, IP)
    try:
        limit = get_settings().login_rate_limit_attempts
        count = limit * 4
        barrier = threading.Barrier(count)
        results: list[bool] = []
        results_lock = threading.Lock()

        def worker() -> None:
            barrier.wait()  # maximise overlap between the attempts
            allowed, _, _ = limiter.check_and_record(key)
            with results_lock:
                results.append(allowed)

        threads = [threading.Thread(target=worker) for _ in range(count)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert sum(results) == limit, f"expected {limit} allowed, got {sum(results)}"
    finally:
        limiter.reset()


def test_unrecord_releases_only_the_calling_attempts_slot():
    limiter.reset()
    key = (EMAIL, IP)
    try:
        limiter.check_and_record(key)  # a genuine credential failure
        _, _, stamp = limiter.check_and_record(key)  # an authorization-only outcome
        limiter.unrecord(key, stamp)
        assert len(limiter._attempts[key]) == 1
    finally:
        limiter.reset()


def test_each_failed_sign_in_consumes_exactly_one_slot(client):
    """The atomic slot and a separate record_failure must not double-count."""
    limiter.reset()
    try:
        for _ in range(4):
            response = client.post(
                "/api/v1/auth/session",
                json={"email": "owner@legalx.demo", "password": "wrong"},
            )
            assert response.status_code == 401
        # With double counting the legitimate sign-in below would be a 429.
        ok = client.post(
            "/api/v1/auth/session",
            json={"email": "owner@legalx.demo", "password": "legalx-demo-2026"},
        )
        assert ok.status_code == 200, ok.text
    finally:
        limiter.reset()
