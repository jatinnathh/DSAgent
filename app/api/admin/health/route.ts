// app/api/admin/health/route.ts — System health checks
import { createApiHandler } from '@/lib/api-handler';
import { adminService } from '@/lib/services/adminService';

export const GET = createApiHandler(
  async () => {
    const health = await adminService.getSystemHealth();
    return health;
  },
  { requireAdmin: true, action: 'admin.health', resource: 'admin/health' }
);
