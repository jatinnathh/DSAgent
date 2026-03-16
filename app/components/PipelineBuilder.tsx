// app/components/PipelineBuilder.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Design tokens (matching DashboardClient) ─────────────────── */
const C = {
  bg: "#0E0E0E",
  card: "#141414",
  cardHover: "#181818",
  input: "#1A1A1A",
  pill: "#1F1F1F",
  border: "rgba(255,255,255,0.06)",
  borderMd: "rgba(255,255,255,0.10)",
  borderHi: "rgba(255,255,255,0.16)",
  text: "#F2F2F2",
  textSub: "#8C8C8C",
  textMute: "#4A4A4A",
  cyan: "#00D4FF",
  violet: "#8B5CF6",
  green: "#3FB950",
  amber: "#D29922",
  red: "#F85149",
  mono: "'JetBrains Mono', monospace",
  sans: "'Inter', system-ui, sans-serif",
  head: "'Sora', 'Inter', sans-serif",
};

const CATEGORY_COLOR: Record<string, string> = {
  cleaning: C.amber,
  eda: C.cyan,
  visualization: C.violet,
  modeling: C.green,
};

const CATEGORY_ICON: Record<string, string> = {
  cleaning: "🧹",
  eda: "🔍",
  visualization: "📊",
  modeling: "🤖",
};

export type PipelineStep = {
  id: string;
  tool: string;
  label: string;
  args: Record<string, any>;
  reason: string;
  category: string;
  status: "pending" | "running" | "done" | "error";
  result?: any;
  imageBase64?: string;
  executionMs?: number;
};

interface PipelineBuilderProps {
  onSaved?: (pipelineId: string) => void;
}

