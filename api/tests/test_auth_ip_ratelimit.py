"""B-07: bound credential stuffing across many emails from one source IP.

The per-email budget stops repeated guesses at a single account but an attacker
can fan out over many addresses from one machine. A separate, higher budget on
the same in-memory limiter closes that gap without a new component.
"""

from __future__ import annotations

from api.app.config import get_settings
from api.app.ratelimit import limiter

PASSWORD = "legalx-demo-2026"


def _sign_in(client, email: str, password: str):
    return client.post(
        "/api/v1/auth/session", json={"email": email, "password": password}
    )


def test_stuffing_across_distinct_emails_is_blocked_per_ip(client):
    limiter.reset()
    try:
        limit = get_settings().login_ip_rate_limit_attempts
        for i in range(limit):
            response = _sign_in(client, f"stuff-{i}@example.com", "wrong")
            assert response.status_code == 401, response.text

        blocked = _sign_in(client, "stuff-final@example.com", "wrong")
        assert blocked.status_code == 429, blocked.text
        assert blocked.json()["error"]["code"] == "RATE_LIMITED"
        assert blocked.headers.get("Retry-After")

        # The block is per source IP, so a fresh email cannot bypass it.
        assert _sign_in(client, "another@example.com", "wrong").status_code == 429
    finally:
        limiter.reset()


def test_successful_login_clears_the_ip_budget(client):
    limiter.reset()
    try:
        for i in range(3):
            assert _sign_in(client, f"fail-{i}@example.com", "wrong").status_code == 401
        assert _sign_in(client, "owner@legalx.demo", PASSWORD).status_code == 200
        assert _sign_in(client, "fresh@example.com", "wrong").status_code == 401
    finally:
        limiter.reset()


def test_ip_budget_does_not_shrink_the_per_email_budget(client):
    limiter.reset()
    try:
        for _ in range(5):
            assert _sign_in(client, "owner@legalx.demo", "wrong").status_code == 401
        blocked = _sign_in(client, "owner@legalx.demo", PASSWORD)
        assert blocked.status_code == 429
        assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    finally:
        limiter.reset()
