// lib/repositories/reportRepository.ts — Data access layer for Report model
import prisma from '../prisma';

export const reportRepository = {
  /** List user's reports */
  async findByUserId(userId: string) {
    return prisma.report.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { pipeline: { select: { id: true, name: true } } },
    });
  },

  /** Get a single report */
  async findById(reportId: string, userId: string) {
    return prisma.report.findFirst({
      where: { id: reportId, userId },
      include: { pipeline: { select: { id: true, name: true } } },
    });
  },

  /** Create a new report */
  async create(data: {
    userId: string;
    pipelineId?: string;
    title: string;
    description?: string;
    filePath: string;
    fileSize?: number;
    sessionId?: string;
    metadata?: unknown;
  }) {
    return prisma.report.create({
      data: {
        ...data,
        metadata: data.metadata || undefined,
      },
    });
  },

  /** Mark report as emailed */
  async markEmailed(reportId: string) {
    return prisma.report.update({
      where: { id: reportId },
      data: { emailSent: true, emailSentAt: new Date() },
    });
  },

  /** Count total reports (admin) */
  async count() {
    return prisma.report.count();
  },
};
