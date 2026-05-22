// app/api/admin/users/[userId]/route.ts — Admin user detail
import { createApiHandler } from '@/lib/api-handler';
import { userService } from '@/lib/services/userService';

export const GET = createApiHandler(
  async (_req, _ctx, params) => {
    const userId = params?.userId;
    if (!userId) return { error: 'userId required' };

    const activity = await userService.getUserActivity(userId);
    return activity;
  },
  { requireAdmin: true, action: 'admin.users.detail', resource: 'admin/users' }
);
