// app/api/pipelines/[pipelineId]/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

type Params = { params: Promise<{ pipelineId: string }> };

// POST /api/pipelines/[pipelineId]/run — execute all steps in sequence
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pipelineId } = await params;
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, userId } });
    if (!pipeline) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const steps = pipeline.steps as any[];
    if (!steps || steps.length === 0) {
      return NextResponse.json({ error: 'Pipeline has no steps' }, { status: 400 });
    }

    // Create a run record
    const run = await prisma.pipelineRun.create({
      data: { pipelineId, sessionId, status: 'running', stepResults: [] },
    });

    // Mark pipeline as running
    await prisma.pipeline.update({ where: { id: pipelineId }, data: { status: 'running' } });

    // Execute each step sequentially
    const stepResults: any[] = [];
    let failed = false;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const args = { ...step.args, session_id: sessionId };

      try {
        const res = await fetch(`${BACKEND_URL}/execute-tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool_name: step.tool, arguments: args }),
        });

        const result = await res.json();
        const stepResult = {
          stepIndex: i,
          tool: step.tool,
          label: step.label,
          args,
          success: result.success,
          // strip heavy base64 from stored results
          output: result.output
            ? Object.fromEntries(
                Object.entries(result.output).filter(([k]) => k !== 'image_base64')
              )
            : null,
          error: result.error || null,
          execution_time_ms: result.execution_time_ms,
        };

        stepResults.push(stepResult);

        if (!result.success) {
          failed = true;
          break;
        }
      } catch (err: any) {
        stepResults.push({ stepIndex: i, tool: step.tool, success: false, error: err.message });
        failed = true;
        break;
      }
    }

    const finalStatus = failed ? 'failed' : 'completed';

    // Update run + pipeline status
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: finalStatus, stepResults, completedAt: new Date() },
    });

    await prisma.pipeline.update({
      where: { id: pipelineId },
      data: { status: finalStatus },
    });

    return NextResponse.json({ runId: run.id, status: finalStatus, stepResults });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}