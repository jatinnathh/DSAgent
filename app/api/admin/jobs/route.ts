// app/api/admin/jobs/route.ts — Admin background job management
import { NextRequest } from 'next/server';
import { createApiHandler } from '@/lib/api-handler';
import { adminService } from '@/lib/services/adminService';

// GET /api/admin/jobs — list jobs
export const GET = createApiHandler(
  async (req) => {
    const url = new URL(req.url);
    const filters = {
      status: url.searchParams.get('status') || undefined,
      type: url.searchParams.get('type') || undefined,
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '50'),
    };

    const [jobs, counts] = await Promise.all([
      adminService.getJobs(filters),
      adminService.getJobCounts(),
    ]);

    return { ...jobs, counts };
  },
  { requireAdmin: true, action: 'admin.jobs.list', resource: 'admin/jobs' }
);

// POST /api/admin/jobs — retry or cancel a job
export const POST = createApiHandler(
  async (req) => {
    const body = await req.json();
    const { jobId, action } = body;

    if (!jobId || !action) {
      return { error: 'jobId and action (retry|cancel) required' };
    }

    if (action === 'retry') {
      const result = await adminService.retryJob(jobId);
      return { success: true, job: result };
    } else if (action === 'cancel') {
      const result = await adminService.cancelJob(jobId);
      return { success: true, job: result };
    }

    return { error: 'Invalid action. Use retry or cancel.' };
  },
  { requireAdmin: true, action: 'admin.jobs.manage', resource: 'admin/jobs' }
);
