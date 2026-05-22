// lib/repositories/auditRepository.ts — Data access layer for AuditLog & SystemEvent
import prisma from '../prisma';

export interface AuditQueryFilters {
  userId?: string;
  action?: string;
  method?: string;
  statusCode?: number;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  page?: number;
  limit?: number;
}

export const auditRepository = {
  /** Query audit logs with filters and pagination */
  async query(filters: AuditQueryFilters = {}) {
    const { userId, action, method, statusCode, startDate, endDate, search, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (method) where.method = method;
    if (statusCode) where.statusCode = statusCode;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { path: { contains: search, mode: 'insensitive' } },
        { userEmail: { contains: search, mode: 'insensitive' } },
        { errorMessage: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: where as any }),
    ]);

    return { logs, total, page, limit, pages: Math.ceil(total / limit) };
  },

  /** Get recent activity feed (admin dashboard) */
  async getRecentActivity(limit: number = 30) {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /** Count audit logs in last N hours */
  async countRecent(hoursAgo: number = 24) {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    return prisma.auditLog.count({
      where: { createdAt: { gte: since } },
    });
  },

  /** Count errors in last N hours */
  async countErrors(hoursAgo: number = 24) {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    return prisma.auditLog.count({
      where: {
        createdAt: { gte: since },
        statusCode: { gte: 500 },
      },
    });
  },

  /** Get top endpoints by usage */
  async getTopEndpoints(hoursAgo: number = 24, limit: number = 10) {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const result = await prisma.auditLog.groupBy({
      by: ['path'],
      where: { createdAt: { gte: since }, path: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });
    return result.map((r) => ({ path: r.path, count: r._count.id }));
  },

  /** Get top users by activity */
  async getTopUsers(hoursAgo: number = 24, limit: number = 10) {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const result = await prisma.auditLog.groupBy({
      by: ['userId', 'userEmail'],
      where: { createdAt: { gte: since }, userId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });
    return result.map((r) => ({ userId: r.userId, email: r.userEmail, count: r._count.id }));
  },

  /** Get request counts grouped by hour (for chart) */
  async getHourlyStats(hoursAgo: number = 24) {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const logs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, statusCode: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by hour
    const hourlyMap: Record<string, { total: number; errors: number }> = {};
    logs.forEach((log) => {
      const hourKey = log.createdAt.toISOString().substring(0, 13); // "2026-05-22T14"
      if (!hourlyMap[hourKey]) hourlyMap[hourKey] = { total: 0, errors: 0 };
      hourlyMap[hourKey].total++;
      if (log.statusCode && log.statusCode >= 500) hourlyMap[hourKey].errors++;
    });

    return Object.entries(hourlyMap).map(([hour, stats]) => ({
      hour,
      total: stats.total,
      errors: stats.errors,
    }));
  },

  /** Get system events */
  async getSystemEvents(limit: number = 50) {
    return prisma.systemEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /** Count total audit entries */
  async count() {
    return prisma.auditLog.count();
  },
};
