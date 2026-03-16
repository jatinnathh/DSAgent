// app/api/pipelines/suggest/route.ts
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/pipelines/suggest
 * Uses the existing /api/llm/run proxy (Bytez → GPT-4o)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { completedSteps = [], datasetMeta = '', lastResult = '' } = body;

    const completedNames = completedSteps.map((s: any) => s.tool).join(', ') || 'none';

    const systemPrompt = `You are DSAgent, an expert data science pipeline advisor.
Your job is to suggest the next best pipeline steps given what has already been done.

You must respond ONLY with a valid JSON array — no markdown fences, no explanation, just the raw JSON array.

Each suggestion object must have exactly these fields:
{
  "tool": "<exact tool name>",
  "label": "<short human-readable label>",
  "args": {},
  "reason": "<1 sentence why this step is useful now>",
  "category": "<one of: cleaning | eda | visualization | modeling>"
}

Available tools:
  cleaning:      detect_missing_values, fill_missing_values, remove_duplicates, detect_outliers, remove_outliers
  eda:           dataset_overview, column_statistics, correlation_analysis, value_counts, data_quality_report
  visualization: create_histogram, create_bar_chart, create_scatter_plot, create_correlation_heatmap, create_box_plot
  modeling:      auto_ml_pipeline, feature_importance, model_evaluation, make_predictions, model_comparison, train_specific_model

Rules:
- NEVER suggest a tool already in completedSteps
- Suggest 3-5 steps maximum
- For fill_missing_values: args = {"column": "<first_numeric_col>", "strategy": "mean"}
- For create_histogram: args = {"column": "<first_numeric_col>"}
- For auto_ml_pipeline: args = {"target_column": "<most_likely_target>"}
- Priority order: cleaning first → eda → visualization → modeling
- Return ONLY the JSON array, nothing else`;

    const userMsg = `Dataset metadata:
${datasetMeta}

Steps already completed: ${completedNames}

Last result summary: ${lastResult || 'N/A'}

Suggest the best 3-5 next pipeline steps as a JSON array.`;

    // Use the existing Bytez proxy — same as AgentChat does
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

    const llmRes = await fetch(`${protocol}://${host}/api/llm/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
      }),
    });

    if (!llmRes.ok) {
      const err = await llmRes.text();
      return NextResponse.json({ error: `LLM error: ${err}`, suggestions: [] }, { status: 200 });
    }

    const data = await llmRes.json();

    // Parse Bytez Responses API format
    const output = data?.output || [];
    let rawText = '';

    for (const item of output) {
      if (!item?.content) continue;
      for (const block of item.content) {
        if (block.type === 'output_text') rawText += block.text || '';
      }
    }

    // Fallback: direct text field
    if (!rawText && data?.content?.[0]?.text) rawText = data.content[0].text;
    if (!rawText && typeof data?.output === 'string') rawText = data.output;

    let suggestions: any[] = [];
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      // Find first [ ... ] block in case model added extra text
      const match = cleaned.match(/\[[\s\S]*\]/);
      suggestions = match ? JSON.parse(match[0]) : JSON.parse(cleaned);
    } catch {
      suggestions = [];
    }

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, suggestions: [] }, { status: 200 });
  }
}