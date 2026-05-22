// lib/repositories/userRepository.ts — Data access layer for User model
import prisma from '../prisma';

export const userRepository = {
  /** Find user by Clerk ID */
  async findByClerkId(clerkId: string) {
    return prisma.user.findUnique({ where: { clerkId } });
  },

  /** Find user by email */
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  /** Upsert user (create or update on login) */
  async upsert(clerkId: string, email: string) {
    return prisma.user.upsert({
      where: { clerkId },
      update: {
        email,
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
      create: {
        clerkId,
        email,
        role: email === 'jatinnath1111@gmail.com' ? 'admin' : 'user',
        lastLoginAt: new Date(),
        loginCount: 1,
      },
    });
  },

  /** Get all users with counts (admin) */
  async findAllWithCounts(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { lastLoginAt: 'desc' },
        include: {
          _count: {
            select: { chats: true, pipelines: true, reports: true, auditLogs: true },
          },
        },
      }),
      prisma.user.count(),
    ]);
    return { users, total, page, limit, pages: Math.ceil(total / limit) };
  },

  /** Get user activity details (admin) */
  async getUserActivity(clerkId: string) {
    const [user, recentAudit, chats, pipelines, reports] = await Promise.all([
      prisma.user.findUnique({ where: { clerkId } }),
      prisma.auditLog.findMany({
        where: { userId: clerkId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.chat.findMany({
        where: { userId: clerkId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: { _count: { select: { messages: true } } },
      }),
      prisma.pipeline.findMany({
        where: { userId: clerkId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: { _count: { select: { runs: true } } },
      }),
      prisma.report.findMany({
        where: { userId: clerkId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return { user, recentAudit, chats, pipelines, reports };
  },

  /** Count active users in last N hours */
  async countActiveUsers(hoursAgo: number = 24) {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    return prisma.user.count({
      where: { lastLoginAt: { gte: since } },
    });
  },

  /** Count new users this week */
  async countNewUsersThisWeek() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return prisma.user.count({
      where: { createdAt: { gte: weekAgo } },
    });
  },

  /** Get total user count */
  async count() {
    return prisma.user.count();
  },
};
