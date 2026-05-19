// app/api/models/route.ts
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

// GET /api/models — list all saved models
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/models`);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch models' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
