import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://aiapiv2.pekpik.com/v1",
  apiKey: process.env.CLAUDE_KEY!,
});

const MODEL = "claude-opus-4-7";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, tools } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request. Expected { messages: [...] }" },
        { status: 400 }
      );
    }

    if (!process.env.CLAUDE_KEY) {
      return NextResponse.json(
        { error: "CLAUDE_KEY missing in env" },
        { status: 500 }
      );
    }

    // ── Build the payload ──────────────────────────────────────────────
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: MODEL,
      messages,
      max_tokens: 4096,
      stream: false,
    };

    if (tools && tools.length > 0) {
      params.tools = tools.map((t: any) => {
        if (t.type === "function" && t.function) return t;
        return {
          type: "function" as const,
          function: {
            name: t.name || t.function?.name,
            description: t.description || t.function?.description,
            parameters: t.parameters || t.function?.parameters,
          },
        };
      });
      params.tool_choice = "auto";
    }

    console.log("→ Claude request via pekpik, model:", MODEL);
    console.log("→ Tools count:", params.tools?.length ?? 0);

    // ── Call the API ───────────────────────────────────────────────────
    const response = await client.chat.completions.create(params);

    console.log("← Response model:", response.model);

    const choice = response.choices?.[0];
    if (!choice) {
      return NextResponse.json(
        { error: "No choices in response", raw: response },
        { status: 500 }
      );
    }

    const msg = choice.message;
    const finishReason = choice.finish_reason;

    // ── Extract text content ──────────────────────────────────────────
    const contentBlocks: any[] = [];

    const textContent = msg.content ?? "";
    if (typeof textContent === "string" && textContent.trim()) {
      contentBlocks.push({ type: "output_text", text: textContent.trim() });
    }

    // Build tool_call blocks if present
    const toolCallBlocks: any[] = [];
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        toolCallBlocks.push({
          type: "tool_call",
          id: tc.id,
          name: tc.function?.name,
          arguments:
            typeof tc.function?.arguments === "string"
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments ?? {}),
        });
      }
    }

    const normalised = {
      output: [
        {
          type: "message",
          role: "assistant",
          content: [...contentBlocks, ...toolCallBlocks],
          tool_calls: msg.tool_calls ?? [],
        },
      ],
      choices: response.choices,
      model: response.model,
      usage: response.usage,
      finish_reason: finishReason,
    };

    return NextResponse.json(normalised);
  } catch (err: any) {
    console.error("LLM route error:", err);
    return NextResponse.json(
      { error: "Internal error", details: err.message },
      { status: 500 }
    );
  }
}