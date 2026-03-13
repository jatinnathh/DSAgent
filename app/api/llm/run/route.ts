import { NextRequest, NextResponse } from 'next/server';

const BYTEZ_API_KEY = process.env.BYTEZ_API_KEY!;
const MODEL_ID = 'openai/gpt-4o';
const BYTEZ_ENDPOINT = 'https://api.bytez.com/v1/chat/completions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, tools } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid request. Expected { messages: [...] }' },
        { status: 400 }
      );
    }

    if (!BYTEZ_API_KEY) {
      return NextResponse.json(
        { error: 'BYTEZ_API_KEY is not configured in environment variables' },
        { status: 500 }
      );
    }

    // Build the request payload
    const payload: Record<string, unknown> = {
      model: MODEL_ID,
      messages,
      max_tokens: 2048,
    };

    // Only add tools if provided and non-empty
    if (tools && Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    const response = await fetch(BYTEZ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BYTEZ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bytez API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Bytez API error (${response.status})`, details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();

    // Log for debugging (remove in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('Bytez response structure:', JSON.stringify(result).slice(0, 300));
    }

    // Wrap in 'output' field for agent.py compatibility
    // The agent expects: data.output.choices[0].message.content
    return NextResponse.json({ output: result });

  } catch (err: unknown) {
    const error = err as Error;
    console.error('LLM route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}