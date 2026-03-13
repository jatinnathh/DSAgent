import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/tools`);
    
    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Tools fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tools', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const response = await fetch(`${BACKEND_URL}/execute-tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'Tool execution failed', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Tool execution error:', error);
    return NextResponse.json(
      { error: 'Tool execution failed', details: error.message },
      { status: 500 }
    );
  }
}