// app/api/pipelines/suggest/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { completedSteps = [], datasetMeta = '', lastResult = '' } = body;
    const doneTools = completedSteps.map((s: any) => s.tool).join(', ') || 'none';

    // ── Extract real column names from metadata ───────────────────
    let numericCols:     string[] = [];
    let categoricalCols: string[] = [];

    const numMatch = datasetMeta.match(/Numeric columns:\s*([^\n]+)/);
    const catMatch = datasetMeta.match(/Categorical columns:\s*([^\n]+)/);

    if (numMatch) numericCols     = numMatch[1].split(',').map((c: string) => c.trim()).filter(Boolean);
    if (catMatch) categoricalCols = catMatch[1].split(',').map((c: string) => c.trim()).filter((c: string) => c !== 'none');

    const col1  = numericCols[0]  || 'value';
    const col2  = numericCols[1]  || numericCols[0] || 'value';
    const cat1  = categoricalCols[0] || 'category';

    const targetHints = ['price','target','label','churn','survived','outcome','sales','revenue','y'];
    const targetCol = numericCols.find(c => targetHints.some(h => c.toLowerCase().includes(h)))
                   || numericCols[numericCols.length - 1]
                   || col1;

    const systemPrompt = `You are DSAgent, an expert data science pipeline advisor.
Return ONLY a valid JSON array — no markdown, no prose, no backticks. Raw JSON only.

Each element must have exactly:
{
  "tool": "<exact tool name>",
  "label": "<short human label>",
  "args": { <args WITHOUT session_id> },
  "reason": "<one sentence>",
  "category": "cleaning|eda|visualization|modeling"
}

Available tools:
  cleaning:      detect_missing_values, fill_missing_values, remove_duplicates, detect_outliers, remove_outliers
  eda:           dataset_overview, column_statistics, correlation_analysis, value_counts, data_quality_report
  visualization: create_histogram, create_bar_chart, create_scatter_plot, create_correlation_heatmap, create_box_plot
  modeling:      auto_ml_pipeline, feature_importance, model_evaluation, make_predictions, model_comparison, train_specific_model

MANDATORY ARGS — use the REAL column names shown below, never generic placeholders:
  Numeric columns (use these): ${numericCols.join(', ') || col1}
  Categorical columns (use these): ${categoricalCols.join(', ') || cat1}
  Target column (best guess): ${targetCol}

  create_histogram        → {"column": "<numeric col>"}
  create_bar_chart        → {"column": "<categorical col>"}
  create_scatter_plot     → {"x_column": "<numeric col>", "y_column": "<different numeric col>"}
  create_box_plot         → {"column": "<numeric col>"}
  create_correlation_heatmap → {}
  column_statistics       → {"column": "<numeric col>"}
  value_counts            → {"column": "<categorical col>"}
  fill_missing_values     → {"column": "<col>", "strategy": "mean"}
  detect_outliers         → {"column": "<numeric col>"}
  remove_outliers         → {"column": "<numeric col>"}
  auto_ml_pipeline        → {"target_column": "${targetCol}"}
  all others              → {}

Rules:
- NEVER suggest a tool already in: ${doneTools}
- Suggest 3-5 steps
- Follow order: cleaning → eda → visualization → modeling`;

    const userMsg = `Dataset:
${datasetMeta}

Completed: ${doneTools}
Last result: ${lastResult || 'N/A'}

Suggest the next 3-5 pipeline steps.`;

    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host     = req.headers.get('host') || 'localhost:3000';

    const llmRes = await fetch(`${protocol}://${host}/api/llm/run`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMsg },
      ]}),
    });

    if (!llmRes.ok) {
      return NextResponse.json({ suggestions: [], error: await llmRes.text() }, { status: 200 });
    }

    const data = await llmRes.json();

    let rawText = '';
    for (const item of (data?.output || [])) {
      for (const block of (item?.content || [])) {
        if (block.type === 'output_text') rawText += block.text || '';
      }
    }
    if (!rawText) rawText = data?.content?.[0]?.text || (typeof data?.output === 'string' ? data.output : '');

    let suggestions: any[] = [];
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      const match = clean.match(/\[[\s\S]*\]/);
      suggestions = JSON.parse(match ? match[0] : clean);
    } catch { suggestions = []; }

    const already = new Set(completedSteps.map((s: any) => s.tool));
    suggestions = suggestions
      .filter((s: any) => !already.has(s.tool))
      .map((s: any) => {
        const args = { ...(s.args || {}) };
        delete args.session_id;

        if (s.tool === 'create_histogram'        && !args.column)         args.column         = col1;
        if (s.tool === 'create_box_plot'         && !args.column)         args.column         = col1;
        if (s.tool === 'create_bar_chart'        && !args.column)         args.column         = cat1;
        if (s.tool === 'create_scatter_plot'     && !args.x_column)       args.x_column       = col1;
        if (s.tool === 'create_scatter_plot'     && !args.y_column)       args.y_column       = col2;
        if (s.tool === 'detect_outliers'         && !args.column)         args.column         = col1;
        if (s.tool === 'remove_outliers'         && !args.column)         args.column         = col1;
        if (s.tool === 'fill_missing_values'     && !args.column)         args.column         = col1;
        if (s.tool === 'column_statistics'       && !args.column)         args.column         = col1;
        if (s.tool === 'value_counts'            && !args.column)         args.column         = cat1;
        if (s.tool === 'auto_ml_pipeline'        && !args.target_column)  args.target_column  = targetCol;

        return { ...s, args };
      });

    return NextResponse.json({ suggestions });
  } catch (err: any) {
    return NextResponse.json({ suggestions: [], error: err.message }, { status: 200 });
  }
}