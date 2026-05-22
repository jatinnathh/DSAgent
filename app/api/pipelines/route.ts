// Refactored: app/api/pipelines/route.ts — Using service layer + api handler wrapper
import { NextRequest } from 'next/server';
import { createApiHandler } from '@/lib/api-handler';
import { pipelineService } from '@/lib/services/pipelineService';

// GET /api/pipelines — list user's pipelines
export const GET = createApiHandler(
  async (_req, ctx) => {
    const pipelines = await pipelineService.listPipelines(ctx.userId);
    return { pipelines };
  },
  { action: 'pipelines.list', resource: 'pipelines' }
);

// POST /api/pipelines — create new pipeline
export const POST = createApiHandler(
  async (req, ctx) => {
    const body = await req.json();
    const { name, sessionId, metadata } = body;
    const pipeline = await pipelineService.createPipeline(ctx.userId, name, sessionId, metadata);
    return { pipeline };
  },
  { action: 'pipelines.create', resource: 'pipelines' }
);