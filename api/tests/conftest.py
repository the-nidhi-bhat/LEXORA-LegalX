"""Shared pytest fixtures for the LEGALX API suite.

Environment is configured *before* any ``api.app`` import so the settings
singleton reads the test values.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

# --- environment first (must precede any api.app import) -------------------
os.environ["APP_ENV"] = "test"
_temp_dir = tempfile.mkdtemp(prefix="legalx-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_temp_dir) / 'legalx-test.db'}"
os.environ.pop("CORS_ORIGINS", None)
os.environ["DEMO_TAMPER_ENDPOINT"] = "false"

from api.app.config import reset_settings  # noqa: E402

reset_settings()

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from api.app.db import Base, dispose_engine, get_engine  # noqa: E402

DEMO_PASSWORD = "legalx-demo-2026"


@pytest.fixture(scope="session")
def engine():
    """Create the schema once per test session on the configured test store."""
    from api.app import models  # noqa: F401  (registers tables on Base)

    Base.metadata.create_all(bind=get_engine())
    yield get_engine()
    Base.metadata.drop_all(bind=get_engine())
    dispose_engine()


@pytest.fixture(scope="session")
def seeded(engine):
    """Demo workspaces and personas, seeded once per session (idempotent)."""
    from api.app.seeds import seed_demo_data

    return seed_demo_data()


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Rate-limit state is process-global; isolate every test from the last."""
    from api.app.ratelimit import limiter

    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(autouse=True)
def _clean_agreement_data(engine, seeded):
    """Wipe agreement-domain rows between tests.

    Users/organizations are seeded once per session, but every agreement,
    version, approval, milestone and idempotency row is test-local so list
    counts and uniqueness assertions are deterministic.
    """
    from sqlalchemy import delete

    from api.app.db import session_scope
    from api.app.models.agreements import (
        ActivityEvent,
        Agreement,
        AgreementParty,
        AgreementVersion,
        IdempotencyKey,
        Milestone,
        VersionApproval,
    )
    from api.app.models.verification import (
        ExecutionParametersRow,
        IRDocument,
        ParityRun,
        VerificationRun,
    )

    # Verification artefacts are test-local too. Delete them before the
    # agreement rows they reference, and do not touch any migration.
    order = [
        VerificationRun,
        ParityRun,
        ExecutionParametersRow,
        IRDocument,
        ActivityEvent,
        IdempotencyKey,
        VersionApproval,
        Milestone,
        AgreementParty,
        AgreementVersion,
        Agreement,
    ]
    with session_scope() as session:
        for model in order:
            session.execute(delete(model))
    yield


@pytest.fixture()
def client(engine, seeded) -> TestClient:
    """A fresh app instance bound to the session-scoped test schema."""
    from api.app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture()
def db(engine, seeded):
    """Direct DB session for arranging/asserting rows (never for API calls)."""
    from api.app.db import session_scope

    with session_scope() as session:
        yield session


@dataclass
class SessionHandle:
    """An authenticated browser session: raw cookie + its CSRF token."""

    email: str
    cookie_value: str
    csrf_token: str
    body: Dict = field(default_factory=dict)


@pytest.fixture()
def sessions(client):
    """Factory for authenticated sessions that can be switched at will.

    ``handle = sessions.login("owner@legalx.demo")`` then ``sessions.switch(handle)``
    restores that identity — two personas can coexist in one test.
    """

    class SessionFactory:
        def __init__(self) -> None:
            self.client = client
            self.current: Optional[SessionHandle] = None

        @property
        def csrf_headers(self) -> Dict[str, str]:
            """The X-CSRF-Token header for the session currently in the jar."""
            if self.current is None:
                return {}
            return {"X-CSRF-Token": self.current.csrf_token}

        def get(self, path: str, **kwargs):
            return self.client.get(path, **kwargs)

        def post(self, path: str, **kwargs):
            headers = dict(kwargs.pop("headers", None) or {})
            headers.setdefault(
                "X-CSRF-Token", self.csrf_headers.get("X-CSRF-Token", "")
            )
            return self.client.post(path, headers=headers, **kwargs)

        def patch(self, path: str, **kwargs):
            headers = dict(kwargs.pop("headers", None) or {})
            headers.setdefault(
                "X-CSRF-Token", self.csrf_headers.get("X-CSRF-Token", "")
            )
            return self.client.patch(path, headers=headers, **kwargs)

        def login(self, email: str, password: str = DEMO_PASSWORD) -> SessionHandle:
            client.cookies.clear()
            response = client.post(
                "/api/v1/auth/session", json={"email": email, "password": password}
            )
            assert response.status_code == 200, response.text
            body = response.json()
            cookie_value = client.cookies.get("lx_session")
            assert cookie_value, "session cookie missing after sign-in"
            handle = SessionHandle(
                email=email,
                cookie_value=cookie_value,
                csrf_token=body["csrf_token"],
                body=body,
            )
            self.current = handle
            return handle

        def switch(self, handle: Optional[SessionHandle]) -> None:
            client.cookies.clear()
            self.current = handle
            if handle is not None:
                client.cookies.set("lx_session", handle.cookie_value)

        def logout(self, handle: SessionHandle) -> None:
            self.switch(handle)
            response = client.delete(
                "/api/v1/auth/session",
                headers={"X-CSRF-Token": handle.csrf_token},
            )
            assert response.status_code == 204, response.text

    return SessionFactory()
