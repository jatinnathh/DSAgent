// app/api/reports/[reportId]/email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { sendReportEmail } from "@/lib/email";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { reportId } = await params;

    const report = await prisma.report.findFirst({ where: { id: reportId, userId } });
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Get user email from Clerk
    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress;
    if (!email) return NextResponse.json({ error: "No email address found" }, { status: 400 });

    // Download the PDF from backend first to get the file path
    const meta = report.metadata as any;
    const backendReportId = meta?.report_id;
    
    // Try to use the stored file path, or download from backend
    let reportFilePath = report.filePath;

    // If the file doesn't exist locally (e.g., different environment), download it
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    
    if (!reportFilePath || !fs.existsSync(reportFilePath)) {
      // Download from backend to temp
      if (backendReportId) {
        const res = await fetch(`${BACKEND}/reports/${backendReportId}/download`);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          const tmpPath = path.join(os.tmpdir(), `dsagent_report_${reportId}.pdf`);
          fs.writeFileSync(tmpPath, buffer);
          reportFilePath = tmpPath;
        }
      }
    }

    if (!reportFilePath || !fs.existsSync(reportFilePath)) {
      return NextResponse.json({ error: "Report file not available" }, { status: 404 });
    }

    // Send email
    const result = await sendReportEmail({
      to: email,
      reportTitle: report.title,
      reportPath: reportFilePath,
      pipelineSummary: report.description || undefined,
    });

    // Mark as emailed
    await prisma.report.update({
      where: { id: reportId },
      data: { emailSent: true, emailSentAt: new Date() },
    });

    return NextResponse.json({ success: true, messageId: result.messageId, sentTo: email });
  } catch (err: any) {
    console.error("Email send error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
