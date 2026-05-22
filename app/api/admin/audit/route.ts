// app/api/admin/audit/route.ts — Admin audit log explorer
import { createApiHandler } from '@/lib/api-handler';
import { adminService } from '@/lib/services/adminService';

export const GET = createApiHandler(
  async (req) => {
    const url = new URL(req.url);
    const filters = {
      userId: url.searchParams.get('userId') || undefined,
      action: url.searchParams.get('action') || undefined,
      method: url.searchParams.get('method') || undefined,
      statusCode: url.searchParams.get('statusCode') ? parseInt(url.searchParams.get('statusCode')!) : undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      search: url.searchParams.get('search') || undefined,
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '50'),
    };

    const result = await adminService.getAuditLogs(filters);
    return result;
  },
  { requireAdmin: true, action: 'admin.audit.query', resource: 'admin/audit' }
);
