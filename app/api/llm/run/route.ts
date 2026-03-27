import { NextRequest, NextResponse } from "next/server";

const HF_API_KEY = process.env.HF_API_KEY!;
const MODEL_ID = "Qwen/Qwen3-8B";

// ✅ FIX: Use nscale provider (where Qwen3-8B is actually hosted)
const HF_ENDPOINT = `https://router.huggingface.co/nscale/v1/chat/completions`;

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

    if (!HF_API_KEY) {
      return NextResponse.json(
        { error: "HF_API_KEY missing in env" },
        { status: 500 }
      );
    }

    // ── Build the payload ──────────────────────────────────────────────
    const processedMessages = messages.map((m: any, idx: number) => {
      if (m.role === "user" && idx === messages.length - 1) {
        const content =
          typeof m.content === "string" ? m.content : String(m.content ?? "");
        // Append /no_think to suppress <think> tags and reasoning_content
        const finalContent = content.includes("/no_think")
          ? content
          : `${content} /no_think`;
        return { ...m, content: finalContent };
      }
      return m;
    });

    const payload: Record<string, any> = {
      model: MODEL_ID,
      messages: processedMessages,
      max_tokens: 2048,
      temperature: 0.6,
      stream: false,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools.map((t: any) => {
        if (t.type === "function" && t.function) return t;
        return {
          type: "function",
          function: {
            name: t.name || t.function?.name,
            description: t.description || t.function?.description,
            parameters: t.parameters || t.function?.parameters,
          },
        };
      });
      payload.tool_choice = "auto";
    }

    console.log("→ HF request to:", HF_ENDPOINT);
    console.log("→ Tools count:", payload.tools?.length ?? 0);

    const response = await fetch(HF_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HF_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("HF API error:", response.status, err);
      return NextResponse.json(
        { error: "HuggingFace API error", details: err },
        { status: 500 }
      );
    }

    const hfResult = await response.json();
    console.log("← HF raw response keys:", Object.keys(hfResult));

    const choice = hfResult.choices?.[0];
    if (!choice) {
      return NextResponse.json(
        { error: "No choices in HF response", raw: hfResult },
        { status: 500 }
      );
    }

    const msg = choice.message;
    const finishReason = choice.finish_reason;

    // ── Extract text content ──────────────────────────────────────────
    // Qwen3 can return text in TWO places:
    //   1. msg.content (normal response, especially with /no_think)
    //   2. msg.reasoning_content (thinking mode — fallback if /no_think fails)
    // We check both.

    const contentBlocks: any[] = [];

    // Primary: msg.content
    let textContent = msg.content ?? "";
    
    // ✅ FIX: Fallback to reasoning_content if content is null/empty
    // This happens when Qwen3 uses thinking mode despite /no_think
    if (!textContent && msg.reasoning_content) {
      console.log("⚠ content was null, falling back to reasoning_content");
      textContent = msg.reasoning_content;
    }

    if (typeof textContent === "string" && textContent.trim()) {
      // Strip any stray <think>...</think> blocks
      const cleaned = textContent
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim();
      if (cleaned) {
        contentBlocks.push({ type: "output_text", text: cleaned });
      }
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
      choices: hfResult.choices,
      model: hfResult.model,
      usage: hfResult.usage,
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