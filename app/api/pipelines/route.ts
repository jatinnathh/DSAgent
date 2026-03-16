// app/api/pipelines/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

// GET /api/pipelines — list user's pipelines
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pipelines = await prisma.pipeline.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { runs: true } } },
    });

    return NextResponse.json({ pipelines });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/pipelines — create new pipeline
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, sessionId, metadata } = body;

    const pipeline = await prisma.pipeline.create({
      data: {
        name: name || 'New Pipeline',
        userId,
        sessionId: sessionId || null,
        metadata: metadata || null,
        steps: [],
        status: 'draft',
      },
    });

    return NextResponse.json({ pipeline });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}