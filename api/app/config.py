"""Centralised, validated configuration for the LEGALX API (P0-01).

Every tunable comes from the environment with a safe default for development.
Production refuses to start with an unsafe configuration instead of silently
degrading (no wildcard CORS, no SQLite, secure cookies enforced).

No third-party settings library: the field set is small and the rules are
security-relevant enough that they should be visible in one file.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List, Optional


class ConfigError(RuntimeError):
    """Raised when the environment configuration is invalid."""


def _as_bool(value: Optional[str], default: bool) -> bool:
    if value is None or value.strip() == "":
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ConfigError(f"Expected a boolean value, got {value!r}")


def _as_int(value: Optional[str], default: int, name: str, minimum: int) -> int:
    if value is None or value.strip() == "":
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {value!r}") from exc
    if parsed < minimum:
        raise ConfigError(f"{name} must be >= {minimum}, got {parsed}")
    return parsed


@dataclass(frozen=True)
class Settings:
    """Immutable application settings resolved from the environment."""

    app_env: str = "dev"  # dev | test | production
    database_url: str = "sqlite:///./legalx.db"
    log_level: str = "INFO"

    session_cookie_name: str = "lx_session"
    session_ttl_hours: int = 12
    session_absolute_days: int = 7
    csrf_header_name: str = "X-CSRF-Token"

    cors_origins: List[str] = field(default_factory=list)

    demo_tamper_endpoint: bool = False  # N-05: off by default, off in production
    feature_ai_extraction: bool = False  # D-10: off by default

    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 900

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cookie_secure(self) -> bool:
        """Secure cookies are mandatory in production, optional elsewhere."""
        return self.is_production

    @property
    def session_ttl_seconds(self) -> int:
        return self.session_ttl_hours * 3600

    @property
    def session_absolute_seconds(self) -> int:
        return self.session_absolute_days * 86400


def load_settings(env: Optional[dict] = None) -> Settings:
    """Read settings from ``env`` (defaults to ``os.environ``) and validate them.

    Raises :class:`ConfigError` with an actionable message on invalid values.
    """
    source = os.environ if env is None else env

    app_env = (source.get("APP_ENV") or "dev").strip().lower()
    if app_env not in {"dev", "test", "production"}:
        raise ConfigError(f"APP_ENV must be one of dev|test|production, got {app_env!r}")

    database_url = (source.get("DATABASE_URL") or "sqlite:///./legalx.db").strip()
    scheme = database_url.split("://", 1)[0].lower()
    if app_env == "production":
        if not scheme.startswith("postgres"):
            raise ConfigError(
                "APP_ENV=production requires DATABASE_URL to be a postgresql:// URL; "
                f"got scheme {scheme!r}. SQLite is a development/test store only."
            )
    elif scheme not in {"sqlite", "postgresql", "postgres"}:
        raise ConfigError(f"Unsupported DATABASE_URL scheme: {scheme!r}")

    cors_raw = source.get("CORS_ORIGINS", "") or ""
    cors_origins = [o.strip() for o in cors_raw.split(",") if o.strip()]
    if "*" in cors_origins:
        raise ConfigError("CORS_ORIGINS may not contain the wildcard '*'.")
    if app_env == "production" and cors_origins:
        # Production serves the SPA from the same origin; cross-origin needs a decision.
        pass  # explicit allow-list is fine, wildcard already rejected

    demo_tamper = _as_bool(source.get("DEMO_TAMPER_ENDPOINT"), default=False)
    if app_env == "production" and demo_tamper:
        raise ConfigError(
            "DEMO_TAMPER_ENDPOINT must be false in production (decision N-05)."
        )

    log_level = (source.get("LOG_LEVEL") or "INFO").strip().upper()
    if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        raise ConfigError(f"LOG_LEVEL must be a standard level, got {log_level!r}")

    return Settings(
        app_env=app_env,
        database_url=database_url,
        log_level=log_level,
        session_ttl_hours=_as_int(source.get("SESSION_TTL_HOURS"), 12, "SESSION_TTL_HOURS", 1),
        session_absolute_days=_as_int(source.get("SESSION_ABSOLUTE_DAYS"), 7, "SESSION_ABSOLUTE_DAYS", 1),
        cors_origins=cors_origins,
        demo_tamper_endpoint=demo_tamper,
        feature_ai_extraction=_as_bool(source.get("FEATURE_AI_EXTRACTION"), default=False),
        login_rate_limit_attempts=_as_int(source.get("LOGIN_RATE_LIMIT_ATTEMPTS"), 5, "LOGIN_RATE_LIMIT_ATTEMPTS", 1),
        login_rate_limit_window_seconds=_as_int(source.get("LOGIN_RATE_LIMIT_WINDOW_SECONDS"), 900, "LOGIN_RATE_LIMIT_WINDOW_SECONDS", 1),
    )


_cached: Optional[Settings] = None


def get_settings() -> Settings:
    """Process-wide settings singleton (tests can call :func:`reset_settings`)."""
    global _cached
    if _cached is None:
        _cached = load_settings()
    return _cached


def reset_settings() -> None:
    """Drop the cached settings so the next call re-reads the environment."""
    global _cached
    _cached = None
