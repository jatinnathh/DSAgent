// app/api/admin/stats/route.ts — Admin KPI dashboard stats
import { createApiHandler } from '@/lib/api-handler';
import { adminService } from '@/lib/services/adminService';

export const GET = createApiHandler(
  async () => {
    const stats = await adminService.getDashboardStats();
    return stats;
  },
  { requireAdmin: true, action: 'admin.stats', resource: 'admin' }
);
