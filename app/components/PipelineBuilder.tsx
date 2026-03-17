// app/components/PipelineBuilder.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const C = {
  bg: "#0E0E0E", card: "#141414", cardHover: "#181818", input: "#1A1A1A", pill: "#1F1F1F",
  border: "rgba(255,255,255,0.06)", borderMd: "rgba(255,255,255,0.10)", borderHi: "rgba(255,255,255,0.16)",
  text: "#F2F2F2", textSub: "#8C8C8C", textMute: "#4A4A4A",
  cyan: "#00D4FF", violet: "#8B5CF6", green: "#3FB950", amber: "#D29922", red: "#F85149",
  mono: "'JetBrains Mono', monospace", sans: "'Inter', system-ui, sans-serif", head: "'Sora', 'Inter', sans-serif",
};

const CATEGORY_COLOR: Record<string, string> = { cleaning: C.amber, eda: C.cyan, visualization: C.violet, modeling: C.green };
const CATEGORY_ICON: Record<string, string>  = { cleaning: "🧹", eda: "🔍", visualization: "📊", modeling: "🤖" };

export type PipelineStep = {
  id: string; tool: string; label: string; args: Record<string, any>;
  reason: string; category: string;
  status: "pending" | "running" | "done" | "error";
  result?: any; imageBase64?: string; executionMs?: number; errorMsg?: string;
};

interface PipelineBuilderProps { onSaved?: (pipelineId: string) => void; }

