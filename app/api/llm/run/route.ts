import { NextRequest, NextResponse } from "next/server";

const BYTEZ_API_KEY = process.env.BYTEZ_API_KEY!;
const MODEL_ID = "openai/gpt-4o";
const BYTEZ_ENDPOINT = "https://api.bytez.com/v1/responses";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, tools, images } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request. Expected { messages: [...] }" },
        { status: 400 }
      );
    }

    if (!BYTEZ_API_KEY) {
      return NextResponse.json(
        { error: "BYTEZ_API_KEY missing in env" },
        { status: 500 }
      );
    }

    // Convert chat history → Responses API format
    // Convert chat history → Responses API format
    const input = messages.map((m: any) => ({
      role: m.role,
      content: m.content
    }));

    // Attach image to last user message
    if (images && images.length > 0) {
      const last = input[input.length - 1];

      if (last && last.role === "user") {
        images.forEach((img: string) => {
          last.content = [
            { type: "input_text", text: last.content },
            { type: "input_image", image_url: img }
          ];
        });
      }
    }

    const payload: Record<string, any> = {
      model: MODEL_ID,
      input,
      max_output_tokens: 2048,
    };

    // Optional tools
    if (tools && tools.length > 0) {
      payload.tools = tools.map((t: any) => ({
        type: "function",
        name: t.name || t.function?.name,
        description: t.description || t.function?.description,
        parameters: t.parameters || t.function?.parameters
      }));
    }
    console.log("TOOLS SENT TO BYTEZ:", JSON.stringify(payload.tools, null, 2));
    const response = await fetch(BYTEZ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BYTEZ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Bytez error:", err);

      return NextResponse.json(
        { error: "Bytez API error", details: err },
        { status: 500 }
      );
    }

    const result = await response.json();

    return NextResponse.json(result);

  } catch (err: any) {
    console.error("LLM route error:", err);

    return NextResponse.json(
      { error: "Internal error", details: err.message },
      { status: 500 }
    );
  }
}