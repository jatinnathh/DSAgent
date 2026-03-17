// app/api/pipelines/[pipelineId]/run/route.ts
// This version is called AFTER the frontend has already run the steps.
// It just records the run history in the DB.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

type Params = { params: Promise<{ pipelineId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pipelineId } = await params;
    const body = await req.json();
    const { sessionId, stepResults } = body;

    const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, userId } });
    if (!pipeline) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Create a run record with the provided step results
    const run = await prisma.pipelineRun.create({
      data: {
        pipelineId,
        sessionId: sessionId || pipeline.sessionId || 'unknown',
        status: 'completed',
        stepResults: stepResults || [],
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ runId: run.id, status: 'completed' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET run history for a pipeline
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pipelineId } = await params;
    const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, userId } });
    if (!pipeline) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const runs = await prisma.pipelineRun.findMany({
      where: { pipelineId },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ runs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}