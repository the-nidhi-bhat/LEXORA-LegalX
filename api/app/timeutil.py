"""UTC helpers.

Convention for the whole backend: every stored datetime is **naive UTC**.
Wire responses append ``Z`` (API_CONTRACTS.md §1.4). Comparisons in SQL and
Python are then unambiguous regardless of the host timezone.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utcnow() -> datetime:
    """Current UTC time as a naive datetime."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utcnow_offset(seconds: int) -> datetime:
    """UTC now plus ``seconds`` as a naive datetime."""
    return utcnow() + timedelta(seconds=seconds)


def utcnow_aware() -> datetime:
    """Current UTC time as a timezone-aware datetime (``tzinfo=UTC``)."""
    return datetime.now(timezone.utc)


def to_wire(value: datetime) -> str:
    """Format a UTC datetime as ISO-8601 with exactly one trailing ``Z``.

    Aware datetimes are normalised to UTC first so an offset such as
    ``+00:00`` never leaks into the wire value alongside ``Z``.
    """
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.isoformat(timespec="seconds") + "Z"
