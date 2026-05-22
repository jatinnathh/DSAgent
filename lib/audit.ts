// lib/audit.ts — Audit logging service
// Writes user actions to AuditLog table asynchronously with batching
import prisma from './prisma';
import logger from './logger';

export interface AuditEntry {
  userId?: string;
  userEmail?: string;
  action: string;
  resource?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  ip?: string;
  userAgent?: string;
  requestBody?: Record<string, unknown>;
  responsePreview?: string;
  errorMessage?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Audit Buffer — batch writes for performance
// ============================================

const FLUSH_INTERVAL_MS = 5_000; // Flush every 5 seconds
const MAX_BUFFER_SIZE = 50; // Or when buffer hits 50 entries
let auditBuffer: AuditEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Start the background flush timer */
function ensureFlushTimer() {
  if (flushTimer) return;
  if (typeof window !== 'undefined') return; // Skip on client side

  flushTimer = setInterval(() => {
    flushAuditBuffer().catch((err) => {
      logger.error('Audit flush failed', { error: err.message });
    });
  }, FLUSH_INTERVAL_MS);

  // Don't block process exit
  if (flushTimer && typeof flushTimer === 'object' && 'unref' in flushTimer) {
    flushTimer.unref();
  }
}

/** Flush buffered audit entries to database */
export async function flushAuditBuffer(): Promise<number> {
  if (auditBuffer.length === 0) return 0;

  const entries = [...auditBuffer];
  auditBuffer = [];

  try {
    // Sanitize all entries before inserting
    const sanitized = entries.map((entry) => ({
      userId: entry.userId || null,
      userEmail: entry.userEmail || null,
      action: entry.action,
      resource: entry.resource || null,
      method: entry.method || null,
      path: entry.path || null,
      statusCode: entry.statusCode || null,
      duration: entry.duration || null,
      ip: entry.ip || null,
      userAgent: entry.userAgent ? entry.userAgent.substring(0, 500) : null,
      requestBody: entry.requestBody ? JSON.parse(JSON.stringify(sanitizeBody(entry.requestBody))) : undefined,
      responsePreview: entry.responsePreview ? entry.responsePreview.substring(0, 500) : null,
      errorMessage: entry.errorMessage ? entry.errorMessage.substring(0, 1000) : null,
      requestId: entry.requestId || null,
      metadata: entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) : undefined,
    }));

    await prisma.auditLog.createMany({ data: sanitized });

    logger.debug(`Flushed ${entries.length} audit entries to database`);
    return entries.length;
  } catch (error) {
    // Put entries back if flush failed
    auditBuffer.unshift(...entries);
    logger.error('Failed to flush audit entries', {
      error: error instanceof Error ? error.message : String(error),
      entryCount: entries.length,
    });
    return 0;
  }
}

// ============================================
// Public API
// ============================================

/**
 * Record an audit event. Non-blocking — adds to buffer.
 */
export function recordAudit(entry: AuditEntry): void {
  auditBuffer.push({ ...entry, metadata: { ...entry.metadata, timestamp: new Date().toISOString() } });
  ensureFlushTimer();

  // Flush immediately if buffer is full
  if (auditBuffer.length >= MAX_BUFFER_SIZE) {
    flushAuditBuffer().catch((err) => {
      logger.error('Urgent audit flush failed', { error: err.message });
    });
  }
}

/**
 * Record a user login
 */
export function recordLogin(userId: string, email: string, ip?: string, userAgent?: string): void {
  recordAudit({
    userId,
    userEmail: email,
    action: 'auth.login',
    ip,
    userAgent,
    metadata: { event: 'login' },
  });

  // Also update user's login tracking (fire and forget)
  prisma.user
    .update({
      where: { clerkId: userId },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    })
    .catch(() => { /* ignore — user might not exist yet */ });
}

/**
 * Record a page view
 */
export function recordPageView(userId: string, email: string, path: string, ip?: string): void {
  recordAudit({
    userId,
    userEmail: email,
    action: 'page.view',
    path,
    ip,
  });
}

/**
 * Record a system event
 */
export async function recordSystemEvent(
  type: string,
  message: string,
  severity: string = 'info',
  source: string = 'next',
  metadata?: Record<string, unknown>,
  stackTrace?: string
): Promise<void> {
  try {
    await prisma.systemEvent.create({
      data: { type, message, severity, source, metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined, stackTrace },
    });
  } catch (error) {
    logger.error('Failed to record system event', { type, message, error: String(error) });
  }
}

// ============================================
// Sanitize
// ============================================

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'apikey', 'api_key', 'authorization', 'cookie', 'credit_card', 'ssn'];

function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeBody(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ============================================
// Graceful shutdown support
// ============================================

export async function shutdownAudit(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushAuditBuffer();
  logger.info('Audit system shut down — all entries flushed');
}
