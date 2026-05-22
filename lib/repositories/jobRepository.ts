// lib/repositories/jobRepository.ts — Data access layer for BackgroundJob model
import prisma from '../prisma';

export const jobRepository = {
  /** Create a new background job */
  async create(data: {
    type: string;
    payload?: unknown;
    priority?: number;
    maxAttempts?: number;
    createdBy?: string;
  }) {
    return prisma.backgroundJob.create({
      data: {
        type: data.type,
        payload: data.payload || undefined,
        priority: data.priority || 0,
        maxAttempts: data.maxAttempts || 3,
        createdBy: data.createdBy || null,
        status: 'pending',
      },
    });
  },

  /** Update job status */
  async updateStatus(jobId: string, status: string, data?: { result?: unknown; error?: string }) {
    return prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status,
        ...(status === 'running' ? { startedAt: new Date() } : {}),
        ...(status === 'completed' || status === 'failed' ? { completedAt: new Date() } : {}),
        ...(data?.result ? { result: data.result as any } : {}),
        ...(data?.error ? { error: data.error } : {}),
      },
    });
  },

  /** Increment attempt count */
  async incrementAttempts(jobId: string) {
    return prisma.backgroundJob.update({
      where: { id: jobId },
      data: { attempts: { increment: 1 } },
    });
  },

  /** Get pending jobs (for worker polling) */
  async findPending(limit: number = 10) {
    return prisma.backgroundJob.findMany({
      where: { status: 'pending' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    });
  },

  /** Get all jobs with filters (admin) */
  async findAll(filters: { status?: string; type?: string; page?: number; limit?: number } = {}) {
    const { status, type, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [jobs, total] = await Promise.all([
      prisma.backgroundJob.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.backgroundJob.count({ where: where as any }),
    ]);

    return { jobs, total, page, limit, pages: Math.ceil(total / limit) };
  },

  /** Count jobs by status */
  async countByStatus() {
    const statuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
    const counts: Record<string, number> = {};

    await Promise.all(
      statuses.map(async (status) => {
        counts[status] = await prisma.backgroundJob.count({ where: { status } });
      })
    );

    return counts;
  },

  /** Cancel a job */
  async cancel(jobId: string) {
    return prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: 'cancelled', completedAt: new Date() },
    });
  },

  /** Retry a failed job */
  async retry(jobId: string) {
    return prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: 'pending', error: null, completedAt: null },
    });
  },
};
