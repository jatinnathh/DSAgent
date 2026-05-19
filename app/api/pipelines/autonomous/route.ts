// app/api/pipelines/autonomous/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { session_id, dataset_name } = body;

    if (!session_id) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    const res = await fetch(`${BACKEND}/autonomous-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id, dataset_name: dataset_name || "dataset" }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const result = await res.json();

    // Save pipeline + run + report to database if successful
    if (result.success) {
      try {
        const prisma = (await import("@/lib/prisma")).default;

        // ── Build step list from the phases for the Pipeline record ──
        const phaseOrder = ["eda", "cleaning", "visualization", "feature_engineering", "modeling", "evaluation"];
        const pipelineSteps: any[] = [];
        for (const phase of phaseOrder) {
          const ph = result.phases?.[phase];
          if (!ph?.steps) continue;
          for (const step of ph.steps) {
            pipelineSteps.push({
              tool: step.tool || "",
              label: step.label || step.tool || "",
              category: phase,
              reason: `Autonomous: ${phase}`,
              success: step.success ?? false,
              time_ms: step.time_ms ?? 0,
            });
          }
        }

        // ── Create Pipeline record ──
        const pipeline = await prisma.pipeline.create({
          data: {
            name: `Pipeline – ${dataset_name || "dataset"}`,
            userId,
            sessionId: session_id,
            status: "completed",
            steps: pipelineSteps,
            metadata: {
              mode: "autonomous",
              total_time_ms: result.total_time_ms,
              report_id: result.report_id || null,
              conclusion: result.conclusion?.slice(0, 500) || "",
            },
          },
        });

        // ── Create PipelineRun record ──
        await prisma.pipelineRun.create({
          data: {
            pipelineId: pipeline.id,
            sessionId: session_id,
            status: "completed",
            stepResults: pipelineSteps.map((s: any) => ({
              tool: s.tool,
              success: s.success,
              executionMs: s.time_ms,
            })),
            completedAt: new Date(),
          },
        });

        // ── Create Report record ──
        if (result.report_id) {
          const reportPath = result.report_path || "";
          let fileSize = 0;
          if (reportPath) {
            try {
              const fs = await import("fs");
              const stats = fs.statSync(reportPath);
              fileSize = stats.size;
            } catch { /* ignore */ }
          }

          await prisma.report.create({
            data: {
              userId,
              pipelineId: pipeline.id,
              title: `${dataset_name || "Dataset"} — Autonomous Pipeline Report`,
              description: result.conclusion?.slice(0, 500) || "Autonomous pipeline report",
              filePath: reportPath,
              fileSize,
              sessionId: session_id,
              metadata: {
                report_id: result.report_id,
                total_time_ms: result.total_time_ms,
                phases: Object.keys(result.phases || {}),
              },
            },
          });
        }
      } catch (dbErr: any) {
        console.error("Failed to save autonomous pipeline to DB:", dbErr.message);
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Autonomous pipeline route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
