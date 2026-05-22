// app/api/admin/search/route.ts — Full-text search across audit logs
import { createApiHandler } from '@/lib/api-handler';
import { adminService } from '@/lib/services/adminService';

export const GET = createApiHandler(
  async (req) => {
    const url = new URL(req.url);
    const query = url.searchParams.get('q') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!query) {
      return { logs: [], total: 0, page, limit, pages: 0 };
    }

    // Use database-backed search (Elasticsearch integration can be added later)
    const result = await adminService.getAuditLogs({
      search: query,
      page,
      limit,
    });

    return result;
  },
  { requireAdmin: true, action: 'admin.search', resource: 'admin/search' }
);
