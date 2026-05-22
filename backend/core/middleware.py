# backend/core/middleware.py — Custom middleware stack for FastAPI
import time
import uuid
import asyncio
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from core.logging_config import get_logger, get_audit_logger

logger = get_logger("middleware")
audit_logger = get_audit_logger()


# ============================================
# Request ID Middleware
# ============================================

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Inject a unique request ID into every request/response."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-Id") or f"req_{uuid.uuid4().hex[:12]}"
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


# ============================================
# Timing Middleware
# ============================================

class TimingMiddleware(BaseHTTPMiddleware):
    """Measure and log request duration."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        response.headers["X-Response-Time"] = f"{duration_ms}ms"

        request_id = getattr(request.state, "request_id", "unknown")

        logger.info(
            f"{request.method} {request.url.path} → {response.status_code} ({duration_ms}ms)",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": str(request.url.path),
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )

        return response


# ============================================
# Concurrency Limit Middleware
# ============================================

class ConcurrencyLimitMiddleware(BaseHTTPMiddleware):
    """Limit the number of concurrent requests to prevent overload."""

    def __init__(self, app, max_concurrent: int = 50):
        super().__init__(app)
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.max_concurrent = max_concurrent

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip health checks
        if request.url.path in ("/health", "/"):
            return await call_next(request)

        if self.semaphore.locked():
            logger.warning(
                f"Concurrency limit reached ({self.max_concurrent})",
                extra={"path": str(request.url.path)},
            )
            return JSONResponse(
                {"error": "Server is overloaded. Please try again later."},
                status_code=503,
            )

        async with self.semaphore:
            return await call_next(request)


# ============================================
# Request Timeout Middleware
# ============================================

class TimeoutMiddleware(BaseHTTPMiddleware):
    """Apply a timeout to all requests."""

    def __init__(self, app, timeout_seconds: float = 120):
        super().__init__(app)
        self.timeout = timeout_seconds

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            return await asyncio.wait_for(call_next(request), timeout=self.timeout)
        except asyncio.TimeoutError:
            request_id = getattr(request.state, "request_id", "unknown")
            logger.error(
                f"Request timed out after {self.timeout}s",
                extra={
                    "request_id": request_id,
                    "path": str(request.url.path),
                    "method": request.method,
                },
            )
            return JSONResponse(
                {"error": f"Request timed out after {self.timeout} seconds"},
                status_code=504,
            )


# ============================================
# Audit Middleware
# ============================================

class AuditMiddleware(BaseHTTPMiddleware):
    """Log every request to the audit trail."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()

        # Extract client info
        ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
        user_agent = request.headers.get("user-agent", "unknown")
        request_id = getattr(request.state, "request_id", "unknown")

        response = await call_next(request)

        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        # Log to audit logger
        audit_logger.info(
            f"API {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": str(request.url.path),
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "ip": ip,
                "user_agent": user_agent[:200] if user_agent else "",
            },
        )

        return response


# ============================================
# Error Handler Middleware
# ============================================

class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Catch unhandled exceptions and return structured JSON errors."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            request_id = getattr(request.state, "request_id", "unknown")
            logger.error(
                f"Unhandled error: {type(exc).__name__}: {exc}",
                exc_info=True,
                extra={
                    "request_id": request_id,
                    "path": str(request.url.path),
                    "method": request.method,
                },
            )
            return JSONResponse(
                {
                    "error": "Internal server error",
                    "request_id": request_id,
                    "type": type(exc).__name__,
                },
                status_code=500,
            )
