"""In-memory login rate limiting (API_CONTRACTS.md §3.1: 5 / 15 min per email+IP).

Single-process, by design: the demo runs one uvicorn worker. A distributed
deployment would move this to the database or a shared store — recorded as a
deployment note, not silently faked.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Tuple

from api.app.config import get_settings


class LoginRateLimiter:
    def __init__(self) -> None:
        self._attempts: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: Tuple[str, str]) -> Tuple[bool, int]:
        """Return ``(allowed, retry_after_seconds)`` for the next attempt."""
        settings = get_settings()
        now = time.monotonic()
        window = settings.login_rate_limit_window_seconds
        with self._lock:
            bucket = self._attempts[key]
            while bucket and now - bucket[0] > window:
                bucket.popleft()
            if not bucket:
                del self._attempts[key]
            if len(bucket) >= settings.login_rate_limit_attempts:
                retry_after = int(window - (now - bucket[0])) + 1
                return False, max(retry_after, 1)
            return True, 0

    def check_and_record(
        self, key: Tuple[str, str], *, attempts: Optional[int] = None
    ) -> Tuple[bool, int, float]:
        """Atomically consume one slot and report whether the attempt is allowed.

        ``check()`` followed by ``record_failure()`` is a check-to-use race: under
        concurrency every request can observe a not-yet-full bucket and all be
        admitted before any failure is recorded. Consuming the slot inside the
        same critical section as the limit check closes that window (B-09).

        Returns ``(allowed, retry_after_seconds, stamp)``. ``stamp`` is the slot
        taken by this call; a caller that later decides the attempt was not a
        credential failure can release exactly that slot with :meth:`unrecord`
        without erasing other failures recorded for the same key.
        """
        settings = get_settings()
        now = time.monotonic()
        window = settings.login_rate_limit_window_seconds
        limit = attempts if attempts is not None else settings.login_rate_limit_attempts
        with self._lock:
            bucket = self._attempts[key]
            while bucket and now - bucket[0] > window:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = int(window - (now - bucket[0])) + 1
                return False, max(retry_after, 1), now
            bucket.append(now)
            return True, 0, now

    def unrecord(self, key: Tuple[str, str], stamp: float) -> None:
        """Release the single slot consumed by a specific :meth:`check_and_record` call."""
        with self._lock:
            bucket = self._attempts.get(key)
            if not bucket:
                return
            try:
                bucket.remove(stamp)
            except ValueError:  # already pruned by the time window
                pass
            if not bucket:
                self._attempts.pop(key, None)

    def record_failure(self, key: Tuple[str, str]) -> None:
        with self._lock:
            self._attempts[key].append(time.monotonic())

    def reset(self, key: Tuple[str, str] | None = None) -> None:
        with self._lock:
            if key is None:
                self._attempts.clear()
            else:
                self._attempts.pop(key, None)


limiter = LoginRateLimiter()
