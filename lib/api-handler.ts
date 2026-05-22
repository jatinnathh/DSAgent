// lib/api-handler.ts — Wrapper for API route handlers
// Provides automatic auth, audit logging, error handling, timing, and admin protection
import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { generateRequestId, logRequest, logResponse } from './logger';
import { recordAudit } from './audit';
import { AppError, toErrorResponse, UnauthorizedError, ForbiddenError } from './errors';
import logger from './logger';

const ADMIN_EMAIL = 'jatinnath1111@gmail.com';

export interface HandlerContext {
  userId: string;
  userEmail: string;
  requestId: string;
  isAdmin: boolean;
  ip: string;
  userAgent: string;
}

type RouteHandler = (
  req: NextRequest,
  ctx: HandlerContext,
  params?: Record<string, string>
) => Promise<NextResponse | Record<string, unknown>>;

interface ApiHandlerOptions {
  /** Require authentication (default: true) */
  requireAuth?: boolean;
  /** Require admin access (default: false) */
  requireAdmin?: boolean;
  /** Action name for audit log */
  action?: string;
  /** Resource name for audit log */
  resource?: string;
}

/**
 * Wrap an API route handler with automatic:
 * - Authentication check
 * - Admin access check
 * - Request ID generation
 * - Timing
 * - Audit logging
 * - Structured error handling
 */
export function createApiHandler(handler: RouteHandler, options: ApiHandlerOptions = {}) {
  const { requireAuth = true, requireAdmin = false, action, resource } = options;

  return async (req: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const method = req.method;
    const path = req.nextUrl.pathname;

    let userId = '';
    let userEmail = '';
    let isAdmin = false;

    try {
      // Auth check
      if (requireAuth || requireAdmin) {
        const authResult = await auth();
        userId = authResult.userId || '';

        if (!userId) {
          throw new UnauthorizedError('Authentication required');
        }

        // Get user email for admin check and audit
        const user = await currentUser();
        userEmail = user?.emailAddresses?.[0]?.emailAddress || '';
        isAdmin = userEmail === ADMIN_EMAIL;

        // Admin check
        if (requireAdmin && !isAdmin) {
          throw new ForbiddenError('Admin access required');
        }
      }

      // Log request
      logRequest({ requestId, userId, userEmail, method, path, ip, userAgent });

      // Resolve params if they exist (Next.js 15 async params)
      const resolvedParams = context?.params ? await context.params : undefined;

      // Execute handler
      const ctx: HandlerContext = { userId, userEmail, requestId, isAdmin, ip, userAgent };
      const result = await handler(req, ctx, resolvedParams);

      const duration = Date.now() - startTime;

      // Build response
      let response: NextResponse;
      if (result instanceof NextResponse) {
        response = result;
      } else {
        response = NextResponse.json(result);
      }

      // Add standard headers
      response.headers.set('X-Request-Id', requestId);
      response.headers.set('X-Response-Time', `${duration}ms`);

      // Log response
      logResponse({ requestId, userId, userEmail, method, path }, response.status, duration);

      // Audit log (non-blocking)
      recordAudit({
        userId: userId || undefined,
        userEmail: userEmail || undefined,
        action: action || `api.${method?.toLowerCase()}.${path}`,
        resource,
        method,
        path,
        statusCode: response.status,
        duration,
        ip,
        userAgent,
        requestId,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const { body, status } = toErrorResponse(error);

      // Log error
      logResponse(
        { requestId, userId, userEmail, method, path },
        status,
        duration,
        error instanceof Error ? error.message : String(error)
      );

      // Audit log error (non-blocking)
      recordAudit({
        userId: userId || undefined,
        userEmail: userEmail || undefined,
        action: action || `api.${method?.toLowerCase()}.${path}`,
        resource,
        method,
        path,
        statusCode: status,
        duration,
        ip,
        userAgent,
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      // Log unexpected errors
      if (!(error instanceof AppError) || !error.isOperational) {
        logger.error('Unhandled error in API handler', {
          requestId,
          error: error instanceof Error ? error.stack : String(error),
          path,
          method,
        });
      }

      const response = NextResponse.json(body, { status });
      response.headers.set('X-Request-Id', requestId);
      response.headers.set('X-Response-Time', `${duration}ms`);
      return response;
    }
  };
}

/**
 * Helper to check if a user is admin by email
 */
export function isAdminEmail(email: string): boolean {
  return email === ADMIN_EMAIL;
}

export { ADMIN_EMAIL };
