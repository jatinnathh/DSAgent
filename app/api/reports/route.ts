// Refactored: app/api/reports/route.ts — Using service layer + api handler wrapper
import { createApiHandler } from '@/lib/api-handler';
import { reportService } from '@/lib/services/reportService';

// GET /api/reports — list user's reports
export const GET = createApiHandler(
  async (_req, ctx) => {
    const reports = await reportService.listReports(ctx.userId);
    return { reports };
  },
  { action: 'reports.list', resource: 'reports' }
);
