// lib/repositories/pipelineRepository.ts — Data access layer for Pipeline model
import prisma from '../prisma';

export const pipelineRepository = {
  /** List user's pipelines */
  async findByUserId(userId: string) {
    return prisma.pipeline.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { runs: true } } },
    });
  },

  /** Get a single pipeline */
  async findById(pipelineId: string, userId: string) {
    return prisma.pipeline.findFirst({
      where: { id: pipelineId, userId },
      include: {
        runs: { orderBy: { startedAt: 'desc' }, take: 10 },
        reports: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
  },

  /** Create a new pipeline */
  async create(userId: string, name?: string, sessionId?: string, metadata?: unknown) {
    return prisma.pipeline.create({
      data: {
        name: name || 'New Pipeline',
        userId,
        sessionId: sessionId || null,
        metadata: metadata || undefined,
        steps: [],
        status: 'draft',
      },
    });
  },

  /** Update pipeline status */
  async updateStatus(pipelineId: string, status: string) {
    return prisma.pipeline.update({
      where: { id: pipelineId },
      data: { status },
    });
  },

  /** Delete a pipeline */
  async delete(pipelineId: string, userId: string) {
    return prisma.pipeline.deleteMany({
      where: { id: pipelineId, userId },
    });
  },

  /** Count total pipelines (admin) */
  async count() {
    return prisma.pipeline.count();
  },

  /** Count active pipeline runs */
  async countActiveRuns() {
    return prisma.pipelineRun.count({
      where: { status: 'running' },
    });
  },
};
