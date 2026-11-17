"""FastAPI application factory for the LEGALX API (P0-01).

Responsibilities:
- request-id propagation (``X-Request-Id``) and structured access logging
- one error envelope for every failure path (API_CONTRACTS.md §1.5)
- CORS only when explicitly configured — never a wildcard (§1.1)
- router registration (health now; auth/agreements/... as they land)

Run with:  uvicorn api.app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.app.config import get_settings
from api.app.errors import ApiError, error_body
from api.app.routers import health

logger = logging.getLogger("legalx.api")

_STATUS_CODE_MAP = {
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_FAILED",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "INTEGRATION_UNAVAILABLE",
}

_DETAIL_CODE_MAP = {
    "missing": "REQUIRED",
    "string_type": "TYPE_MISMATCH",
    "int_type": "TYPE_MISMATCH",
    "bool_type": "TYPE_MISMATCH",
    "float_type": "TYPE_MISMATCH",
    "greater_than": "VALUE_ERROR",
    "less_than_equal": "VALUE_ERROR",
    "value_error": "VALUE_ERROR",
    "datetime_from_date_parsing": "VALUE_ERROR",
    "string_pattern_mismatch": "VALUE_ERROR",
}


def _validation_details(exc: RequestValidationError) -> list[dict]:
    details: list[dict] = []
    for error in exc.errors():
        # ("body", "milestones", 2, "amount_minor") → "milestones[2].amount_minor"
        parts: list[str] = []
        for part in error.get("loc", ()):
            if part == "body" or part is None:
                continue
            text = str(part)
            if text.isdigit() and parts:
                parts[-1] = f"{parts[-1]}[{text}]"
            else:
                parts.append(text)
        field = ".".join(parts) or "(body)"
        error_type = error.get("type", "value_error")
        code = _DETAIL_CODE_MAP.get(error_type, "VALIDATION_ERROR")
        details.append({"field": field, "code": code, "message": error.get("msg", "Invalid value")})
    return details


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns every request an id, echoes it, and logs method/path/status/latency."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if incoming else str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - started) * 1000
            logger.exception(
                "request_id=%s method=%s path=%s status=500 duration_ms=%.1f",
                request_id, request.method, request.url.path, duration_ms,
            )
            raise
        duration_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-Id"] = request_id
        logger.info(
            "request_id=%s method=%s path=%s status=%s duration_ms=%.1f",
            request_id, request.method, request.url.path, response.status_code, duration_ms,
        )
        return response


def create_app() -> FastAPI:
    settings = get_settings()

    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    app = FastAPI(
        title="LEGALX API",
        version="1.0.0",
        description=(
            "Server-side sessions, agreements, versioning and the execution gate. "
            "Every protected route re-checks authentication and authorization; "
            "client-supplied roles, user ids or workspace ids are never trusted."
        ),
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(RequestContextMiddleware)

    # CORS: only when explicitly configured with concrete origins (§1.1).
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", settings.csrf_header_name],
        )

    def _request_id(request: Request) -> str:
        return getattr(request.state, "request_id", str(uuid.uuid4()))

    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, _request_id(request), exc.details),
            headers=exc.headers or None,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_body(
                "VALIDATION_FAILED",
                "The request body failed validation.",
                _request_id(request),
                _validation_details(exc),
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODE_MAP.get(exc.status_code, "ERROR")
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(code, detail, _request_id(request)),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Never leak stack traces or SQL to a client.
        logger.exception("request_id=%s unhandled error", _request_id(request))
        return JSONResponse(
            status_code=500,
            content=error_body("INTERNAL_ERROR", "An unexpected error occurred.", _request_id(request)),
        )

    app.include_router(health.router)

    # P0-03: authentication and identity endpoints.
    from api.app.routers import auth as auth_router

    app.include_router(auth_router.router)

    # P0-04: agreements, parties, milestones.
    from api.app.routers import agreements as agreements_router

    app.include_router(agreements_router.router)

    # P0-05: versions, canonical hashes, approvals.
    from api.app.routers import versions as versions_router

    app.include_router(versions_router.router)

    # P0-09: activity endpoint.
    from api.app.routers import activity as activity_router

    app.include_router(activity_router.router)

    # P0-08: execution gate and verification.
    from api.app.routers import execution as execution_router

    app.include_router(execution_router.router)

    return app


app = create_app()
