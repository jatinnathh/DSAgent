import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const response = await fetch(`${BACKEND_URL}/session/${sessionId}/metadata`);

    if (!response.ok) {
      return NextResponse.json({ found: false }, { status: 200 });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ found: false, error: error.message }, { status: 200 });
  }
}