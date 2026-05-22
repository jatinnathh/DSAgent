// app/api/admin/users/route.ts — Admin user management
import { createApiHandler } from '@/lib/api-handler';
import { userService } from '@/lib/services/userService';

export const GET = createApiHandler(
  async (req) => {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const result = await userService.getAllWithStats(page, limit);
    return result;
  },
  { requireAdmin: true, action: 'admin.users.list', resource: 'admin/users' }
);
