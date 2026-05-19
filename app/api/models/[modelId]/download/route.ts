// app/api/models/[modelId]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const response = await fetch(`${BACKEND_URL}/models/${modelId}/download`);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Model not found or download failed' },
        { status: response.status }
      );
    }

    const blob = await response.arrayBuffer();
    const contentDisposition = response.headers.get('content-disposition') || 
      `attachment; filename="DSAgent_Model_${modelId}.zip"`;

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition,
        'Content-Length': String(blob.byteLength),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Download failed', details: error.message },
      { status: 500 }
    );
  }
}
