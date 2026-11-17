"""Database engine, session management and declarative base (P0-01).

Sync SQLAlchemy 2.x sessions (one session per request via ``get_db``).
The production target is PostgreSQL; tests and local development run on
SQLite with the same models. ``DATABASE_URL`` selects the store.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from api.app.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for every LEGALX ORM model."""


_engine: Engine | None = None
_SessionFactory: sessionmaker[Session] | None = None


def _make_engine(url: str) -> Engine:
    kwargs: dict[str, Any] = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        # FastAPI serves requests from worker threads; SQLite connections must
        # be usable across them. Tests use a file or StaticPool memory DB.
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        # Enforce foreign keys — SQLite ships with them OFF, which would make
        # our integrity constraints decorative in tests.
        from sqlalchemy import event

        @event.listens_for(engine, "connect")
        def _sqlite_pragma(dbapi_connection, _record):  # noqa: ANN001
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def get_engine() -> Engine:
    """Return the process-wide engine, created on first use."""
    global _engine, _SessionFactory
    if _engine is None:
        _engine = _make_engine(get_settings().database_url)
        _SessionFactory = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _SessionFactory is not None
    return _SessionFactory


def dispose_engine() -> None:
    """Tear down the cached engine (used by tests when they swap DATABASE_URL)."""
    global _engine, _SessionFactory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionFactory = None


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request, committed on success."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Transactional scope for scripts and background work."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def database_status() -> str:
    """``"ok"`` when a trivial query succeeds, else ``"unavailable"``.

    Never raises: health reporting must not depend on database health.
    """
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return "ok"
    except Exception:  # noqa: BLE001 - any driver/transport failure is "unavailable"
        return "unavailable"
