// lib/services/reportService.ts — Business logic for Report operations
import { reportRepository } from '../repositories/reportRepository';
import logger from '../logger';

export const reportService = {
  /** List user's reports */
  async listReports(userId: string) {
    return reportRepository.findByUserId(userId);
  },

  /** Get a single report */
  async getReport(reportId: string, userId: string) {
    return reportRepository.findById(reportId, userId);
  },

  /** Create a new report */
  async createReport(data: {
    userId: string;
    pipelineId?: string;
    title: string;
    description?: string;
    filePath: string;
    fileSize?: number;
    sessionId?: string;
    metadata?: unknown;
  }) {
    const report = await reportRepository.create(data);
    logger.info('Report created', { userId: data.userId, reportId: report.id });
    return report;
  },

  /** Mark report as emailed */
  async markEmailed(reportId: string) {
    return reportRepository.markEmailed(reportId);
  },
};
