"""Single error envelope for every API failure (API_CONTRACTS.md §1.5–§1.6).

All handlers in ``main.py`` funnel through :func:`error_body` so the wire
format is identical no matter which layer raised the error:

    {"error": {"code", "message", "details": [{field, code, message}], "request_id"}}
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class ApiError(Exception):
    """Application error carrying an HTTP status, a contract error code and details."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[List[Dict[str, Any]]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []
        self.headers = headers or {}

    # Convenience constructors for the codes used across P0-03…P0-08.
    @classmethod
    def unauthenticated(cls, message: str = "Sign in to continue.") -> "ApiError":
        return cls(401, "UNAUTHENTICATED", message)

    @classmethod
    def invalid_credentials(cls) -> "ApiError":
        return cls(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")

    @classmethod
    def csrf_failed(cls, message: str = "Missing or invalid CSRF token.") -> "ApiError":
        return cls(403, "CSRF_FAILED", message)

    @classmethod
    def forbidden(cls, message: str = "You do not have permission to perform this action.") -> "ApiError":
        return cls(403, "FORBIDDEN", message)

    @classmethod
    def not_found(cls, message: str = "Not found.") -> "ApiError":
        return cls(404, "NOT_FOUND", message)

    @classmethod
    def conflict(cls, code: str, message: str, details: Optional[List[Dict[str, Any]]] = None) -> "ApiError":
        return cls(409, code, message, details)

    @classmethod
    def validation(cls, message: str, details: Optional[List[Dict[str, Any]]] = None) -> "ApiError":
        return cls(422, "VALIDATION_FAILED", message, details)


def field_detail(field: str, code: str, message: str) -> Dict[str, Any]:
    return {"field": field, "code": code, "message": message}


def error_body(
    code: str,
    message: str,
    request_id: str,
    details: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
            "request_id": request_id,
        }
    }