export default function PipelineBuilder({ onSaved }: PipelineBuilderProps) {
  /* ── state ───────────────────────────────────────────────── */
  const [phase, setPhase] = useState<"upload" | "build" | "run" | "done">("upload");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [datasetMeta, setDatasetMeta] = useState<string>("");
  const [datasetLabel, setDatasetLabel] = useState<string>("");

  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [runningIdx, setRunningIdx] = useState<number | null>(null);

  const [pipelineName, setPipelineName] = useState("My Pipeline");
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  /* ── auto-scroll ─────────────────────────────────────────── */
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  /* ── upload ──────────────────────────────────────────────── */
  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/agent/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const meta = data.metadata;

      setSessionId(data.session_id);
      setDatasetLabel(meta.filename);

      const metaSummary = [
        `Filename: ${meta.filename}`,
        `Rows: ${meta.row_count?.toLocaleString()}, Columns: ${meta.column_count}`,
        `Size: ${meta.memory_usage_mb} MB`,
        `Numeric columns: ${meta.numeric_columns?.join(", ") || "none"}`,
        `Categorical columns: ${meta.categorical_columns?.join(", ") || "none"}`,
      ].join("\n");

      setDatasetMeta(metaSummary);
      setPipelineName(`Pipeline – ${meta.filename}`);
      setPhase("build");

      // Get first suggestions
      await fetchSuggestions([], metaSummary, "Dataset just uploaded. No steps done yet.");
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  /* ── fetch LLM suggestions ───────────────────────────────── */
  const fetchSuggestions = async (
    currentSteps: PipelineStep[],
    meta: string,
    lastResult: string
  ) => {
    setLoadingSuggest(true);
    setSuggestions([]);
    try {
      const res = await fetch("/api/pipelines/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedSteps: currentSteps.map((s) => ({ tool: s.tool, label: s.label })),
          datasetMeta: meta,
          lastResult,
        }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSuggest(false);
    }
  };

  /* ── add suggestion to pipeline ──────────────────────────── */
  const addStep = (suggestion: any) => {
    const newStep: PipelineStep = {
      id: `step-${Date.now()}`,
      tool: suggestion.tool,
      label: suggestion.label,
      args: suggestion.args || {},
      reason: suggestion.reason,
      category: suggestion.category,
      status: "pending",
    };
    setSteps((prev) => {
      const updated = [...prev, newStep];
      return updated;
    });
    setSuggestions((prev) => prev.filter((s) => s.tool !== suggestion.tool));
  };

  /* ── remove step ─────────────────────────────────────────── */
  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  };

  /* ── update step arg ─────────────────────────────────────── */
  const updateArg = (stepId: string, key: string, value: string) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId ? { ...s, args: { ...s.args, [key]: value } } : s
      )
    );
  };

  /* ── run all steps ───────────────────────────────────────── */
  const runPipeline = async () => {
    if (!sessionId) return;
    setPhase("run");

    for (let i = 0; i < steps.length; i++) {
      setRunningIdx(i);

      // Mark step as running
      setSteps((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: "running" } : s))
      );

      const step = steps[i];
      const args = { ...step.args, session_id: sessionId };

      try {
        const res = await fetch("/api/agent/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool_name: step.tool, arguments: args }),
        });
        const result = await res.json();

        const imageBase64 =
          result?.output?.image_base64 || result?.output?.chart_base64 || undefined;

        // strip base64 from stored output (keep summary only)
        const cleanOutput = result.output
          ? Object.fromEntries(
              Object.entries(result.output).filter(
                ([k]) => k !== "image_base64" && k !== "chart_base64"
              )
            )
          : null;

        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === i
              ? {
                  ...s,
                  status: result.success ? "done" : "error",
                  result: cleanOutput,
                  imageBase64: imageBase64
                    ? imageBase64.startsWith("data:")
                      ? imageBase64
                      : `data:image/png;base64,${imageBase64}`
                    : undefined,
                  executionMs: result.execution_time_ms,
                }
              : s
          )
        );

        if (!result.success) {
          setRunningIdx(null);
          setPhase("build");
          return;
        }

        // Brief pause between steps for UX
        await new Promise((r) => setTimeout(r, 300));
      } catch (err: any) {
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: "error", result: { error: err.message } } : s
          )
        );
        setRunningIdx(null);
        setPhase("build");
        return;
      }
    }

    setRunningIdx(null);
    setPhase("done");
  };

  /* ── save pipeline to DB ─────────────────────────────────── */
  const savePipeline = async () => {
    setSaving(true);
    try {
      if (!pipelineId) {
        const res = await fetch("/api/pipelines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: pipelineName,
            sessionId,
            metadata: { datasetMeta },
          }),
        });
        const data = await res.json();
        setPipelineId(data.pipeline.id);
        await fetch(`/api/pipelines/${data.pipeline.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            steps: steps.map((s) => ({
              tool: s.tool,
              label: s.label,
              args: s.args,
              category: s.category,
            })),
            status: phase === "done" ? "completed" : "draft",
          }),
        });
        onSaved?.(data.pipeline.id);
      } else {
        await fetch(`/api/pipelines/${pipelineId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: pipelineName,
            steps: steps.map((s) => ({
              tool: s.tool,
              label: s.label,
              args: s.args,
              category: s.category,
            })),
            status: phase === "done" ? "completed" : "draft",
          }),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── last result summary for LLM ────────────────────────── */
  const getLastResultSummary = (): string => {
    const lastDone = [...steps].reverse().find((s) => s.status === "done");
    if (!lastDone || !lastDone.result) return "";
    return JSON.stringify(lastDone.result).slice(0, 400);
  };

  /* ── render step card ────────────────────────────────────── */
  const renderStep = (step: PipelineStep, idx: number) => {
    const color = CATEGORY_COLOR[step.category] || C.textSub;
    const isExpanded = expandedResult === step.id;

    return (
      <motion.div
        key={step.id}
        layout
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 16 }}
        transition={{ duration: 0.22 }}
        style={{
          background: C.card,
          border: `1px solid ${step.status === "running"
            ? color + "66"
            : step.status === "done"
            ? color + "33"
            : step.status === "error"
            ? C.red + "44"
            : C.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            background:
              step.status === "running"
                ? `${color}10`
                : step.status === "done"
                ? `${color}08`
                : "transparent",
          }}
        >
          {/* Step number */}
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: `${color}20`,
              border: `1px solid ${color}44`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 700,
              color,
              fontFamily: C.mono,
              flexShrink: 0,
            }}
          >
            {idx + 1}
          </div>

          {/* Category icon */}
          <span style={{ fontSize: 14 }}>{CATEGORY_ICON[step.category] || "⚙️"}</span>

          {/* Label + tool */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.head }}>
              {step.label}
            </div>
            <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>
              {step.tool}
            </div>
          </div>

          {/* Status badge */}
          <StatusBadge status={step.status} color={color} />

          {/* Execution time */}
          {step.executionMs && (
            <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono }}>
              {step.executionMs}ms
            </span>
          )}

          {/* Remove button (only when not running) */}
          {phase === "build" && (
            <button
              onClick={() => removeStep(step.id)}
              style={{
                background: "none",
                border: "none",
                color: C.textMute,
                cursor: "pointer",
                fontSize: 12,
                padding: "2px 4px",
                borderRadius: 4,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Args editor (build phase only) */}
        {phase === "build" && Object.keys(step.args).length > 0 && (
          <div
            style={{
              padding: "10px 14px",
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {Object.entries(step.args).map(([key, val]) => (
              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label
                  style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.06em" }}
                >
                  {key}
                </label>
                <input
                  value={String(val)}
                  onChange={(e) => updateArg(step.id, key, e.target.value)}
                  style={{
                    background: C.input,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: "4px 8px",
                    color: C.text,
                    fontSize: 11,
                    fontFamily: C.mono,
                    outline: "none",
                    width: 160,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Reason tooltip */}
        <div
          style={{
            padding: "6px 14px 10px",
            fontSize: 10,
            color: C.textMute,
            fontFamily: C.sans,
            borderTop: `1px solid ${C.border}`,
            fontStyle: "italic",
          }}
        >
          {step.reason}
        </div>

        {/* Result / image */}
        {(step.result || step.imageBase64) && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <button
              onClick={() => setExpandedResult(isExpanded ? null : step.id)}
              style={{
                width: "100%",
                padding: "8px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: color,
                fontSize: 10,
                fontFamily: C.mono,
                textAlign: "left",
              }}
            >
              {isExpanded ? "▲" : "▼"} View Result
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ padding: "0 14px 14px" }}>
                    {step.imageBase64 && (
                      <img
                        src={step.imageBase64}
                        alt="Result chart"
                        style={{
                          width: "100%",
                          borderRadius: 8,
                          marginBottom: 8,
                          border: `1px solid ${C.border}`,
                        }}
                      />
                    )}
                    {step.result && (
                      <pre
                        style={{
                          fontSize: 10,
                          color: C.textSub,
                          fontFamily: C.mono,
                          background: C.input,
                          borderRadius: 6,
                          padding: 10,
                          overflow: "auto",
                          maxHeight: 200,
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {JSON.stringify(step.result, null, 2)}
                      </pre>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Running progress bar */}
        {step.status === "running" && (
          <div
            style={{
              height: 2,
              background: `${color}20`,
              overflow: "hidden",
            }}
          >
            <motion.div
              style={{ height: "100%", background: color, borderRadius: 1 }}
              animate={{ x: ["-100%", "100%"] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
            />
          </div>
        )}
      </motion.div>
    );
  };

  /* ── PHASE: upload ───────────────────────────────────────── */
  if (phase === "upload") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 400,
          gap: 24,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontFamily: C.head,
              fontSize: "1.3rem",
              fontWeight: 700,
              color: C.text,
              marginBottom: 6,
              letterSpacing: "-0.025em",
            }}
          >
            Build a Pipeline
          </h2>
          <p style={{ fontSize: 12, color: C.textSub, maxWidth: 420 }}>
            Upload a CSV and DSAgent will suggest steps at each stage — cleaning,
            analysis, visualization, and modeling.
          </p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) handleUpload(f);
          }}
          onClick={() => fileRef.current?.click()}
          style={{
            width: "100%",
            maxWidth: 480,
            border: `1.5px dashed ${dragOver ? C.cyan : C.borderMd}`,
            borderRadius: 16,
            padding: "48px 32px",
            textAlign: "center",
            cursor: uploading ? "default" : "pointer",
            background: dragOver ? `${C.cyan}08` : C.card,
            transition: "all 0.2s",
          }}
        >
          {uploading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: `3px solid ${C.cyan}`,
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span style={{ fontSize: 12, color: C.textSub }}>Uploading & analyzing…</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.cyan, marginBottom: 6 }}>
                Drop your CSV here
              </div>
              <div style={{ fontSize: 11, color: C.textMute }}>or click to browse</div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>
    );
  }

  /* ── PHASE: build / run / done ───────────────────────────── */
  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 160px)" }}>

      {/* ── LEFT: Pipeline canvas ─────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 0,
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: C.card,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          {/* Editable pipeline name */}
          <input
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: C.text,
              fontFamily: C.head,
              fontSize: 13,
              fontWeight: 600,
              flex: 1,
              minWidth: 0,
            }}
          />

          {/* Dataset badge */}
          <span
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 5,
              background: `${C.cyan}15`,
              color: C.cyan,
              border: `1px solid ${C.cyan}30`,
              fontFamily: C.mono,
              flexShrink: 0,
            }}
          >
            {datasetLabel}
          </span>

          {/* Phase badge */}
          <span
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 5,
              background:
                phase === "done"
                  ? `${C.green}20`
                  : phase === "run"
                  ? `${C.amber}20`
                  : `${C.violet}15`,
              color:
                phase === "done" ? C.green : phase === "run" ? C.amber : C.violet,
              border: `1px solid ${
                phase === "done"
                  ? C.green + "40"
                  : phase === "run"
                  ? C.amber + "40"
                  : C.violet + "30"
              }`,
              fontFamily: C.mono,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {phase === "done" ? "✓ Complete" : phase === "run" ? "Running…" : "Draft"}
          </span>

          {/* Save button */}
          <button
            onClick={savePipeline}
            disabled={saving || steps.length === 0}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              border: `1px solid ${C.borderMd}`,
              background: saving ? C.border : "transparent",
              color: C.textSub,
              fontSize: 11,
              fontFamily: C.sans,
              cursor: steps.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              opacity: steps.length === 0 ? 0.4 : 1,
            }}
          >
            {saving ? "Saving…" : "💾 Save"}
          </button>

          {/* Run button */}
          {phase === "build" && (
            <button
              onClick={runPipeline}
              disabled={steps.length === 0}
              style={{
                padding: "6px 16px",
                borderRadius: 7,
                border: "none",
                background:
                  steps.length === 0
                    ? C.border
                    : `linear-gradient(135deg, ${C.cyan}, #0099CC)`,
                color: steps.length === 0 ? C.textMute : "#030712",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: C.head,
                cursor: steps.length === 0 ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              ▶ Run Pipeline
            </button>
          )}

          {/* Re-run button after done */}
          {phase === "done" && (
            <button
              onClick={() => {
                setSteps((prev) =>
                  prev.map((s) => ({ ...s, status: "pending", result: undefined, imageBase64: undefined }))
                );
                setPhase("build");
              }}
              style={{
                padding: "6px 14px",
                borderRadius: 7,
                border: `1px solid ${C.borderMd}`,
                background: "transparent",
                color: C.text,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: C.head,
                cursor: "pointer",
              }}
            >
              ↺ Reset
            </button>
          )}
        </div>

        {/* Steps canvas */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "2px 2px",
            scrollbarWidth: "thin",
            scrollbarColor: `${C.border} transparent`,
          }}
        >
          {steps.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: C.textMute,
                fontSize: 12,
                gap: 8,
                minHeight: 200,
              }}
            >
              <div style={{ fontSize: 28 }}>⚡</div>
              <div>Add steps from the suggestions panel →</div>
            </div>
          ) : (
            <AnimatePresence>
              {steps.map((step, idx) => renderStep(step, idx))}
            </AnimatePresence>
          )}
          <div ref={stepsEndRef} />
        </div>

        {/* Progress bar during run */}
        {phase === "run" && (
          <div
            style={{
              padding: "10px 14px",
              background: C.card,
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
                fontSize: 10,
                color: C.textSub,
                fontFamily: C.mono,
              }}
            >
              <span>Running pipeline…</span>
              <span>
                {steps.filter((s) => s.status === "done").length} / {steps.length} steps
              </span>
            </div>
            <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
              <motion.div
                style={{
                  height: "100%",
                  background: `linear-gradient(90deg, ${C.cyan}, ${C.violet})`,
                  borderRadius: 2,
                }}
                animate={{
                  width: `${(steps.filter((s) => s.status === "done").length / steps.length) * 100}%`,
                }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Suggestions panel ──────────────────────────── */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Suggestions header */}
        <div
          style={{
            padding: "12px 14px",
            background: C.card,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.head }}>
              🤖 AI Suggestions
            </span>
            <button
              onClick={() => fetchSuggestions(steps, datasetMeta, getLastResultSummary())}
              disabled={loadingSuggest}
              style={{
                background: "none",
                border: `1px solid ${C.borderMd}`,
                borderRadius: 5,
                padding: "3px 8px",
                color: C.cyan,
                fontSize: 10,
                fontFamily: C.mono,
                cursor: "pointer",
                opacity: loadingSuggest ? 0.5 : 1,
              }}
            >
              {loadingSuggest ? "…" : "↻ Refresh"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: C.textMute, margin: 0, lineHeight: 1.5 }}>
            Click a suggestion to add it to your pipeline.
          </p>
        </div>

        {/* Suggestion cards */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            scrollbarWidth: "thin",
            scrollbarColor: `${C.border} transparent`,
          }}
        >
          {loadingSuggest && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "4px 0",
              }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 80,
                    borderRadius: 10,
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    animation: "shimmer 1.4s ease-in-out infinite",
                    opacity: 1 - i * 0.15,
                  }}
                />
              ))}
            </div>
          )}

          {!loadingSuggest && suggestions.length === 0 && (
            <div
              style={{
                padding: 16,
                textAlign: "center",
                color: C.textMute,
                fontSize: 11,
                background: C.card,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
              }}
            >
              {phase === "done"
                ? "✓ Pipeline complete! All major steps have been added."
                : "No more suggestions. Click ↻ Refresh to get new ones."}
            </div>
          )}

          <AnimatePresence>
            {suggestions.map((s, i) => (
              <SuggestionCard
                key={s.tool + i}
                suggestion={s}
                onAdd={() => addStep(s)}
                disabled={phase === "run"}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Dataset meta summary */}
        <div
          style={{
            padding: "12px 14px",
            background: C.card,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textMute, marginBottom: 6, fontFamily: C.mono, letterSpacing: "0.07em" }}>
            DATASET
          </div>
          <pre
            style={{
              fontSize: 9.5,
              color: C.textSub,
              fontFamily: C.mono,
              margin: 0,
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {datasetMeta}
          </pre>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────── */

function StatusBadge({
  status,
  color,
}: {
  status: PipelineStep["status"];
  color: string;
}) {
  const configs = {
    pending: { label: "Pending", bg: C.border, textColor: C.textMute },
    running: { label: "Running", bg: `${color}20`, textColor: color },
    done: { label: "Done", bg: `${C.green}20`, textColor: C.green },
    error: { label: "Error", bg: `${C.red}20`, textColor: C.red },
  };
  const cfg = configs[status];
  return (
    <span
      style={{
        fontSize: 9,
        padding: "2px 7px",
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.textColor,
        fontFamily: C.mono,
        fontWeight: 600,
        letterSpacing: "0.04em",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {status === "running" && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: color,
            animation: "pls 1.2s ease-in-out infinite",
          }}
        />
      )}
      {cfg.label}
    </span>
  );
}

function SuggestionCard({
  suggestion,
  onAdd,
  disabled,
}: {
  suggestion: any;
  onAdd: () => void;
  disabled: boolean;
}) {
  const [hov, setHov] = useState(false);
  const color = CATEGORY_COLOR[suggestion.category] || C.textSub;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={disabled ? undefined : onAdd}
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: hov && !disabled ? C.cardHover : C.card,
        border: `1px solid ${hov && !disabled ? color + "55" : C.border}`,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{CATEGORY_ICON[suggestion.category] || "⚙️"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.head, flex: 1 }}>
          {suggestion.label}
        </span>
        <span
          style={{
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 4,
            background: `${color}18`,
            color,
            fontFamily: C.mono,
            fontWeight: 600,
            border: `1px solid ${color}33`,
          }}
        >
          {suggestion.category}
        </span>
      </div>
      <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, marginBottom: 6 }}>
        {suggestion.tool}
      </div>
      <div style={{ fontSize: 10.5, color: C.textSub, lineHeight: 1.55 }}>{suggestion.reason}</div>
      {hov && !disabled && (
        <div style={{ marginTop: 8, fontSize: 10, color, fontFamily: C.mono, fontWeight: 600 }}>
          + Add to pipeline →
        </div>
      )}
    </motion.div>
  );
}