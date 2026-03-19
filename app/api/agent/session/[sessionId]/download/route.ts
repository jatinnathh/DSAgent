// app/api/agent/session/[sessionId]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const response = await fetch(`${BACKEND_URL}/session/${sessionId}/download`);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Session not found or download failed' },
        { status: response.status }
      );
    }

    const csvData = await response.text();

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="session_${sessionId}.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Download failed', details: error.message },
      { status: 500 }
    );
  }
}