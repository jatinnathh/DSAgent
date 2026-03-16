// app/api/pipelines/[pipelineId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

type Params = { params: Promise<{ pipelineId: string }> };

// GET /api/pipelines/[pipelineId]
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pipelineId } = await params;
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: pipelineId, userId },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 5 } },
    });

    if (!pipeline) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ pipeline });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/pipelines/[pipelineId] — update steps, name, status, sessionId
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pipelineId } = await params;
    const body = await req.json();

    const existing = await prisma.pipeline.findFirst({ where: { id: pipelineId, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await prisma.pipeline.update({
      where: { id: pipelineId },
      data: {
        ...(body.name !== undefined      && { name: body.name }),
        ...(body.steps !== undefined     && { steps: body.steps }),
        ...(body.status !== undefined    && { status: body.status }),
        ...(body.sessionId !== undefined && { sessionId: body.sessionId }),
        ...(body.metadata !== undefined  && { metadata: body.metadata }),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ pipeline: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/pipelines/[pipelineId]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pipelineId } = await params;
    const existing = await prisma.pipeline.findFirst({ where: { id: pipelineId, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.pipeline.delete({ where: { id: pipelineId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}