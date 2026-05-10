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

    // Save report to database if successful
    if (result.success && result.report_id) {
      try {
        const prisma = (await import("@/lib/prisma")).default;
        const reportPath = result.report_path || "";
        
        // Get file size
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
      } catch (dbErr: any) {
        console.error("Failed to save report to DB:", dbErr.message);
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Autonomous pipeline route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
