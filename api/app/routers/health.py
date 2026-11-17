"""Health endpoint (P0-01) — API_CONTRACTS.md §10.

Public, unauthenticated, no PII, no configuration values. ``status`` says the
process is serving; ``db`` says whether a trivial query succeeded.
"""

from __future__ import annotations

import subprocess
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter

from api.app.db import database_status

router = APIRouter(tags=["health"])

_REPO_ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def build_version() -> str:
    """8-character git SHA of HEAD at process start; ``"unknown"`` without git."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short=8", "HEAD"],
            cwd=_REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        sha = result.stdout.strip()
        if result.returncode == 0 and len(sha) >= 7:
            return sha[:8]
    except (OSError, subprocess.SubprocessError):
        pass
    return "unknown"


@router.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": build_version(),
        "db": database_status(),
    }
