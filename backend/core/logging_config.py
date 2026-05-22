# backend/core/logging_config.py — Structured logging with structlog
import logging
import sys
import os
import json
from datetime import datetime
from pathlib import Path

# ============================================
# Log Directory
# ============================================

LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

# ============================================
# JSON Formatter
# ============================================

class JSONFormatter(logging.Formatter):
    """JSON structured log formatter."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add extra fields
        for key in ["request_id", "user_id", "method", "path", "status_code",
                     "duration_ms", "ip", "user_agent", "session_id", "error"]:
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)

        # Add exception info
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = {
                "type": type(record.exc_info[1]).__name__,
                "message": str(record.exc_info[1]),
                "traceback": self.formatException(record.exc_info),
            }

        return json.dumps(log_entry, default=str)


# ============================================
# Console Formatter (for dev)
# ============================================

class ColorFormatter(logging.Formatter):
    """Colorized console formatter for development."""

    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]

        parts = [f"{color}{timestamp} {record.levelname:8s}{self.RESET} {record.getMessage()}"]

        # Add context
        for key in ["request_id", "method", "path", "status_code", "duration_ms"]:
            if hasattr(record, key):
                parts.append(f"{key}={getattr(record, key)}")

        return " | ".join(parts)


# ============================================
# Setup
# ============================================

def setup_logging(log_level: str = "INFO") -> logging.Logger:
    """Configure structured logging for the FastAPI backend."""
    is_prod = os.getenv("ENVIRONMENT", "development") == "production"
    root_logger = logging.getLogger("dsagent")
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove existing handlers
    root_logger.handlers.clear()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(JSONFormatter() if is_prod else ColorFormatter())
    root_logger.addHandler(console_handler)

    # File handler — all logs
    file_handler = logging.FileHandler(LOG_DIR / "backend.log", encoding="utf-8")
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(file_handler)

    # File handler — errors only
    error_handler = logging.FileHandler(LOG_DIR / "backend_error.log", encoding="utf-8")
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(error_handler)

    # File handler — audit trail
    audit_handler = logging.FileHandler(LOG_DIR / "backend_audit.log", encoding="utf-8")
    audit_handler.setLevel(logging.INFO)
    audit_handler.setFormatter(JSONFormatter())
    audit_logger = logging.getLogger("dsagent.audit")
    audit_logger.addHandler(audit_handler)

    # Suppress noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    root_logger.info("Logging initialized", extra={"log_level": log_level, "is_prod": is_prod})
    return root_logger


def get_logger(name: str = "dsagent") -> logging.Logger:
    """Get a named logger."""
    return logging.getLogger(f"dsagent.{name}")


def get_audit_logger() -> logging.Logger:
    """Get the audit logger."""
    return logging.getLogger("dsagent.audit")
