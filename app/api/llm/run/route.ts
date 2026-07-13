import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_KEY!,
});

// Choose any Groq-supported model
const MODEL = "llama-3.3-70b-versatile";
// Other options:
// "llama-3.1-8b-instant"
// "meta-llama/llama-4-scout-17b-16e-instruct"
// "openai/gpt-oss-120b"

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

    if (!process.env.GROQ_KEY) {
      return NextResponse.json(
        { error: "GROQ_KEY missing in env" },
        { status: 500 }
      );
    }

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

    console.log("→ Groq request, model:", MODEL);
    console.log("→ Tools count:", params.tools?.length ?? 0);

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

    const contentBlocks: any[] = [];

    if (typeof msg.content === "string" && msg.content.trim()) {
      contentBlocks.push({
        type: "output_text",
        text: msg.content.trim(),
      });
    }

    const toolCallBlocks: any[] = [];

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls as any[]) {
        toolCallBlocks.push({
          type: "tool_call",
          id: tc.id,
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === "string"
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments ?? {}),
        });
      }
    }

    return NextResponse.json({
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
      finish_reason: choice.finish_reason,
    });
  } catch (err: any) {
    console.error("Groq route error:", err);

    return NextResponse.json(
      {
        error: "Internal error",
        details: err.message,
      },
      { status: 500 }
    );
  }
}