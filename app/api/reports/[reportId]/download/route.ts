// app/api/reports/[reportId]/download/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function GET(req: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { reportId } = await params;

    const report = await prisma.report.findFirst({ where: { id: reportId, userId } });
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Extract the backend report_id from metadata
    const meta = report.metadata as any;
    const backendReportId = meta?.report_id;

    if (!backendReportId) {
      return NextResponse.json({ error: "No report file associated" }, { status: 404 });
    }

    // Proxy the download from the backend
    const res = await fetch(`${BACKEND}/reports/${backendReportId}/download`);
    if (!res.ok) {
      return NextResponse.json({ error: "Report file not found" }, { status: 404 });
    }

    const pdfBuffer = await res.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="DSAgent_Report_${reportId}.pdf"`,
        "Content-Length": String(pdfBuffer.byteLength),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
