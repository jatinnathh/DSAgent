// lib/errors.ts — Custom error hierarchy for structured error handling

/**
 * Base application error. All custom errors extend this.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  /** Serialize to JSON-safe object for API responses */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

/**
 * 400 — Bad request / validation error
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

/**
 * 401 — Not authenticated
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED', true);
  }
}

/**
 * 403 — Authenticated but not allowed
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

/**
 * 404 — Resource not found
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource', id?: string) {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super(msg, 404, 'NOT_FOUND', true, { resource, id });
  }
}

/**
 * 409 — Conflict / duplicate
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, 'CONFLICT', true);
  }
}

/**
 * 429 — Rate limited
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super('Too many requests. Please try again later.', 429, 'RATE_LIMITED', true, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

/**
 * 502/503 — External service failure (Python backend, Elasticsearch, etc.)
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message?: string) {
    super(
      message || `External service '${service}' is unavailable`,
      503,
      'EXTERNAL_SERVICE_ERROR',
      true,
      { service }
    );
    this.service = service;
  }
}

/**
 * 500 — Internal / unexpected error (non-operational)
 */
export class InternalError extends AppError {
  constructor(message: string = 'An unexpected error occurred') {
    super(message, 500, 'INTERNAL_ERROR', false);
  }
}

// ============================================
// Error Response Builder
// ============================================

/**
 * Convert any error to a structured API error response
 */
export function toErrorResponse(error: unknown): { body: Record<string, unknown>; status: number } {
  if (error instanceof AppError) {
    return {
      body: error.toJSON(),
      status: error.statusCode,
    };
  }

  // Unknown errors — treat as 500
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return {
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : message,
        statusCode: 500,
      },
    },
    status: 500,
  };
}