/* ── Pretty JSON renderer ─────────────────────────────────────── */
function PrettyJSON({ data, depth = 0 }: { data: any; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (data === null)             return <span style={{ color: C.red }}>null</span>;
  if (typeof data === "boolean") return <span style={{ color: C.amber }}>{String(data)}</span>;
  if (typeof data === "number")  return <span style={{ color: C.cyan }}>{data}</span>;
  if (typeof data === "string") {
    const d = data.length > 100 ? data.slice(0, 100) + "…" : data;
    return <span style={{ color: C.green }}>"{d}"</span>;
  }

  const toggle = (
    <button onClick={() => setCollapsed(c => !c)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMute, fontFamily: C.mono, fontSize: 10, padding: "0 2px", lineHeight: 1 }}>
      {collapsed ? "▶" : "▼"}
    </button>
  );

  if (Array.isArray(data)) {
    if (!data.length) return <span style={{ color: C.textSub }}>[]</span>;
    return (
      <span>
        {toggle}<span style={{ color: C.textSub }}>[</span>
        {collapsed ? (
          <span style={{ color: C.textMute, cursor: "pointer" }} onClick={() => setCollapsed(false)}> {data.length} items </span>
        ) : (
          data.map((item, i) => (
            <div key={i} style={{ paddingLeft: 14 }}>
              <PrettyJSON data={item} depth={depth + 1} />
              {i < data.length - 1 && <span style={{ color: C.textMute }}>,</span>}
            </div>
          ))
        )}
        <span style={{ color: C.textSub }}>]</span>
      </span>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (!keys.length) return <span style={{ color: C.textSub }}>{"{}"}</span>;
    return (
      <span>
        {toggle}<span style={{ color: C.textSub }}>{"{"}</span>
        {collapsed ? (
          <span style={{ color: C.textMute, cursor: "pointer" }} onClick={() => setCollapsed(false)}> {keys.length} keys </span>
        ) : (
          keys.map((key, i) => (
            <div key={key} style={{ paddingLeft: 14 }}>
              <span style={{ color: C.violet }}>"{key}"</span>
              <span style={{ color: C.textSub }}>: </span>
              <PrettyJSON data={data[key]} depth={depth + 1} />
              {i < keys.length - 1 && <span style={{ color: C.textMute }}>,</span>}
            </div>
          ))
        )}
        <span style={{ color: C.textSub }}>{"}"}</span>
      </span>
    );
  }

  return <span style={{ color: C.textSub }}>{String(data)}</span>;
}

/* ── Main component ───────────────────────────────────────────── */
export default function PipelineBuilder({ onSaved }: PipelineBuilderProps) {
  const [phase, setPhase]               = useState<"upload"|"build"|"run"|"done">("upload");
  const [sessionId, setSessionId]       = useState<string | null>(null);
  const [datasetMeta, setDatasetMeta]   = useState("");
  const [datasetLabel, setDatasetLabel] = useState("");
  const [steps, setSteps]               = useState<PipelineStep[]>([]);
  const [suggestions, setSuggestions]   = useState<any[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [pipelineName, setPipelineName] = useState("My Pipeline");
  const [pipelineId, setPipelineId]     = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [dragOver, setDragOver]         = useState(false);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [runningFromIdx, setRunningFromIdx] = useState<number | null>(null);

  const fileRef     = useRef<HTMLInputElement>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stepsEndRef.current && steps.length > 0)
      stepsEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [steps.length]);

  /* upload */
  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
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
      await fetchSuggestions([], metaSummary, "Dataset just uploaded.");
    } catch (e) { console.error(e); }
    finally { setUploading(false); }
  };

  /* suggestions */
  const fetchSuggestions = async (currentSteps: PipelineStep[], meta: string, lastResult: string) => {
    setLoadingSuggest(true); setSuggestions([]);
    try {
      const res = await fetch("/api/pipelines/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedSteps: currentSteps.map(s => ({ tool: s.tool, label: s.label })), datasetMeta: meta, lastResult }),
      });
      const data = await res.json();
      const existing = new Set(currentSteps.map(s => s.tool));
      setSuggestions((data.suggestions || []).filter((s: any) => !existing.has(s.tool)));
    } catch (e) { console.error(e); }
    finally { setLoadingSuggest(false); }
  };

  const addStep = (suggestion: any) => {
    setSteps(prev => [...prev, { id: `step-${Date.now()}-${Math.random()}`, tool: suggestion.tool, label: suggestion.label, args: suggestion.args || {}, reason: suggestion.reason, category: suggestion.category, status: "pending" }]);
    setSuggestions(prev => prev.filter(s => s.tool !== suggestion.tool));
  };

  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));
  const updateArg  = (stepId: string, key: string, value: string) =>
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, args: { ...s.args, [key]: value } } : s));

  /* save */
  const savePipelineToDb = async (currentSteps: PipelineStep[], status: string, existingId?: string | null): Promise<string | null> => {
    try {
      const payload = currentSteps.map(s => ({ tool: s.tool, label: s.label, args: s.args, category: s.category, reason: s.reason }));
      if (!existingId) {
        const res  = await fetch("/api/pipelines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pipelineName, sessionId, metadata: { datasetMeta } }) });
        const data = await res.json();
        const newId = data.pipeline?.id;
        if (!newId) return null;
        await fetch(`/api/pipelines/${newId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: payload, status }) });
        setPipelineId(newId); onSaved?.(newId); return newId;
      } else {
        await fetch(`/api/pipelines/${existingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pipelineName, steps: payload, status }) });
        return existingId;
      }
    } catch (e) { console.error(e); return null; }
  };

  const handleManualSave = async () => {
    if (!steps.length) return;
    setSaving(true); setSaveMsg(null);
    const id = await savePipelineToDb(steps, phase === "done" ? "completed" : "draft", pipelineId);
    setSaving(false); setSaveMsg(id ? "Saved ✓" : "Failed");
    setTimeout(() => setSaveMsg(null), 2000);
  };

  const saveRunHistory = async (pid: string, results: any[]) => {
    try {
      await fetch(`/api/pipelines/${pid}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, stepResults: results }) });
    } catch (e) { console.warn(e); }
  };

  /* ── core run loop — startIdx allows mid-pipeline resume ─── */
  const runStepsFrom = async (startIdx: number) => {
    if (!sessionId) return;
    setPhase("run"); setRunningFromIdx(startIdx);

    // snapshot steps at call time so we read the latest args
    const snapshot = [...steps];

    // reset from startIdx onwards
    setSteps(prev => prev.map((s, i) =>
      i >= startIdx ? { ...s, status: "pending", result: undefined, imageBase64: undefined, errorMsg: undefined } : s
    ));

    const runResults: any[] = [];

    for (let i = startIdx; i < snapshot.length; i++) {
      setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: "running" } : s));

      const step = snapshot[i];
      const args: Record<string, any> = { session_id: sessionId };
      for (const [k, v] of Object.entries(step.args)) {
        if (String(v).trim() !== "") args[k] = v;
      }

      try {
        const res    = await fetch("/api/agent/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool_name: step.tool, arguments: args }) });
        const result = await res.json();

        const img64   = result?.output?.image_base64 || result?.output?.chart_base64;
        const clean   = result.output ? Object.fromEntries(Object.entries(result.output).filter(([k]) => k !== "image_base64" && k !== "chart_base64")) : null;
        const errMsg  = result.success ? undefined : (result.error || result.details || "Tool failed");

        setSteps(prev => prev.map((s, idx) => idx === i ? {
          ...s,
          status: result.success ? "done" : "error",
          result: clean,
          imageBase64: img64 ? (img64.startsWith("data:") ? img64 : `data:image/png;base64,${img64}`) : undefined,
          executionMs: result.execution_time_ms,
          errorMsg: errMsg,
        } : s));

        runResults.push({ tool: step.tool, success: result.success, executionMs: result.execution_time_ms, errorMsg: errMsg });
        await new Promise(r => setTimeout(r, 180));
      } catch (err: any) {
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: "error", errorMsg: err.message } : s));
        runResults.push({ tool: step.tool, success: false, errorMsg: err.message });
      }
    }

    setRunningFromIdx(null);
    setPhase("done");

    const finalId = await savePipelineToDb(snapshot, "completed", pipelineId);
    if (finalId) { setPipelineId(finalId); await saveRunHistory(finalId, runResults); }
  };

  const runAll  = async () => { const id = await savePipelineToDb(steps, "running", pipelineId); if (id) setPipelineId(id); await runStepsFrom(0); };
  const runFrom = async (idx: number) => { const id = await savePipelineToDb(steps, "running", pipelineId); if (id) setPipelineId(id); await runStepsFrom(idx); };
  const resetAll = () => { setSteps(prev => prev.map(s => ({ ...s, status: "pending", result: undefined, imageBase64: undefined, errorMsg: undefined }))); setPhase("build"); setRunningFromIdx(null); };

  const getLastResultSummary = () => {
    const last = [...steps].reverse().find(s => s.status === "done");
    return last?.result ? JSON.stringify(last.result).slice(0, 400) : "";
  };

  const doneCount  = steps.filter(s => s.status === "done").length;
  const errCount   = steps.filter(s => s.status === "error").length;
  const isRunning  = phase === "run";

  /* ── UPLOAD PHASE ─────────────────────────────────────────── */
  if (phase === "upload") {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: C.head, fontSize: "1.3rem", fontWeight: 700, color: C.text, marginBottom: 6, letterSpacing: "-0.025em" }}>Build a Pipeline</h2>
          <p style={{ fontSize: 12, color: C.textSub, maxWidth: 400, lineHeight: 1.6 }}>
            Upload a CSV — DSAgent will suggest cleaning, analysis, visualization and modeling steps automatically.
          </p>
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
          onClick={() => fileRef.current?.click()}
          style={{ width: "100%", maxWidth: 460, border: `2px dashed ${dragOver ? C.cyan : C.borderMd}`, borderRadius: 16, padding: "48px 32px", textAlign: "center", cursor: uploading ? "default" : "pointer", background: dragOver ? `${C.cyan}08` : C.card, transition: "all 0.2s" }}>
          {uploading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${C.cyan}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 12, color: C.textSub }}>Uploading & analyzing…</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.cyan, marginBottom: 6 }}>Drop CSV here</div>
              <div style={{ fontSize: 11, color: C.textMute }}>or click to browse</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>
    );
  }

  /* ── BUILD / RUN / DONE ───────────────────────────────────── */
  return (
    <div style={{ display: "flex", gap: 16, height: "100%", overflow: "hidden" }}>

      {/* LEFT: canvas */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, overflow: "hidden" }}>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap" }}>
          <input value={pipelineName} onChange={e => setPipelineName(e.target.value)}
            style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: C.head, fontSize: 13, fontWeight: 600, flex: 1, minWidth: 100 }} />

          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: `${C.cyan}15`, color: C.cyan, border: `1px solid ${C.cyan}30`, fontFamily: C.mono, flexShrink: 0 }}>{datasetLabel}</span>

          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, fontFamily: C.mono, fontWeight: 600, flexShrink: 0, background: phase === "done" ? `${C.green}20` : isRunning ? `${C.amber}20` : `${C.violet}15`, color: phase === "done" ? C.green : isRunning ? C.amber : C.violet, border: `1px solid ${phase === "done" ? C.green + "40" : isRunning ? C.amber + "40" : C.violet + "30"}` }}>
            {phase === "done" ? `✓ ${doneCount}/${steps.length}` : isRunning ? `Running… ${doneCount}/${steps.length}` : `${steps.length} steps`}
          </span>

          <button onClick={handleManualSave} disabled={saving || !steps.length}
            style={{ padding: "5px 11px", borderRadius: 6, border: `1px solid ${C.borderMd}`, background: saveMsg === "Saved ✓" ? `${C.green}20` : "transparent", color: saveMsg === "Saved ✓" ? C.green : C.textSub, fontSize: 11, fontFamily: C.sans, cursor: !steps.length ? "not-allowed" : "pointer", opacity: !steps.length ? 0.4 : 1, transition: "all 0.2s", flexShrink: 0 }}>
            {saving ? "…" : saveMsg || "💾 Save"}
          </button>

          {!isRunning && (
            <button onClick={runAll} disabled={!steps.length}
              style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: !steps.length ? C.border : `linear-gradient(135deg, ${C.cyan}, #0099CC)`, color: !steps.length ? C.textMute : "#030712", fontSize: 11, fontWeight: 700, fontFamily: C.head, cursor: !steps.length ? "not-allowed" : "pointer", flexShrink: 0 }}>
              ▶ Run All
            </button>
          )}

          {(phase === "done" || isRunning) && (
            <button onClick={resetAll} disabled={isRunning}
              style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.borderMd}`, background: "transparent", color: C.text, fontSize: 11, fontWeight: 600, fontFamily: C.head, cursor: isRunning ? "not-allowed" : "pointer", opacity: isRunning ? 0.5 : 1, flexShrink: 0 }}>
              ↺ Reset
            </button>
          )}
        </div>

        {/* Progress */}
        {isRunning && (
          <div style={{ padding: "8px 14px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 10, color: C.textSub, fontFamily: C.mono }}>
              <span>Running from step {(runningFromIdx ?? 0) + 1}…</span>
              <span>{doneCount + errCount}/{steps.length} · {errCount > 0 ? `${errCount} error(s)` : "no errors"}</span>
            </div>
            <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
              <motion.div style={{ height: "100%", background: `linear-gradient(90deg,${C.cyan},${C.violet})`, borderRadius: 2 }}
                animate={{ width: `${((doneCount + errCount) / steps.length) * 100}%` }} transition={{ duration: 0.4 }} />
            </div>
          </div>
        )}

        {/* Done banner */}
        {phase === "done" && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: "10px 14px", background: `${C.green}10`, borderRadius: 8, border: `1px solid ${C.green}30`, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span>✅</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.green, fontFamily: C.head }}>Pipeline complete</span>
            <span style={{ fontSize: 10, color: C.textSub, fontFamily: C.mono }}>{doneCount} ok · {errCount} failed</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => fetchSuggestions(steps, datasetMeta, getLastResultSummary())}
              style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.cyan}33`, background: `${C.cyan}10`, color: C.cyan, fontSize: 10, fontFamily: C.mono, cursor: "pointer" }}>
              Get next steps →
            </button>
          </motion.div>
        )}

        {/* Steps */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 2, scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
          {steps.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.textMute, fontSize: 12, gap: 8, minHeight: 200 }}>
              <div style={{ fontSize: 28 }}>⚡</div>
              <div>Add steps from the suggestions panel →</div>
            </div>
          ) : (
            <AnimatePresence>
              {steps.map((step, idx) => (
                <StepCard key={step.id} step={step} idx={idx} phase={phase} isRunning={isRunning}
                  expanded={expandedResult === step.id}
                  onToggleExpand={() => setExpandedResult(expandedResult === step.id ? null : step.id)}
                  onRemove={() => removeStep(step.id)}
                  onUpdateArg={(k, v) => updateArg(step.id, k, v)}
                  onRunFrom={() => runFrom(idx)}
                />
              ))}
            </AnimatePresence>
          )}
          <div ref={stepsEndRef} style={{ height: 1 }} />
        </div>
      </div>

      {/* RIGHT: suggestions */}
      <div style={{ width: 288, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.head }}>🤖 AI Suggestions</span>
            <button onClick={() => fetchSuggestions(steps, datasetMeta, getLastResultSummary())} disabled={loadingSuggest}
              style={{ background: "none", border: `1px solid ${C.borderMd}`, borderRadius: 5, padding: "3px 8px", color: C.cyan, fontSize: 10, fontFamily: C.mono, cursor: "pointer", opacity: loadingSuggest ? 0.5 : 1 }}>
              {loadingSuggest ? "…" : "↻"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: C.textMute, margin: 0, lineHeight: 1.5 }}>Click a card to add it to the pipeline.</p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7, scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
          {loadingSuggest && [1,2,3].map(i => (
            <div key={i} style={{ height: 76, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, opacity: 0.3 + i * 0.1, animation: "shimmer 1.4s ease-in-out infinite" }} />
          ))}
          {!loadingSuggest && !suggestions.length && (
            <div style={{ padding: 14, textAlign: "center", color: C.textMute, fontSize: 11, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
              {phase === "done" ? "✓ Done. Click ↻ for more." : "No suggestions. Click ↻ Refresh."}
            </div>
          )}
          <AnimatePresence>
            {suggestions.map((s, i) => <SuggestionCard key={s.tool + i} suggestion={s} onAdd={() => addStep(s)} disabled={isRunning} />)}
          </AnimatePresence>
        </div>

        <div style={{ padding: "10px 12px", background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.textMute, marginBottom: 5, fontFamily: C.mono, letterSpacing: "0.07em" }}>DATASET</div>
          <pre style={{ fontSize: 9.5, color: C.textSub, fontFamily: C.mono, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{datasetMeta}</pre>
        </div>
      </div>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%,100%{opacity:0.3} 50%{opacity:0.6} }
        @keyframes pls     { 0%,100%{opacity:1}   50%{opacity:0.2} }
      `}</style>
    </div>
  );
}

/* ── StepCard ────────────────────────────────────────────────── */
function StepCard({ step, idx, phase, isRunning, expanded, onToggleExpand, onRemove, onUpdateArg, onRunFrom }:
  { step: PipelineStep; idx: number; phase: string; isRunning: boolean; expanded: boolean;
    onToggleExpand: () => void; onRemove: () => void; onUpdateArg: (k:string,v:string)=>void; onRunFrom: ()=>void; }) {

  const color = CATEGORY_COLOR[step.category] || C.textSub;
  const [hovRun, setHovRun] = useState(false);

  const borderColor = step.status === "running" ? color + "88" : step.status === "done" ? color + "44" : step.status === "error" ? C.red + "55" : C.border;
  const bgHdr       = step.status === "running" ? `${color}08` : step.status === "done" ? `${color}04` : step.status === "error" ? `${C.red}06` : "transparent";

  // Show "run from here" on pending/error steps when not currently running, and it's not the very first step
  const canRunFrom = !isRunning && (step.status === "pending" || step.status === "error") && idx > 0;

  return (
    <motion.div layout initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:12 }} transition={{ duration:0.2 }}
      style={{ background: C.card, border: `1px solid ${borderColor}`, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", background: bgHdr }}>
        <div style={{ width: 20, height: 20, borderRadius: 5, background: `${color}22`, border: `1px solid ${color}44`, display:"flex",alignItems:"center",justifyContent:"center", fontSize:9, fontWeight:700, color, fontFamily:C.mono, flexShrink:0 }}>{idx + 1}</div>
        <span style={{ fontSize: 13, flexShrink: 0 }}>{CATEGORY_ICON[step.category] || "⚙️"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.head, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{step.label}</div>
          <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono }}>{step.tool}</div>
        </div>

        {/* ▶ from here */}
        {canRunFrom && (
          <button onClick={onRunFrom} onMouseEnter={() => setHovRun(true)} onMouseLeave={() => setHovRun(false)}
            style={{ padding:"3px 8px", borderRadius:5, border:`1px solid ${hovRun ? color+"66" : C.border}`, background: hovRun ? `${color}18` : "transparent", color: hovRun ? color : C.textMute, fontSize:9, fontFamily:C.mono, cursor:"pointer", transition:"all 0.15s", flexShrink:0, display:"flex", alignItems:"center", gap:3 }}>
            ▶ from here
          </button>
        )}

        <StatusBadge status={step.status} color={color} />

        {step.executionMs && <span style={{ fontSize:9, color:C.textMute, fontFamily:C.mono, flexShrink:0 }}>{step.executionMs}ms</span>}

        {!isRunning && phase !== "run" && (
          <button onClick={onRemove}
            style={{ background:"none", border:"none", color:C.textMute, cursor:"pointer", fontSize:11, padding:"2px 4px", borderRadius:4, lineHeight:1, flexShrink:0 }}
            onMouseEnter={e => (e.currentTarget.style.color = C.red)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textMute)}>✕</button>
        )}
      </div>

      {/* Error */}
      {step.status === "error" && step.errorMsg && (
        <div style={{ padding:"6px 12px", background:`${C.red}08`, borderTop:`1px solid ${C.red}22`, fontSize:10, color:C.red, fontFamily:C.mono, lineHeight:1.5, wordBreak:"break-word" }}>
          ⚠ {step.errorMsg.slice(0, 300)}
        </div>
      )}

      {/* Args */}
      {!isRunning && Object.keys(step.args).length > 0 && (
        <div style={{ padding:"8px 12px", borderTop:`1px solid ${C.border}`, display:"flex", flexWrap:"wrap", gap:8 }}>
          {Object.entries(step.args).map(([key, val]) => (
            <div key={key} style={{ display:"flex", flexDirection:"column", gap:2 }}>
              <label style={{ fontSize:9, color:C.textMute, fontFamily:C.mono, letterSpacing:"0.05em" }}>{key}</label>
              <input value={String(val)} onChange={e => onUpdateArg(key, e.target.value)}
                style={{ background:C.input, border:`1px solid ${C.border}`, borderRadius:5, padding:"3px 7px", color:C.text, fontSize:11, fontFamily:C.mono, outline:"none", width:150 }} />
            </div>
          ))}
        </div>
      )}

      {/* Reason */}
      <div style={{ padding:"5px 12px 8px", fontSize:10, color:C.textMute, fontFamily:C.sans, borderTop:`1px solid ${C.border}`, fontStyle:"italic", lineHeight:1.5 }}>{step.reason}</div>

      {/* Result */}
      {(step.result || step.imageBase64) && (
        <div style={{ borderTop:`1px solid ${C.border}` }}>
          <button onClick={onToggleExpand}
            style={{ width:"100%", padding:"6px 12px", background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color, fontSize:10, fontFamily:C.mono, textAlign:"left" }}>
            {expanded ? "▲" : "▼"} View Result
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.18 }} style={{ overflow:"hidden" }}>
                <div style={{ padding:"0 12px 12px" }}>
                  {step.imageBase64 && (
                    <img src={step.imageBase64} alt="Result" style={{ width:"100%", borderRadius:7, marginBottom:10, border:`1px solid ${C.border}` }} />
                  )}
                  {step.result && (
                    <div style={{ background:"#080808", borderRadius:7, padding:"10px 12px", border:`1px solid ${C.border}`, overflow:"auto", maxHeight:340, fontSize:11, fontFamily:C.mono, lineHeight:1.7 }}>
                      <PrettyJSON data={step.result} depth={0} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Running bar */}
      {step.status === "running" && (
        <div style={{ height:2, background:`${color}20`, overflow:"hidden" }}>
          <motion.div style={{ height:"100%", background:color }} animate={{ x:["-100%","100%"] }} transition={{ repeat:Infinity, duration:1.1, ease:"linear" }} />
        </div>
      )}
    </motion.div>
  );
}

/* ── StatusBadge ─────────────────────────────────────────────── */
function StatusBadge({ status, color }: { status: PipelineStep["status"]; color: string }) {
  const m = { pending:{label:"Pending",bg:C.border,tc:C.textMute}, running:{label:"Running",bg:`${color}22`,tc:color}, done:{label:"Done",bg:`${C.green}22`,tc:C.green}, error:{label:"Error",bg:`${C.red}22`,tc:C.red} };
  const cfg = m[status];
  return (
    <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:cfg.bg, color:cfg.tc, fontFamily:C.mono, fontWeight:600, flexShrink:0, display:"flex", alignItems:"center", gap:4 }}>
      {status === "running" && <span style={{ width:5, height:5, borderRadius:"50%", background:color, animation:"pls 1.2s ease-in-out infinite" }} />}
      {cfg.label}
    </span>
  );
}

/* ── SuggestionCard ──────────────────────────────────────────── */
function SuggestionCard({ suggestion, onAdd, disabled }: { suggestion:any; onAdd:()=>void; disabled:boolean }) {
  const [hov, setHov] = useState(false);
  const color = CATEGORY_COLOR[suggestion.category] || C.textSub;
  return (
    <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, scale:0.95 }} transition={{ duration:0.18 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={disabled ? undefined : onAdd}
      style={{ padding:"10px 12px", borderRadius:9, background: hov&&!disabled ? C.cardHover : C.card, border:`1px solid ${hov&&!disabled ? color+"55" : C.border}`, cursor: disabled?"not-allowed":"pointer", transition:"all 0.15s", opacity: disabled?0.5:1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
        <span style={{ fontSize:13 }}>{CATEGORY_ICON[suggestion.category]||"⚙️"}</span>
        <span style={{ fontSize:12, fontWeight:600, color:C.text, fontFamily:C.head, flex:1 }}>{suggestion.label}</span>
        <span style={{ fontSize:9, padding:"2px 5px", borderRadius:4, background:`${color}18`, color, fontFamily:C.mono, fontWeight:600, border:`1px solid ${color}33` }}>{suggestion.category}</span>
      </div>
      <div style={{ fontSize:9.5, color:C.textMute, fontFamily:C.mono, marginBottom:4 }}>{suggestion.tool}</div>
      <div style={{ fontSize:10, color:C.textSub, lineHeight:1.5 }}>{suggestion.reason}</div>
      {hov && !disabled && <div style={{ marginTop:7, fontSize:10, color, fontFamily:C.mono, fontWeight:600 }}>+ Add to pipeline →</div>}
    </motion.div>
  );
} 