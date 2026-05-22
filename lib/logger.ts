// lib/logger.ts — Structured logging with Winston
import { createLogger, format, transports, Logger } from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (typeof window === 'undefined') {
  try { fs.mkdirSync(logsDir, { recursive: true }); } catch { /* ignore */ }
}

// ============================================
// Custom Formats
// ============================================

const timestampFormat = format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' });

const requestContextFormat = format((info) => {
  if (info.requestId) {
    info.message = `[${info.requestId}] ${info.message}`;
  }
  return info;
});

// JSON format for production / file output
const jsonFormat = format.combine(
  timestampFormat,
  format.errors({ stack: true }),
  format.json()
);

// Colorized console format for development
const devFormat = format.combine(
  timestampFormat,
  requestContextFormat(),
  format.colorize({ all: true }),
  format.printf(({ timestamp, level, message, requestId, userId, path: reqPath, method, duration, ...rest }) => {
    let line = `${timestamp} ${level}: ${message}`;
    if (userId) line += ` [user:${userId}]`;
    if (method && reqPath) line += ` ${method} ${reqPath}`;
    if (duration !== undefined) line += ` (${duration}ms)`;
    const extra = Object.keys(rest).filter(k => !['timestamp', 'level', 'service', 'splat'].includes(k));
    if (extra.length > 0) {
      const extraObj: Record<string, unknown> = {};
      extra.forEach(k => { extraObj[k] = rest[k]; });
      line += ` ${JSON.stringify(extraObj)}`;
    }
    return line;
  })
);

// ============================================
// Logger Instance
// ============================================

const isDev = process.env.NODE_ENV !== 'production';

const logger: Logger = createLogger({
  level: isDev ? 'debug' : 'info',
  defaultMeta: { service: 'dsagent-next' },
  transports: [
    // Console transport
    new transports.Console({
      format: isDev ? devFormat : jsonFormat,
    }),
    // File transport — all logs
    ...(typeof window === 'undefined'
      ? [
          new transports.File({
            filename: path.join(logsDir, 'combined.log'),
            format: jsonFormat,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 30,
          }),
          // File transport — errors only
          new transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: jsonFormat,
            maxsize: 10 * 1024 * 1024,
            maxFiles: 30,
          }),
          // File transport — audit logs
          new transports.File({
            filename: path.join(logsDir, 'audit.log'),
            level: 'info',
            format: jsonFormat,
            maxsize: 10 * 1024 * 1024,
            maxFiles: 90,
          }),
        ]
      : []),
  ],
});

// ============================================
// Helper Functions
// ============================================

export interface RequestContext {
  requestId: string;
  userId?: string;
  userEmail?: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
}

/** Log an API request start */
export function logRequest(ctx: RequestContext, body?: Record<string, unknown>) {
  logger.info('API request started', {
    ...ctx,
    body: sanitizeBody(body),
  });
}

/** Log an API response */
export function logResponse(ctx: RequestContext, statusCode: number, duration: number, error?: string) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, `API response ${statusCode}`, {
    ...ctx,
    statusCode,
    duration,
    error,
  });
}

/** Log an audit event */
export function logAudit(action: string, ctx: Partial<RequestContext>, meta?: Record<string, unknown>) {
  logger.info(`AUDIT: ${action}`, {
    ...ctx,
    action,
    ...meta,
  });
}

/** Log a system event */
export function logSystem(type: string, message: string, meta?: Record<string, unknown>) {
  logger.info(`SYSTEM: ${message}`, {
    type,
    ...meta,
  });
}

/** Sanitize request body — remove sensitive fields */
function sanitizeBody(body?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!body) return undefined;
  const sanitized = { ...body };
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization', 'cookie', 'credit_card'];
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

/** Generate a unique request ID */
export function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `req_${ts}_${rand}`;
}

export default logger;
