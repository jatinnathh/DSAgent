import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: process.env.GEMINI_API_KEY || "",
});

const MODEL = "gemini-3.6-flash";

const MAX_RETRIES = 3;

/** Exponential backoff sleep */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if an error is retryable (rate-limit or server error) */
function isRetryable(err: any): boolean {
  if (!err) return false;
  const status = err.status ?? err.statusCode ?? err?.response?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("503") ||
    msg.includes("529") ||
    msg.includes("overloaded")
  );
}

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

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY missing in env" },
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

    console.log("→ Gemini request, model:", MODEL);
    console.log("→ Tools count:", params.tools?.length ?? 0);

    // ── Retry loop with exponential backoff ──
    let lastError: any = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await client.chat.completions.create(params);

        console.log("← Response model:", response.model);

        const choice = response.choices?.[0];

        if (!choice) {
          // No choices — might be a transient issue, retry
          if (attempt < MAX_RETRIES - 1) {
            const waitMs = 1000 * 2 ** attempt;
            console.warn(`← No choices in response, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await sleep(waitMs);
            continue;
          }
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
      } catch (retryErr: any) {
        lastError = retryErr;
        if (isRetryable(retryErr) && attempt < MAX_RETRIES - 1) {
          const waitMs = 1000 * 2 ** attempt;
          console.warn(
            `← Gemini retryable error (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${waitMs}ms:`,
            retryErr.message
          );
          await sleep(waitMs);
          continue;
        }
        throw retryErr; // non-retryable or exhausted retries
      }
    }

    // If we exhaust retries without returning
    throw lastError || new Error("Exhausted retries without a response");
  } catch (err: any) {
    console.error("Gemini route error:", err);

    return NextResponse.json(
      {
        error: "Internal error",
        details: err.message,
      },
      { status: 500 }
    );
  }
}