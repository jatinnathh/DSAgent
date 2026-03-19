// app/components/PipelineBuilder.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";

/* ── Design tokens ─────────────────────────────────────────────── */
const C = {
  bg: "#0A0A0A", card: "#111111", cardHover: "#161616", input: "#1A1A1A",
  border: "rgba(255,255,255,0.06)", borderMd: "rgba(255,255,255,0.10)", borderHi: "rgba(255,255,255,0.18)",
  text: "#F0F0F0", textSub: "#888888", textMute: "#444444",
  cyan: "#00D4FF", violet: "#8B5CF6", green: "#3FB950", amber: "#F59E0B", red: "#F85149",
  pink: "#EC4899", teal: "#14B8A6",
  mono: "'JetBrains Mono', monospace", sans: "'Inter', system-ui, sans-serif",
  head: "'Sora', 'Inter', sans-serif",
};

const CAT_COLOR: Record<string, string> = {
  cleaning: C.amber, eda: C.cyan, visualization: C.violet, modeling: C.green, preprocessing: C.pink,
};
const CAT_ICON: Record<string, string> = {
  cleaning: "🧹", eda: "🔍", visualization: "📊", modeling: "🤖", preprocessing: "⚙️",
};
const COL_ARG_MAP: Record<string, "all" | "numeric" | "categorical"> = {
  column: "all", target_column: "all", x_column: "numeric", y_column: "numeric",
  group_by: "categorical", columns_to_encode: "categorical", columns_to_scale: "numeric", feature_columns: "numeric",
};

export const ADVANCED_TOOLS: Record<string, { label: string; category: string; args: Record<string, any>; reason: string }> = {
  standard_scaler:      { label: "Standard Scaler (Z-score)",          category: "preprocessing", args: { columns_to_scale: "" },                                       reason: "Standardize numeric features to zero mean and unit variance. Required before SVM, PCA, regularized models." },
  min_max_scaler:       { label: "Min-Max Scaler [0,1]",               category: "preprocessing", args: { columns_to_scale: "", feature_range_min: "0", feature_range_max: "1" }, reason: "Rescale features to [0,1] range. Good for neural nets and distance-based algorithms." },
  robust_scaler:        { label: "Robust Scaler (IQR)",                category: "preprocessing", args: { columns_to_scale: "" },                                       reason: "Scale using median and IQR — resistant to outliers." },
  log_transform:        { label: "Log Transform (skew fix)",           category: "preprocessing", args: { column: "" },                                                 reason: "Apply log1p transform to reduce right skew in distributions." },
  one_hot_encode:       { label: "One-Hot Encoding",                   category: "preprocessing", args: { columns_to_encode: "", drop_first: "true" },                  reason: "Convert categorical columns to binary dummy variables." },
  label_encode:         { label: "Label Encoding (ordinal)",           category: "preprocessing", args: { column: "" },                                                 reason: "Map categories to integers." },
  pca_transform:        { label: "PCA Dimensionality Reduction",       category: "preprocessing", args: { n_components: "5", target_column: "" },                      reason: "Reduce feature dimensions via PCA, retaining variance." },
  polynomial_features:  { label: "Polynomial Features",               category: "preprocessing", args: { columns_to_scale: "", degree: "2" },                          reason: "Create interaction and polynomial terms (x², x·y)." },
  drop_columns:         { label: "Drop Columns",                       category: "cleaning",      args: { column: "" },                                                 reason: "Remove a column from the dataset to reduce noise or eliminate leakage." },
  train_test_split:     { label: "Train/Test Split",                   category: "preprocessing", args: { target_column: "", test_size: "0.2", stratify: "false" },     reason: "Split dataset into train/test sets." },
  auto_ml_pipeline:     { label: "AutoML Pipeline",                   category: "modeling",      args: { target_column: "", cv_folds: "3" },                           reason: "Train Random Forest, XGBoost, LightGBM with 3-fold CV. Fast mode — best for exploration." },
  cross_validate_model: { label: "Cross-Validate Best Model",         category: "modeling",      args: { target_column: "", model: "random_forest", cv_folds: "5" },   reason: "Run k-fold cross-validation on the cleaned data." },
  hyperparameter_tune:  { label: "Hyperparameter Tuning (Grid Search)",category: "modeling",      args: { target_column: "", model: "random_forest", cv_folds: "3" },   reason: "Grid search for optimal hyperparameters." },
  feature_importance:   { label: "Feature Importance",                category: "modeling",      args: { target_column: "" },                                          reason: "Train a Random Forest to rank features by predictive importance." },
  model_evaluation:     { label: "Model Evaluation Report",           category: "modeling",      args: { target_column: "", model: "random_forest" },                  reason: "Accuracy, F1, Precision, Recall, ROC-AUC for classifiers; RMSE, MAE, R² for regressors." },
};

/* ── Types ─────────────────────────────────────────────────────── */
export type PipelineStep = {
  id: string; tool: string; label: string; args: Record<string, any>;
  reason: string; category: string;
  status: "pending" | "running" | "done" | "error";
  result?: any; imageBase64?: string; executionMs?: number; errorMsg?: string;
  aiSummary?: string; loadingSummary?: boolean;
};
interface DatasetColumns { all: string[]; numeric: string[]; categorical: string[]; }
interface InitialPipeline { id: string; name: string; sessionId?: string | null; status: string; steps: any[]; metadata?: any; }
interface PipelineBuilderProps { onSaved?: (pipelineId: string) => void; initialPipeline?: InitialPipeline; }

/* ── Request Flow store ─────────────────────────────────────────── */
type RequestType = "llm" | "tool" | "upload" | "pipeline_start" | "pipeline_end";
interface RFEntry {
  id: string; type: RequestType; label: string; detail?: string;
  status: "pending" | "success" | "error" | "running";
  timestamp: Date; durationMs?: number; pipelineId?: string; pipelineName?: string;
}

const _rfStore: RFEntry[] = [];
let _rfListeners: (() => void)[] = [];

function addRF(e: Omit<RFEntry, "id" | "timestamp">): string {
  const full: RFEntry = { ...e, id: `rf-${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: new Date() };
  _rfStore.unshift(full);
  if (_rfStore.length > 300) _rfStore.pop();
  _rfListeners.forEach(f => f());
  return full.id;
}
function updateRF(id: string, patch: Partial<RFEntry>) {
  const i = _rfStore.findIndex(e => e.id === id);
  if (i >= 0) { Object.assign(_rfStore[i], patch); _rfListeners.forEach(f => f()); }
}
function useRF() {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick(v => v + 1);
    _rfListeners.push(fn);
    return () => { _rfListeners = _rfListeners.filter(f => f !== fn); };
  }, []);
  return _rfStore as readonly RFEntry[];
}

const RF_CFG: Record<RequestType, { icon: string; color: string; label: string }> = {
  llm:            { icon: "🤖", color: C.violet, label: "LLM Call" },
  tool:           { icon: "⚙️", color: C.cyan,   label: "Tool Exec" },
  upload:         { icon: "📂", color: C.amber,  label: "Upload" },
  pipeline_start: { icon: "▶",  color: C.green,  label: "Pipeline" },
  pipeline_end:   { icon: "✅", color: C.green,  label: "Complete" },
};

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ── Request Flow Panel ─────────────────────────────────────────── */
function RequestFlowPanel({ onClose }: { onClose: () => void }) {
  const flows = useRF();
  const [expandedPipeline, setExpandedPipeline] = useState<string | null>(null);
  const [filter, setFilter] = useState<RequestType | "all">("all");

  const llmCount     = flows.filter(f => f.type === "llm").length;
  const toolCount    = flows.filter(f => f.type === "tool").length;
  const errorCount   = flows.filter(f => f.status === "error").length;
  const runningCount = flows.filter(f => f.status === "running").length;

  const pipelineMap: Record<string, RFEntry[]> = {};
  const standalone: RFEntry[] = [];
  flows.forEach(f => {
    if (f.pipelineId) {
      if (!pipelineMap[f.pipelineId]) pipelineMap[f.pipelineId] = [];
      pipelineMap[f.pipelineId].push(f);
    } else {
      standalone.push(f);
    }
  });

  const filteredStandalone = filter === "all" ? standalone : standalone.filter(f => f.type === filter);
  const pipelineEntries = Object.entries(pipelineMap);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0D0D0D", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 14 }}>📡</span>
            <span style={{ fontFamily: C.head, fontSize: 13, fontWeight: 700, color: C.text }}>Request Flows</span>
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, background: `${C.cyan}20`, color: C.cyan, border: `1px solid ${C.cyan}30`, fontFamily: C.mono }}>{flows.length}</span>
            {runningCount > 0 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber, animation: "rfpulse 1.2s ease-in-out infinite" }} />}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { _rfStore.length = 0; _rfListeners.forEach(f => f()); }} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textMute, cursor: "pointer", fontFamily: C.mono }}>Clear</button>
            <button onClick={onClose} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textMute, cursor: "pointer", fontFamily: C.mono }}>✕</button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, marginBottom: 8 }}>
          {llmCount} LLM · {toolCount} tools · {errorCount > 0 ? <span style={{ color: C.red }}>{errorCount} errors</span> : "0 errors"}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(["all", "llm", "tool", "upload", "pipeline_start"] as const).map(t => (
            <button key={t} onClick={() => setFilter(t as any)}
              style={{ fontSize: 9, padding: "3px 8px", borderRadius: 8, cursor: "pointer", fontFamily: C.mono, fontWeight: 600, letterSpacing: "0.04em", border: `1px solid ${filter === t ? C.cyan + "55" : C.border}`, background: filter === t ? `${C.cyan}15` : "transparent", color: filter === t ? C.cyan : C.textMute }}>
              {t === "all" ? "ALL" : t === "pipeline_start" ? "PIPELINE" : (RF_CFG[t as RequestType]?.label.toUpperCase() ?? t.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: 8, scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
        {flows.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 16px", color: C.textMute, fontSize: 11, fontFamily: C.mono }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
            No requests yet.<br />Run a pipeline or use AI.
          </div>
        )}

        {(filter === "all" || filter === "pipeline_start") && pipelineEntries.map(([pid, entries]) => {
          const pName = entries.find(e => e.pipelineName)?.pipelineName ?? `Pipeline ${pid.slice(0, 8)}`;
          const isOpen = expandedPipeline === pid;
          const hasErr = entries.some(e => e.status === "error");
          const isRunning = entries.some(e => e.status === "running");
          const toolEntries = entries.filter(e => e.type === "tool");
          const llmEntries = entries.filter(e => e.type === "llm");
          const newestTs = entries[0]?.timestamp;
          return (
            <div key={pid} style={{ borderRadius: 12, border: `1px solid ${hasErr ? C.red + "44" : isRunning ? C.amber + "55" : C.green + "33"}`, overflow: "hidden", background: C.card, flexShrink: 0 }}>
              <button onClick={() => setExpandedPipeline(isOpen ? null : pid)} style={{ width: "100%", padding: "11px 13px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: isRunning ? `${C.amber}20` : hasErr ? `${C.red}20` : `${C.green}18`, border: `1px solid ${isRunning ? C.amber + "55" : hasErr ? C.red + "44" : C.green + "33"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
                  {isRunning ? "⚡" : hasErr ? "⚠️" : "✅"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.head, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pName}</div>
                  <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, marginTop: 2 }}>{llmEntries.length} LLM · {toolEntries.length} tools · {newestTs ? timeAgo(newestTs) : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isRunning && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber, animation: "rfpulse 1.2s ease-in-out infinite" }} />}
                  <span style={{ color: C.textMute, fontSize: 11, display: "inline-block", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▲</span>
                </div>
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 13px 6px" }}>
                      {[...entries].reverse().map((entry, idx, arr) => {
                        const cfg = RF_CFG[entry.type] || { icon: "•", color: C.textMute, label: entry.type };
                        const isLast = idx === arr.length - 1;
                        return (
                          <div key={entry.id} style={{ display: "flex", gap: 10, position: "relative", paddingBottom: isLast ? 4 : 0 }}>
                            {!isLast && <div style={{ position: "absolute", left: 13, top: 32, bottom: 0, width: 1, background: entry.status === "error" ? `${C.red}33` : C.border, zIndex: 0 }} />}
                            <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: entry.status === "error" ? `${C.red}18` : entry.status === "running" ? `${cfg.color}28` : `${cfg.color}15`, border: `1px solid ${entry.status === "error" ? C.red + "55" : entry.status === "running" ? cfg.color + "77" : cfg.color + "33"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, position: "relative", zIndex: 1, marginTop: 8, flexShrink: 0 }}>
                              {entry.status === "running" ? <div style={{ width: 9, height: 9, border: `1.5px solid ${cfg.color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "rfspin 0.8s linear infinite" }} /> : <span style={{ fontSize: 10 }}>{cfg.icon}</span>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0, paddingTop: 8, paddingBottom: 14 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${cfg.color}18`, color: cfg.color, fontFamily: C.mono, fontWeight: 600, border: `1px solid ${cfg.color}30` }}>{cfg.label}</span>
                                {entry.status === "error" && <span style={{ fontSize: 9, color: C.red, fontFamily: C.mono, fontWeight: 600 }}>FAILED</span>}
                                {entry.durationMs != null && <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, marginLeft: "auto" }}>{entry.durationMs}ms</span>}
                              </div>
                              <div style={{ fontSize: 11, color: entry.status === "error" ? C.red : C.text, lineHeight: 1.45, fontWeight: 500 }}>{entry.label}</div>
                              {entry.detail && <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, marginTop: 2, wordBreak: "break-all" }}>{entry.detail}</div>}
                              <div style={{ fontSize: 9, color: C.textMute, marginTop: 3, fontFamily: C.mono }}>{timeAgo(entry.timestamp)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {filteredStandalone.map(entry => {
          const cfg = RF_CFG[entry.type] || { icon: "•", color: C.textMute, label: entry.type };
          return (
            <div key={entry.id} style={{ padding: "10px 12px", borderRadius: 10, background: C.card, border: `1px solid ${entry.status === "error" ? C.red + "44" : entry.status === "running" ? cfg.color + "55" : C.border}`, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: entry.status === "error" ? `${C.red}18` : `${cfg.color}15`, border: `1px solid ${entry.status === "error" ? C.red + "44" : cfg.color + "33"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                  {entry.status === "running" ? <div style={{ width: 10, height: 10, border: `1.5px solid ${cfg.color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "rfspin 0.8s linear infinite" }} /> : cfg.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${cfg.color}18`, color: cfg.color, fontFamily: C.mono, fontWeight: 600, border: `1px solid ${cfg.color}30` }}>{cfg.label}</span>
                    {entry.status === "error" && <span style={{ fontSize: 9, color: C.red, fontFamily: C.mono }}>FAILED</span>}
                    {entry.durationMs != null && <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, marginLeft: "auto" }}>{entry.durationMs}ms</span>}
                  </div>
                  <div style={{ fontSize: 11, color: entry.status === "error" ? C.red : C.text, lineHeight: 1.45, fontWeight: 500 }}>{entry.label}</div>
                  {entry.detail && <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, marginTop: 2 }}>{entry.detail}</div>}
                  <div style={{ fontSize: 9, color: C.textMute, marginTop: 4, fontFamily: C.mono }}>{timeAgo(entry.timestamp)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.border}`, flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 }}>
        {[{ label: "LLM", v: llmCount, color: C.violet }, { label: "Tools", v: toolCount, color: C.cyan }, { label: "Errors", v: errorCount, color: errorCount > 0 ? C.red : C.textMute }, { label: "Pipes", v: pipelineEntries.length, color: C.green }].map(s => (
          <div key={s.label} style={{ textAlign: "center", padding: "5px 2px", borderRadius: 7, background: C.card, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: C.head, lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: 8, color: C.textMute, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Download CSV ────────────────────────────────────────────────── */
async function downloadSessionCSV(sessionId: string, filename: string) {
  const res = await fetch(`/api/agent/session/${sessionId}/download`);
  if (!res.ok) throw new Error("Failed to download CSV");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename.endsWith(".csv") ? filename : filename + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

function DownloadCSVModal({ sessionId, defaultName, onClose }: { sessionId: string; defaultName: string; onClose: () => void }) {
  const [filename, setFilename] = useState(defaultName.replace(/\.csv$/i, "").replace(/^Pipeline\s*[–-]\s*/i, "") || "dataset");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleDownload = async () => {
    setDownloading(true); setError(null);
    try { await downloadSessionCSV(sessionId, filename); onClose(); }
    catch (e: any) { setError(e.message || "Download failed"); }
    finally { setDownloading(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div initial={{ scale: 0.93, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93 }} onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.borderMd}`, width: "100%", maxWidth: 400, overflow: "hidden" }}>
        <div style={{ padding: "20px 22px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: C.head, fontSize: "1rem", fontWeight: 700, color: C.text, marginBottom: 4 }}>⬇️ Download Modified Dataset</div>
          <div style={{ fontSize: 12, color: C.textSub }}>Downloads the current session state after all pipeline steps have been applied.</div>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <label style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Filename</label>
          <div style={{ display: "flex", alignItems: "center", background: C.input, border: `1px solid ${C.borderMd}`, borderRadius: 9, overflow: "hidden" }}>
            <input value={filename} onChange={e => setFilename(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, "_"))} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 13, fontFamily: C.mono, padding: "10px 14px" }} placeholder="my_cleaned_dataset" onKeyDown={e => e.key === "Enter" && handleDownload()} />
            <span style={{ padding: "10px 14px", color: C.textMute, fontSize: 12, fontFamily: C.mono, borderLeft: `1px solid ${C.border}` }}>.csv</span>
          </div>
          {error && <div style={{ marginTop: 10, padding: "8px 12px", background: `${C.red}10`, borderRadius: 7, border: `1px solid ${C.red}33`, fontSize: 11, color: C.red }}>⚠ {error}</div>}
        </div>
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 12, cursor: "pointer", fontFamily: C.sans }}>Cancel</button>
          <button onClick={handleDownload} disabled={downloading || !filename.trim()} style={{ padding: "7px 20px", borderRadius: 7, border: "none", background: downloading ? C.border : `linear-gradient(135deg, ${C.teal}, #0891B2)`, color: downloading ? C.textMute : "#030712", fontSize: 12, fontWeight: 700, fontFamily: C.head, cursor: downloading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {downloading ? <><div style={{ width: 12, height: 12, border: `2px solid ${C.textMute}`, borderTopColor: "transparent", borderRadius: "50%", animation: "rfspin 0.8s linear infinite" }} />Downloading…</> : <>⬇ Download CSV</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Portal Column Dropdown ─────────────────────────────────────── */
function ColDropdown({ value, onChange, cols, label }: { value: string; onChange: (v: string) => void; cols: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const pid = useRef(`cdp-${Math.random().toString(36).slice(2)}`);
  const openDrop = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const dh = Math.min(cols.length * 36 + 60, 240);
    setPos({ top: window.innerHeight - r.bottom < dh && r.top > dh ? r.top - dh - 4 : r.bottom + 4, left: r.left, width: Math.max(r.width, 200) });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      const el = document.getElementById(pid.current);
      if (btnRef.current && !btnRef.current.contains(e.target as Node) && (!el || !el.contains(e.target as Node))) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);
  const portal = open ? createPortal(
    <div id={pid.current} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 99999, background: "#1E1E1E", border: `1px solid ${C.borderMd}`, borderRadius: 10, maxHeight: 240, overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.7)", scrollbarWidth: "thin" as const }}>
      <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textMute, fontFamily: C.mono }}>{cols.length} column{cols.length !== 1 ? "s" : ""}</div>
      <button onMouseDown={e => { e.preventDefault(); onChange(""); setOpen(false); }} style={{ display: "block", width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: C.textMute, fontSize: 11, fontFamily: C.mono, cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.border}` }} onMouseEnter={e => (e.currentTarget.style.background = C.cardHover)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>— clear —</button>
      {cols.length === 0 && <div style={{ padding: "12px", color: C.textMute, fontSize: 10, fontFamily: C.mono, textAlign: "center" }}>Upload a CSV to see columns</div>}
      {cols.map(col => (
        <button key={col} onMouseDown={e => { e.preventDefault(); onChange(col); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: col === value ? `${C.cyan}15` : "transparent", border: "none", color: col === value ? C.cyan : C.textSub, fontSize: 11, fontFamily: C.mono, cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.border}` }} onMouseEnter={e => { if (col !== value) (e.currentTarget as HTMLElement).style.background = C.cardHover; }} onMouseLeave={e => { if (col !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: col === value ? C.cyan : C.textMute, flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col}</span>
          {col === value && <span style={{ fontSize: 9, color: C.cyan }}>✓</span>}
        </button>
      ))}
    </div>, document.body) : null;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{label}</label>
      <button ref={btnRef} onClick={open ? () => setOpen(false) : openDrop} style={{ display: "flex", alignItems: "center", gap: 6, background: C.input, border: `1px solid ${open ? C.cyan + "66" : C.border}`, borderRadius: 6, padding: "5px 10px", color: value ? C.text : C.textMute, fontSize: 11, fontFamily: C.mono, cursor: "pointer", minWidth: 160, outline: "none" }}>
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || <span style={{ color: C.textMute }}>Select column…</span>}</span>
        <span style={{ color: C.textMute, fontSize: 9, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
      </button>
      {portal}
    </div>
  );
}

function ArgField({ argKey, value, onChange, datasetCols }: { argKey: string; value: string; onChange: (v: string) => void; datasetCols: DatasetColumns }) {
  const colType = COL_ARG_MAP[argKey] as keyof DatasetColumns | undefined;
  if (colType) return <ColDropdown value={value} onChange={onChange} cols={datasetCols[colType]} label={argKey} />;
  if (argKey === "model") return (<div><label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{argKey}</label><select value={value} onChange={e => onChange(e.target.value)} style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", color: C.text, fontSize: 11, fontFamily: C.mono, outline: "none", minWidth: 160, cursor: "pointer" }}>{["random_forest", "xgboost", "lightgbm", "svm", "logistic_regression", "linear_regression"].map(m => <option key={m} value={m}>{m}</option>)}</select></div>);
  if (["stratify", "drop_first", "include_preprocessing"].includes(argKey)) return (<div><label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{argKey}</label><select value={value} onChange={e => onChange(e.target.value)} style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", color: C.text, fontSize: 11, fontFamily: C.mono, outline: "none", cursor: "pointer" }}><option value="true">true</option><option value="false">false</option></select></div>);
  return (<div><label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{argKey}</label><input value={value} onChange={e => onChange(e.target.value)} style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", color: C.text, fontSize: 11, fontFamily: C.mono, outline: "none", width: 120 }} /></div>);
}

function DragHandle({ controls }: { controls: ReturnType<typeof useDragControls> }) {
  return <div onPointerDown={e => controls.start(e)} style={{ color: C.textMute, cursor: "grab", fontSize: 16, flexShrink: 0, lineHeight: 1, padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none", touchAction: "none" }}>⠿</div>;
}

function ResultCard({ children }: { children: React.ReactNode }) { return <div style={{ padding: "10px 12px 12px", background: C.input, borderRadius: 10, margin: "0 12px 12px" }}>{children}</div>; }
function StatBadges({ items }: { items: { label: string; value: any; color: string }[] }) {
  return (<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>{items.map(({ label, value, color }) => (<div key={label} style={{ padding: "5px 10px", borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 1, minWidth: 60 }}><div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: C.head }}>{value ?? "—"}</div></div>))}</div>);
}

function HumanResult({ step }: { step: PipelineStep }) {
  const { tool, result, imageBase64 } = step;
  if (!result && !imageBase64) return null;
  if (imageBase64) return <div style={{ padding: "0 12px 12px" }}><img src={imageBase64} alt="Chart" style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} /></div>;
  if (tool === "auto_ml_pipeline" && result) {
    const isClass = result.problem_type === "classification";
    return (<ResultCard><div style={{ textAlign: "center", padding: "10px 0 6px" }}><div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, marginBottom: 4 }}>BEST MODEL</div><div style={{ fontFamily: C.head, fontSize: 20, fontWeight: 700, color: C.green }}>{result.best_model}</div><div style={{ fontSize: 26, fontWeight: 800, color: C.text, fontFamily: C.head, marginTop: 2 }}>{((result.best_score || 0) * 100).toFixed(1)}%</div><div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>{isClass ? "ACCURACY" : "R² SCORE"}</div></div><div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>{Object.entries(result.results || {}).map(([name, metrics]: [string, any]) => (!metrics.error && (<div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 9px", borderRadius: 6, background: name === result.best_model ? `${C.green}0D` : "transparent", border: `1px solid ${name === result.best_model ? C.green + "33" : C.border}` }}><span style={{ fontSize: 11, color: name === result.best_model ? C.green : C.textSub, flex: 1 }}>{name}</span><span style={{ fontFamily: C.mono, fontSize: 11, color: name === result.best_model ? C.green : C.textMute }}>{isClass ? `${((metrics.accuracy ?? 0) * 100).toFixed(1)}%` : `R²=${(metrics.r2_score ?? 0).toFixed(3)}`}</span>{name === result.best_model && <span style={{ fontSize: 9, color: C.green }}>★</span>}</div>)))}</div></ResultCard>);
  }
  if (result && typeof result === "object") { const simple = Object.keys(result).filter(k => typeof result[k] !== "object" && !Array.isArray(result[k])).slice(0, 6); if (simple.length > 0) return <ResultCard><StatBadges items={simple.map(k => ({ label: k.replace(/_/g, " "), value: String(result[k]), color: C.textSub }))} /></ResultCard>; }
  return null;
}

function AISummary({ step, onGenerate }: { step: PipelineStep; onGenerate: () => void }) {
  if (step.status !== "done") return null;
  return (<div style={{ margin: "0 12px 12px", padding: "10px 12px", background: `${C.violet}0D`, border: `1px solid ${C.violet}25`, borderRadius: 10 }}><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: step.aiSummary ? 6 : 0 }}><span style={{ fontSize: 12 }}>✨</span><span style={{ fontSize: 10, fontWeight: 600, color: C.violet, fontFamily: C.head }}>AI Insight</span>{!step.aiSummary && !step.loadingSummary && <button onClick={onGenerate} style={{ marginLeft: "auto", fontSize: 9, padding: "2px 8px", borderRadius: 4, border: `1px solid ${C.violet}44`, background: `${C.violet}15`, color: C.violet, cursor: "pointer", fontFamily: C.mono }}>Explain →</button>}{step.loadingSummary && <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: C.violet, animation: `dot 1.2s ${i * 0.2}s ease-in-out infinite` }} />)}</div>}</div>{step.aiSummary && <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{step.aiSummary}</p>}</div>);
}

function StatusBadge({ status, color }: { status: PipelineStep["status"]; color: string }) {
  const cfg = { pending: { label: "Pending", bg: C.border, tc: C.textMute }, running: { label: "Running", bg: `${color}22`, tc: color }, done: { label: "Done", bg: `${C.green}22`, tc: C.green }, error: { label: "Error", bg: `${C.red}22`, tc: C.red } }[status];
  return (<span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: cfg.bg, color: cfg.tc, fontFamily: C.mono, fontWeight: 600, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>{status === "running" && <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, animation: "pls 1.2s ease-in-out infinite" }} />}{cfg.label}</span>);
}

function StepCard({ step, idx, phase, isRunning, expanded, onToggleExpand, onRemove, onUpdateArg, onRunFrom, onGenerateSummary, datasetCols }: { step: PipelineStep; idx: number; phase: string; isRunning: boolean; expanded: boolean; onToggleExpand: () => void; onRemove: () => void; onUpdateArg: (k: string, v: string) => void; onRunFrom: () => void; onGenerateSummary: () => void; datasetCols: DatasetColumns; }) {
  const controls = useDragControls();
  const color = CAT_COLOR[step.category] || C.textSub;
  const [hovRun, setHovRun] = useState(false);
  const canRunFrom = !isRunning && (step.status === "pending" || step.status === "error") && idx > 0;
  const borderColor = step.status === "running" ? color + "88" : step.status === "done" ? color + "33" : step.status === "error" ? C.red + "55" : C.border;
  return (
    <Reorder.Item value={step} id={step.id} dragListener={false} dragControls={controls} as="div" style={{ background: C.card, border: `1px solid ${borderColor}`, borderRadius: 12, overflow: "hidden", flexShrink: 0, cursor: "default" }} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.2 }} whileDrag={{ scale: 1.01, boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${color}55`, zIndex: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", background: step.status === "running" ? `${color}08` : step.status === "done" ? `${color}03` : "transparent" }}>
        {!isRunning ? <DragHandle controls={controls} /> : <div style={{ width: 20 }} />}
        <div style={{ width: 22, height: 22, borderRadius: 6, background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color, fontFamily: C.mono, flexShrink: 0 }}>{idx + 1}</div>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{CAT_ICON[step.category] || "⚙️"}</span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, fontFamily: C.head, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.label}</div><div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono }}>{step.tool}</div></div>
        {canRunFrom && <button onClick={onRunFrom} onMouseEnter={() => setHovRun(true)} onMouseLeave={() => setHovRun(false)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${hovRun ? color + "66" : C.border}`, background: hovRun ? `${color}18` : "transparent", color: hovRun ? color : C.textMute, fontSize: 9, fontFamily: C.mono, cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>▶ from here</button>}
        <StatusBadge status={step.status} color={color} />
        {step.executionMs != null && <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, flexShrink: 0 }}>{step.executionMs}ms</span>}
        {!isRunning && phase !== "run" && <button onClick={onRemove} style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", fontSize: 12, padding: "2px 4px", borderRadius: 4, flexShrink: 0 }} onMouseEnter={e => (e.currentTarget.style.color = C.red)} onMouseLeave={e => (e.currentTarget.style.color = C.textMute)}>✕</button>}
      </div>
      {step.status === "error" && step.errorMsg && <div style={{ padding: "7px 13px", background: `${C.red}08`, borderTop: `1px solid ${C.red}22`, fontSize: 11, color: C.red, fontFamily: C.mono, lineHeight: 1.5, wordBreak: "break-word" }}>⚠ {step.errorMsg.slice(0, 250)}</div>}
      {!isRunning && Object.keys(step.args).length > 0 && <div style={{ padding: "10px 13px", borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 10 }}>{Object.entries(step.args).map(([key, val]) => <ArgField key={key} argKey={key} value={String(val)} onChange={v => onUpdateArg(key, v)} datasetCols={datasetCols} />)}</div>}
      <div style={{ padding: "5px 13px 8px", fontSize: 10, color: C.textMute, fontFamily: C.sans, borderTop: `1px solid ${C.border}`, fontStyle: "italic", lineHeight: 1.55 }}>{step.reason}</div>
      {(step.result || step.imageBase64) && (<div style={{ borderTop: `1px solid ${C.border}` }}><button onClick={onToggleExpand} style={{ width: "100%", padding: "7px 13px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color, fontSize: 10, fontFamily: C.mono, textAlign: "left" }}>{expanded ? "▲" : "▼"} {expanded ? "Hide" : "View"} Results</button><AnimatePresence>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: "hidden" }}><HumanResult step={step} /><AISummary step={step} onGenerate={onGenerateSummary} /></motion.div>}</AnimatePresence></div>)}
      {step.status === "running" && <div style={{ height: 2, background: `${color}20`, overflow: "hidden" }}><motion.div style={{ height: "100%", background: color }} animate={{ x: ["-100%", "100%"] }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }} /></div>}
    </Reorder.Item>
  );
}

function SuggestionCard({ suggestion, onAdd, disabled }: { suggestion: any; onAdd: () => void; disabled: boolean }) {
  const [hov, setHov] = useState(false);
  const color = CAT_COLOR[suggestion.category] || C.textSub;
  return (<motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18 }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={disabled ? undefined : onAdd} style={{ padding: "10px 12px", borderRadius: 10, background: hov && !disabled ? C.cardHover : C.card, border: `1px solid ${hov && !disabled ? color + "55" : C.border}`, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s", opacity: disabled ? 0.5 : 1 }}><div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}><span style={{ fontSize: 13 }}>{CAT_ICON[suggestion.category] || "⚙️"}</span><span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.head, flex: 1 }}>{suggestion.label}</span><span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: `${color}18`, color, fontFamily: C.mono, fontWeight: 600, border: `1px solid ${color}33` }}>{suggestion.category}</span></div><div style={{ fontSize: 9.5, color: C.textMute, fontFamily: C.mono, marginBottom: 3 }}>{suggestion.tool}</div><div style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5 }}>{suggestion.reason}</div>{hov && !disabled && <div style={{ marginTop: 6, fontSize: 10, color, fontFamily: C.mono, fontWeight: 600 }}>+ Add to pipeline →</div>}</motion.div>);
}

function dlText(text: string, filename: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = filename; a.click(); }
function buildExportText(steps: PipelineStep[], name: string): string { const lines = [`DSAgent Pipeline Report: ${name}`, `Generated: ${new Date().toLocaleString()}`, "=".repeat(60), ""]; steps.forEach((s, i) => { lines.push(`Step ${i + 1}: ${s.label} [${s.status.toUpperCase()}]`, `Tool: ${s.tool}`); if (s.executionMs) lines.push(`Time: ${s.executionMs}ms`); if (s.aiSummary) lines.push(`AI Insight: ${s.aiSummary}`); if (s.errorMsg) lines.push(`Error: ${s.errorMsg}`); lines.push(""); }); return lines.join("\n"); }

function ExportModal({ steps, pipelineName, onClose }: { steps: PipelineStep[]; pipelineName: string; onClose: () => void }) {
  const [exp, setExp] = useState<string | null>(null);
  const doExport = async (t: string) => { setExp(t); await new Promise(r => setTimeout(r, 400)); if (t === "json") dlText(JSON.stringify({ name: pipelineName, steps }, null, 2), `${pipelineName.replace(/\s+/g, "_")}.json`); if (t === "txt") dlText(buildExportText(steps, pipelineName), `${pipelineName.replace(/\s+/g, "_")}_report.txt`); setExp(null); };
  return (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}><motion.div initial={{ scale: 0.93, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93 }} onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.borderMd}`, width: "100%", maxWidth: 420, overflow: "hidden" }}><div style={{ padding: "20px 22px", borderBottom: `1px solid ${C.border}` }}><div style={{ fontFamily: C.head, fontSize: "1rem", fontWeight: 700, color: C.text }}>Export Results</div></div><div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>{[{ id: "json", icon: "{ }", label: "JSON Export", desc: "Full structured data", color: C.cyan }, { id: "txt", icon: "📄", label: "Text Report", desc: "Human-readable summary", color: C.violet }].map(({ id, icon, label, desc, color }) => (<button key={id} onClick={() => doExport(id)} disabled={exp === id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: exp === id ? `${color}15` : C.input, border: `1px solid ${exp === id ? color + "44" : C.border}`, borderRadius: 10, cursor: "pointer", textAlign: "left" }}><div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{icon}</div><div><div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: C.head }}>{exp === id ? "Preparing…" : label}</div><div style={{ fontSize: 11, color: C.textSub }}>{desc}</div></div><div style={{ marginLeft: "auto", fontSize: 16, color, opacity: 0.6 }}>↓</div></button>))}</div><div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}><button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 12, cursor: "pointer", fontFamily: C.sans }}>Close</button></div></motion.div></motion.div>);
}

const TEMPLATES: Record<string, { name: string; icon: string; desc: string; steps: any[] }> = {
  eda_starter: { name: "EDA Starter", icon: "🔍", desc: "Explore any dataset in 5 steps", steps: [{ tool: "detect_missing_values", label: "Detect Missing Values", args: {}, reason: "Identify columns with missing data.", category: "cleaning" }, { tool: "data_quality_report", label: "Data Quality Report", args: {}, reason: "Get a full data quality overview.", category: "eda" }, { tool: "dataset_overview", label: "Dataset Overview", args: {}, reason: "Understand shape and distributions.", category: "eda" }, { tool: "correlation_analysis", label: "Correlation Analysis", args: {}, reason: "Find relationships between numeric columns.", category: "eda" }, { tool: "create_correlation_heatmap", label: "Correlation Heatmap", args: {}, reason: "Visualize all correlations at once.", category: "visualization" }] },
  clean_scale_model: { name: "Clean → Scale → AutoML", icon: "🚀", desc: "Full DS pipeline", steps: [{ tool: "detect_missing_values", label: "Detect Missing Values", args: {}, reason: "Find columns needing imputation.", category: "cleaning" }, { tool: "remove_duplicates", label: "Remove Duplicates", args: {}, reason: "Ensure unique rows before training.", category: "cleaning" }, { tool: "standard_scaler", label: "Standard Scaler", args: { columns_to_scale: "" }, reason: "Standardize features before training.", category: "preprocessing" }, { tool: "auto_ml_pipeline", label: "AutoML Pipeline", args: { target_column: "", cv_folds: "3" }, reason: "Train models on the cleaned dataset.", category: "modeling" }] },
};

function TemplateModal({ onSelect, onClose }: { onSelect: (steps: any[]) => void; onClose: () => void }) {
  return (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}><motion.div initial={{ scale: 0.93, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93 }} onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.borderMd}`, width: "100%", maxWidth: 480 }}><div style={{ padding: "20px 22px", borderBottom: `1px solid ${C.border}` }}><div style={{ fontFamily: C.head, fontSize: "1rem", fontWeight: 700, color: C.text }}>Pipeline Templates</div></div><div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>{Object.entries(TEMPLATES).map(([id, tmpl]) => (<button key={id} onClick={() => onSelect(tmpl.steps)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, cursor: "pointer", textAlign: "left" }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.cyan + "55"; (e.currentTarget as HTMLElement).style.background = `${C.cyan}08`; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = C.input; }}><div style={{ width: 42, height: 42, borderRadius: 10, background: `${C.cyan}15`, border: `1px solid ${C.cyan}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{tmpl.icon}</div><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: C.head, marginBottom: 2 }}>{tmpl.name}</div><div style={{ fontSize: 11, color: C.textSub }}>{tmpl.desc}</div></div><span style={{ color: C.cyan, fontSize: 18, opacity: 0.6 }}>→</span></button>))}</div><div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}><button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 12, cursor: "pointer", fontFamily: C.sans }}>Cancel</button></div></motion.div></motion.div>);
}

/* ── Collapsible Columns Panel ───────────────────────────────────── */
function ColsPanel({ datasetCols }: { datasetCols: DatasetColumns }) {
  const [open, setOpen] = useState(true);
  const total = datasetCols.all.length;
  return (
    <div style={{ background: C.card, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: 10, color: C.textMute, flexShrink: 0 }}>🗂</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.07em", textTransform: "uppercase", flex: 1 }}>
          Columns <span style={{ color: C.textMute, fontWeight: 400, opacity: 0.7 }}>({total})</span>
        </span>
        <span style={{ fontSize: 8, color: C.textMute, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>▲</span>
      </button>

      {/* Animated body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="cols-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "2px 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              {datasetCols.numeric.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: C.cyan, fontFamily: C.mono, marginBottom: 4 }}>
                    # {datasetCols.numeric.length} numeric
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxHeight: 80, overflowY: "auto", scrollbarWidth: "thin" as const, scrollbarColor: `${C.border} transparent` }}>
                    {datasetCols.numeric.map(c => (
                      <span key={c} title={c} style={{ fontSize: 8, padding: "2px 5px", borderRadius: 3, background: `${C.cyan}12`, color: C.cyan, fontFamily: C.mono, border: `1px solid ${C.cyan}20`, cursor: "default", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {datasetCols.categorical.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: C.violet, fontFamily: C.mono, marginBottom: 4 }}>
                    A {datasetCols.categorical.length} categorical
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxHeight: 80, overflowY: "auto", scrollbarWidth: "thin" as const, scrollbarColor: `${C.border} transparent` }}>
                    {datasetCols.categorical.map(c => (
                      <span key={c} title={c} style={{ fontSize: 8, padding: "2px 5px", borderRadius: 3, background: `${C.violet}12`, color: C.violet, fontFamily: C.mono, border: `1px solid ${C.violet}20`, cursor: "default", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function PipelineBuilder({ onSaved, initialPipeline }: PipelineBuilderProps) {
  const isEditing = !!initialPipeline;
  const [phase, setPhase] = useState<"upload" | "build" | "run" | "done">(isEditing ? "build" : "upload");
  const [sessionId, setSessionId] = useState<string | null>(initialPipeline?.sessionId ?? null);
  const [datasetMeta, setDatasetMeta] = useState(initialPipeline?.metadata?.datasetMeta ?? "");
  const [datasetLabel, setDatasetLabel] = useState(isEditing ? (initialPipeline?.name?.replace(/^Pipeline\s*[–-]\s*/i, "") || "") : "");
  const [datasetCols, setDatasetCols] = useState<DatasetColumns>(() => {
    const meta = initialPipeline?.metadata?.datasetMeta ?? "";
    const nm = meta.match(/Numeric columns:\s*([^\n]+)/);
    const cm = meta.match(/Categorical columns:\s*([^\n]+)/);
    const nc = nm ? nm[1].split(",").map((c: string) => c.trim()).filter(Boolean) : [];
    const cc = cm ? cm[1].split(",").map((c: string) => c.trim()).filter((c: string) => c !== "none") : [];
    return { all: [...nc, ...cc], numeric: nc, categorical: cc };
  });
  const [steps, setSteps] = useState<PipelineStep[]>(() => {
    if (!initialPipeline?.steps?.length) return [];
    return initialPipeline.steps.map((s: any, i: number) => ({ id: s.id || `step-${Date.now()}-${i}`, tool: s.tool, label: s.label, args: s.args || {}, reason: s.reason || "", category: s.category || "eda", status: "pending" as const }));
  });
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [pipelineName, setPipelineName] = useState(initialPipeline?.name ?? "My Pipeline");
  const [pipelineId, setPipelineId] = useState<string | null>(initialPipeline?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDownloadCSV, setShowDownloadCSV] = useState(false);
  const [rightTab, setRightTab] = useState<"ai" | "advanced">("ai");
  const [showFlows, setShowFlows] = useState(false);
  const [renamingPipeline, setRenamingPipeline] = useState(false);

  const flows = useRF();
  const activeFlows  = flows.filter(f => f.status === "running").length;
  const recentErrors = flows.filter(f => f.status === "error" && Date.now() - f.timestamp.getTime() < 30000).length;

  const fileRef = useRef<HTMLInputElement>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (stepsEndRef.current && steps.length > 0) stepsEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [steps.length]);
  useEffect(() => { if (renamingPipeline && renameRef.current) { renameRef.current.focus(); renameRef.current.select(); } }, [renamingPipeline]);

  useEffect(() => {
    if (!isEditing || !initialPipeline?.sessionId) return;
    fetch(`/api/agent/session/${initialPipeline.sessionId}/metadata`).then(r => r.ok ? r.json() : null).then(data => {
      if (!data?.found) return;
      const meta = data.metadata;
      const nc: string[] = meta.numeric_columns || [];
      const cc: string[] = meta.categorical_columns || [];
      setDatasetCols({ all: [...nc, ...cc], numeric: nc, categorical: cc });
      setDatasetLabel(meta.filename || datasetLabel);
      setDatasetMeta([`Filename: ${meta.filename}`, `Rows: ${meta.row_count?.toLocaleString()}, Columns: ${meta.column_count}`, `Size: ${meta.memory_usage_mb} MB`, `Numeric columns: ${nc.join(", ") || "none"}`, `Categorical columns: ${cc.join(", ") || "none"}`].join("\n"));
    }).catch(() => { });
  }, [isEditing, initialPipeline?.sessionId]);

  useEffect(() => { if (isEditing && datasetMeta) fetchSuggestions(steps, datasetMeta, ""); }, [isEditing, datasetMeta]);

  /* ── handlers ── */
  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) return;
    setUploading(true);
    const rfId = addRF({ type: "upload", label: `Uploading ${file.name}`, detail: `${(file.size / 1024).toFixed(1)} KB`, status: "running" });
    try {
      const fd = new FormData(); fd.append("file", file);
      const t0 = Date.now();
      const res = await fetch("/api/agent/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json(); const meta = data.metadata;
      updateRF(rfId, { status: "success", durationMs: Date.now() - t0, detail: `${meta.row_count?.toLocaleString()} rows × ${meta.column_count} cols` });
      setSessionId(data.session_id); setDatasetLabel(meta.filename);
      const nc: string[] = meta.numeric_columns || []; const cc: string[] = meta.categorical_columns || [];
      setDatasetCols({ all: [...nc, ...cc], numeric: nc, categorical: cc });
      const ms = [`Filename: ${meta.filename}`, `Rows: ${meta.row_count?.toLocaleString()}, Columns: ${meta.column_count}`, `Size: ${meta.memory_usage_mb} MB`, `Numeric columns: ${nc.join(", ") || "none"}`, `Categorical columns: ${cc.join(", ") || "none"}`].join("\n");
      setDatasetMeta(ms); setPipelineName(`Pipeline – ${meta.filename}`); setPhase("build");
      await fetchSuggestions([], ms, "Dataset just uploaded.");
    } catch (e: any) { updateRF(rfId, { status: "error", detail: e.message }); }
    finally { setUploading(false); }
  };

  const fetchSuggestions = async (currentSteps: PipelineStep[], meta: string, lastResult: string) => {
    setLoadingSuggest(true); setSuggestions([]);
    const rfId = addRF({ type: "llm", label: "Requesting AI pipeline suggestions", detail: `${currentSteps.length} steps completed`, status: "running" });
    const t0 = Date.now();
    try {
      const res = await fetch("/api/pipelines/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completedSteps: currentSteps.map(s => ({ tool: s.tool, label: s.label })), datasetMeta: meta, lastResult }) });
      const data = await res.json();
      updateRF(rfId, { status: "success", durationMs: Date.now() - t0, detail: `${data.suggestions?.length ?? 0} suggestions returned` });
      const existing = new Set(currentSteps.map(s => s.tool));
      setSuggestions((data.suggestions || []).filter((s: any) => !existing.has(s.tool)));
    } catch (e: any) { updateRF(rfId, { status: "error", detail: e.message }); }
    finally { setLoadingSuggest(false); }
  };

  const addStep = (sg: any) => { setSteps(prev => [...prev, { id: `step-${Date.now()}-${Math.random()}`, tool: sg.tool, label: sg.label, args: sg.args || {}, reason: sg.reason, category: sg.category, status: "pending" }]); setSuggestions(prev => prev.filter(s => s.tool !== sg.tool)); };
  const loadTemplate = (ts: any[]) => { setSteps(ts.map((s, i) => ({ ...s, id: `step-tmpl-${Date.now()}-${i}`, status: "pending" as const }))); setShowTemplates(false); };
  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));
  const updateArg = (stepId: string, key: string, value: string) => setSteps(prev => prev.map(s => s.id === stepId ? { ...s, args: { ...s.args, [key]: value } } : s));

  const generateSummary = async (stepId: string) => {
    const step = steps.find(s => s.id === stepId); if (!step?.result) return;
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, loadingSummary: true } : s));
    const rfId = addRF({ type: "llm", label: `AI Insight: ${step.label}`, status: "running" });
    const t0 = Date.now();
    try {
      const res = await fetch("/api/llm/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "system", content: "Explain the data science result in 2-3 plain English sentences. No markdown." }, { role: "user", content: `Step: ${step.label}\nTool: ${step.tool}\nResult: ${JSON.stringify(step.result).slice(0, 1000)}\n\nExplain what this means.` }] }) });
      const data = await res.json();
      let text = ""; for (const item of (data?.output || [])) { for (const block of (item?.content || [])) { if (block.type === "output_text") text += block.text || ""; } }
      if (!text) text = data?.content?.[0]?.text || "";
      updateRF(rfId, { status: "success", durationMs: Date.now() - t0 });
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, aiSummary: text, loadingSummary: false } : s));
    } catch (e: any) { updateRF(rfId, { status: "error", detail: e.message }); setSteps(prev => prev.map(s => s.id === stepId ? { ...s, loadingSummary: false } : s)); }
  };

  const savePipelineToDb = async (currentSteps: PipelineStep[], status: string, existingId?: string | null): Promise<string | null> => {
    try {
      const payload = currentSteps.map(s => ({ tool: s.tool, label: s.label, args: s.args, category: s.category, reason: s.reason }));
      if (!existingId) {
        const res = await fetch("/api/pipelines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pipelineName, sessionId, metadata: { datasetMeta } }) });
        const data = await res.json(); const newId = data.pipeline?.id; if (!newId) return null;
        await fetch(`/api/pipelines/${newId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: payload, status }) });
        setPipelineId(newId); onSaved?.(newId); return newId;
      } else {
        await fetch(`/api/pipelines/${existingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pipelineName, steps: payload, status }) });
        return existingId;
      }
    } catch { return null; }
  };

  const handleManualSave = async () => {
    if (!steps.length) return; setSaving(true); setSaveMsg(null);
    const id = await savePipelineToDb(steps, phase === "done" ? "completed" : "draft", pipelineId);
    setSaving(false); setSaveMsg(id ? "Saved ✓" : "Failed"); setTimeout(() => setSaveMsg(null), 2000);
  };

  const saveRunHistory = async (pid: string, results: any[]) => { try { await fetch(`/api/pipelines/${pid}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, stepResults: results }) }); } catch { } };

  const runStepsFrom = async (startIdx: number) => {
    if (!sessionId) return; setPhase("run");
    const snapshot = [...steps];
    setSteps(prev => prev.map((s, i) => i >= startIdx ? { ...s, status: "pending", result: undefined, imageBase64: undefined, errorMsg: undefined, aiSummary: undefined } : s));
    const runPid = pipelineId || `run-${Date.now()}`;
    addRF({ type: "pipeline_start", label: `Pipeline started: ${pipelineName}`, detail: `${snapshot.length - startIdx} steps queued`, status: "running", pipelineId: runPid, pipelineName });
    const runResults: any[] = [];
    for (let i = startIdx; i < snapshot.length; i++) {
      setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: "running" } : s));
      const step = snapshot[i];
      const args: Record<string, any> = { session_id: sessionId };
      for (const [k, v] of Object.entries(step.args)) { if (String(v).trim() !== "") args[k] = v; }
      const rfId = addRF({ type: "tool", label: step.label, detail: `${step.tool} — step ${i + 1}/${snapshot.length}`, status: "running", pipelineId: runPid, pipelineName });
      const t0 = Date.now();
      try {
        const res = await fetch("/api/agent/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool_name: step.tool, arguments: args }) });
        const result = await res.json(); const dur = Date.now() - t0;
        const img64 = result?.output?.image_base64 || result?.output?.chart_base64;
        const clean = result.output ? Object.fromEntries(Object.entries(result.output).filter(([k]) => k !== "image_base64" && k !== "chart_base64")) : null;
        const errMsg = result.success ? undefined : (result.error || result.details || "Tool failed");
        updateRF(rfId, { status: result.success ? "success" : "error", durationMs: dur, detail: result.success ? `✓ ${step.tool} (${dur}ms)` : `✗ ${errMsg?.slice(0, 80)}` });
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: result.success ? "done" : "error", result: clean, imageBase64: img64 ? (img64.startsWith("data:") ? img64 : `data:image/png;base64,${img64}`) : undefined, executionMs: result.execution_time_ms, errorMsg: errMsg } : s));
        if (result.success) setExpandedResult(step.id);
        runResults.push({ tool: step.tool, success: result.success, executionMs: result.execution_time_ms, errorMsg: errMsg });
        await new Promise(r => setTimeout(r, 200));
      } catch (err: any) {
        updateRF(rfId, { status: "error", durationMs: Date.now() - t0, detail: err.message });
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: "error", errorMsg: err.message } : s));
        runResults.push({ tool: step.tool, success: false, errorMsg: err.message });
      }
    }
    const dc = runResults.filter(r => r.success).length; const ec = runResults.filter(r => !r.success).length;
    addRF({ type: "pipeline_end", label: `Pipeline complete: ${pipelineName}`, detail: `${dc} succeeded · ${ec} failed`, status: ec > 0 ? "error" : "success", pipelineId: runPid, pipelineName });
    setPhase("done");
    const finalId = await savePipelineToDb(snapshot, "completed", pipelineId);
    if (finalId) { setPipelineId(finalId); await saveRunHistory(finalId, runResults); }
  };

  const runAll  = async () => { const id = await savePipelineToDb(steps, "running", pipelineId); if (id) setPipelineId(id); await runStepsFrom(0); };
  const runFrom = async (idx: number) => { const id = await savePipelineToDb(steps, "running", pipelineId); if (id) setPipelineId(id); await runStepsFrom(idx); };
  const resetAll = () => { setSteps(prev => prev.map(s => ({ ...s, status: "pending", result: undefined, imageBase64: undefined, errorMsg: undefined, aiSummary: undefined }))); setPhase("build"); };
  const getLastResult = () => { const last = [...steps].reverse().find(s => s.status === "done"); return last?.result ? JSON.stringify(last.result).slice(0, 400) : ""; };

  const doneCount = steps.filter(s => s.status === "done").length;
  const errCount  = steps.filter(s => s.status === "error").length;
  const isRunning = phase === "run";

  /* ── Flow toggle button ── */
  const FlowToggleBtn = () => (
    <button onClick={() => setShowFlows(v => !v)}
      style={{ padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontFamily: C.mono, fontSize: 11, flexShrink: 0, display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s", border: `1px solid ${showFlows ? C.cyan + "55" : recentErrors > 0 ? C.red + "44" : activeFlows > 0 ? C.amber + "44" : C.border}`, background: showFlows ? `${C.cyan}15` : recentErrors > 0 ? `${C.red}08` : activeFlows > 0 ? `${C.amber}08` : "transparent", color: showFlows ? C.cyan : recentErrors > 0 ? C.red : activeFlows > 0 ? C.amber : C.textMute }}>
      📡
      {activeFlows > 0 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber, animation: "rfpulse 1.2s ease-in-out infinite" }} />}
      {flows.length > 0 && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, background: `${C.cyan}20`, color: C.cyan }}>{flows.length}</span>}
    </button>
  );

  /* ── UPLOAD PHASE ── */
  if (phase === "upload") {
    return (
      <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", flexShrink: 0, background: C.card }}>
            <FlowToggleBtn />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 24 }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontFamily: C.head, fontSize: "1.4rem", fontWeight: 700, color: C.text, marginBottom: 8 }}>Build a Pipeline</h2>
              <p style={{ fontSize: 12.5, color: C.textSub, maxWidth: 420, lineHeight: 1.65 }}>Upload a CSV — DSAgent suggests cleaning, analysis, and modelling steps.</p>
            </div>
            <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }} onClick={() => fileRef.current?.click()}
              style={{ width: "100%", maxWidth: 460, border: `2px dashed ${dragOver ? C.cyan : C.borderMd}`, borderRadius: 18, padding: "52px 32px", textAlign: "center", cursor: uploading ? "default" : "pointer", background: dragOver ? `${C.cyan}06` : C.card, transition: "all 0.2s" }}>
              {uploading ? (<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}><div style={{ width: 34, height: 34, border: `3px solid ${C.cyan}`, borderTopColor: "transparent", borderRadius: "50%", animation: "rfspin 0.8s linear infinite" }} /><span style={{ fontSize: 13, color: C.textSub }}>Uploading…</span></div>) : (<><div style={{ fontSize: 36, marginBottom: 12 }}>📂</div><div style={{ fontSize: 14, fontWeight: 600, color: C.cyan, marginBottom: 6 }}>Drop your CSV here</div><div style={{ fontSize: 11, color: C.textMute }}>or click to browse</div></>)}
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
            <button onClick={() => { setDatasetMeta(""); setDatasetLabel("Template"); setPipelineName("New Pipeline"); setPhase("build"); setShowTemplates(true); }} style={{ padding: "9px 22px", borderRadius: 9, border: `1px solid ${C.borderMd}`, background: "transparent", color: C.text, fontSize: 12, fontWeight: 600, fontFamily: C.head, cursor: "pointer" }}>📋 Browse Templates →</button>
            <AnimatePresence>{showTemplates && <TemplateModal onSelect={loadTemplate} onClose={() => setShowTemplates(false)} />}</AnimatePresence>
          </div>
        </div>
        <AnimatePresence>
          {showFlows && (
            <motion.div initial={{ width: 0 }} animate={{ width: 320 }} exit={{ width: 0 }} transition={{ type: "spring", stiffness: 340, damping: 34 }} style={{ flexShrink: 0, overflow: "hidden", height: "100%" }}>
              <div style={{ width: 320, height: "100%" }}><RequestFlowPanel onClose={() => setShowFlows(false)} /></div>
            </motion.div>
          )}
        </AnimatePresence>
        <style>{`@keyframes rfspin{to{transform:rotate(360deg)}}@keyframes rfpulse{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
      </div>
    );
  }

  /* ── BUILD / RUN / DONE ── */
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* Main workspace */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* ── Toolbar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap" }}>

          {/* Pipeline name — click pencil to rename inline */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 100 }}>
            {renamingPipeline ? (
              <input
                ref={renameRef}
                value={pipelineName}
                onChange={e => setPipelineName(e.target.value)}
                onBlur={() => { if (!pipelineName.trim()) setPipelineName("My Pipeline"); setRenamingPipeline(false); }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { if (!pipelineName.trim()) setPipelineName("My Pipeline"); setRenamingPipeline(false); } }}
                style={{ background: C.input, border: `1px solid ${C.cyan}55`, borderRadius: 6, outline: "none", color: C.text, fontFamily: C.head, fontSize: 13, fontWeight: 600, padding: "3px 8px", flex: 1, minWidth: 80, boxShadow: `0 0 0 2px ${C.cyan}20` }}
              />
            ) : (
              <span
                onClick={() => setRenamingPipeline(true)}
                title="Click to rename"
                style={{ color: C.text, fontFamily: C.head, fontSize: 13, fontWeight: 600, cursor: "text", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}
              >
                {pipelineName}
              </span>
            )}
            <button
              onClick={() => setRenamingPipeline(v => !v)}
              title="Rename pipeline"
              style={{ background: "none", border: "none", cursor: "pointer", color: renamingPipeline ? C.cyan : C.textMute, fontSize: 11, padding: "2px 4px", borderRadius: 4, flexShrink: 0, transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = C.cyan)}
              onMouseLeave={e => (e.currentTarget.style.color = renamingPipeline ? C.cyan : C.textMute)}
            >
              ✏️
            </button>
          </div>

          {datasetLabel
            ? <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: `${C.cyan}15`, color: C.cyan, border: `1px solid ${C.cyan}30`, fontFamily: C.mono, flexShrink: 0 }}>{datasetLabel}</span>
            : <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 5, background: `${C.amber}12`, color: C.amber, border: `1px solid ${C.amber}30`, fontFamily: C.mono, cursor: "pointer", flexShrink: 0 }}>{uploading ? "⏳…" : "📂 Upload CSV"}</button>
          }
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />

          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, fontFamily: C.mono, fontWeight: 600, flexShrink: 0, background: phase === "done" ? `${C.green}20` : isRunning ? `${C.amber}20` : `${C.violet}15`, color: phase === "done" ? C.green : isRunning ? C.amber : C.violet, border: `1px solid ${phase === "done" ? C.green + "40" : isRunning ? C.amber + "40" : C.violet + "30"}` }}>
            {phase === "done" ? `✓ ${doneCount}/${steps.length}` : isRunning ? `Running… ${doneCount}/${steps.length}` : `${steps.length} steps`}
          </span>

          {!isRunning && <button onClick={() => setShowTemplates(true)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 11, fontFamily: C.sans, cursor: "pointer", flexShrink: 0 }}>📋 Templates</button>}
          {sessionId && <button onClick={() => setShowDownloadCSV(true)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.teal}44`, background: `${C.teal}10`, color: C.teal, fontSize: 11, fontFamily: C.sans, cursor: "pointer", flexShrink: 0, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>⬇ CSV</button>}
          {phase === "done" && <button onClick={() => setShowExport(true)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.green}33`, background: `${C.green}10`, color: C.green, fontSize: 11, fontFamily: C.sans, cursor: "pointer", flexShrink: 0 }}>↓ Export</button>}
          <button onClick={handleManualSave} disabled={saving || !steps.length} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.borderMd}`, background: saveMsg === "Saved ✓" ? `${C.green}20` : "transparent", color: saveMsg === "Saved ✓" ? C.green : C.textSub, fontSize: 11, fontFamily: C.sans, cursor: !steps.length ? "not-allowed" : "pointer", opacity: !steps.length ? 0.4 : 1, flexShrink: 0 }}>{saving ? "…" : saveMsg || "💾 Save"}</button>
          {!isRunning && <button onClick={runAll} disabled={!steps.length || !sessionId} style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: (!steps.length || !sessionId) ? C.border : `linear-gradient(135deg, ${C.cyan}, #0099CC)`, color: (!steps.length || !sessionId) ? C.textMute : "#030712", fontSize: 11, fontWeight: 700, fontFamily: C.head, cursor: (!steps.length || !sessionId) ? "not-allowed" : "pointer", flexShrink: 0 }}>{!sessionId ? "⚠ Upload CSV first" : "▶ Run All"}</button>}
          {(phase === "done" || isRunning) && <button onClick={resetAll} disabled={isRunning} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.borderMd}`, background: "transparent", color: C.text, fontSize: 11, fontWeight: 600, fontFamily: C.head, cursor: isRunning ? "not-allowed" : "pointer", opacity: isRunning ? 0.5 : 1, flexShrink: 0 }}>↺ Reset</button>}
          <FlowToggleBtn />
        </div>

        {/* Canvas + right panel */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* Steps column */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            <div style={{ padding: "0 14px", flexShrink: 0 }}>
              {isEditing && !sessionId && (
                <div style={{ marginTop: 8, padding: "10px 14px", background: `${C.amber}0D`, borderRadius: 9, border: `1px solid ${C.amber}33`, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>⚠️</span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 600, color: C.amber }}>Dataset not loaded</div><div style={{ fontSize: 10, color: C.textSub, fontFamily: C.mono }}>Upload the CSV again to run steps.</div></div>
                  <button onClick={() => fileRef.current?.click()} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.amber}44`, background: `${C.amber}15`, color: C.amber, fontSize: 10, fontFamily: C.mono, cursor: "pointer" }}>Upload CSV →</button>
                </div>
              )}
              {isEditing && sessionId && datasetLabel && (
                <div style={{ marginTop: 8, padding: "8px 14px", background: `${C.green}0A`, borderRadius: 9, border: `1px solid ${C.green}28`, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>✅</span><span style={{ fontSize: 10, color: C.green, fontFamily: C.mono }}>Dataset <strong>{datasetLabel}</strong> loaded — {datasetCols.all.length} cols · {steps.length} steps</span>
                </div>
              )}
            </div>

            {isRunning && (
              <div style={{ margin: "8px 14px 0", padding: "8px 14px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 10, color: C.textSub, fontFamily: C.mono }}><span>Running…</span><span>{doneCount + errCount}/{steps.length}</span></div>
                <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                  <motion.div style={{ height: "100%", background: `linear-gradient(90deg,${C.cyan},${C.violet})`, borderRadius: 2 }} animate={{ width: `${((doneCount + errCount) / steps.length) * 100}%` }} transition={{ duration: 0.4 }} />
                </div>
              </div>
            )}

            {phase === "done" && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ margin: "8px 14px 0", padding: "10px 14px", background: `${C.green}0A`, borderRadius: 9, border: `1px solid ${C.green}28`, flexShrink: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>✅</span><span style={{ fontSize: 12, fontWeight: 600, color: C.green, fontFamily: C.head }}>Pipeline complete</span>
                <span style={{ fontSize: 10, color: C.textSub, fontFamily: C.mono }}>{doneCount} ok · {errCount} failed</span>
                <span style={{ flex: 1 }} />
                {sessionId && <button onClick={() => setShowDownloadCSV(true)} style={{ padding: "4px 12px", borderRadius: 5, border: `1px solid ${C.teal}55`, background: `${C.teal}15`, color: C.teal, fontSize: 10, fontFamily: C.mono, cursor: "pointer", fontWeight: 600 }}>⬇ Download Modified CSV</button>}
                <button onClick={() => fetchSuggestions(steps, datasetMeta, getLastResult())} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.cyan}33`, background: `${C.cyan}10`, color: C.cyan, fontSize: 10, fontFamily: C.mono, cursor: "pointer" }}>Get next steps →</button>
                <button onClick={() => setShowExport(true)} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.green}44`, background: `${C.green}12`, color: C.green, fontSize: 10, fontFamily: C.mono, cursor: "pointer" }}>↓ Export</button>
              </motion.div>
            )}

            {/* Scrollable steps */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
              {steps.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.textMute, fontSize: 12, gap: 10, minHeight: 200 }}>
                  <div style={{ fontSize: 32 }}>⚡</div>
                  <div>Add steps from the suggestions panel →</div>
                  <button onClick={() => setShowTemplates(true)} style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.borderMd}`, background: "transparent", color: C.textSub, fontSize: 11, cursor: "pointer", fontFamily: C.sans }}>or load a template</button>
                </div>
              ) : (
                <Reorder.Group axis="y" values={steps} onReorder={newOrder => { if (!isRunning) setSteps(newOrder); }} style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 }} as="div">
                  <AnimatePresence>
                    {steps.map((step, idx) => (
                      <StepCard key={step.id} step={step} idx={idx} phase={phase} isRunning={isRunning}
                        expanded={expandedResult === step.id} onToggleExpand={() => setExpandedResult(expandedResult === step.id ? null : step.id)}
                        onRemove={() => removeStep(step.id)} onUpdateArg={(k, v) => updateArg(step.id, k, v)}
                        onRunFrom={() => runFrom(idx)} onGenerateSummary={() => generateSummary(step.id)} datasetCols={datasetCols} />
                    ))}
                  </AnimatePresence>
                  <div ref={stepsEndRef} style={{ height: 1 }} />
                </Reorder.Group>
              )}
            </div>
          </div>

          {/* Right: AI suggestions + advanced + collapsible columns */}
          <div style={{ width: 282, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: `1px solid ${C.border}`, overflow: "hidden" }}>
            {/* Tab header */}
            <div style={{ display: "flex", background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              {(["ai", "advanced"] as const).map(tab => (
                <button key={tab} onClick={() => setRightTab(tab)} style={{ flex: 1, padding: "10px 6px", background: rightTab === tab ? `${C.cyan}12` : "transparent", border: "none", borderBottom: rightTab === tab ? `2px solid ${C.cyan}` : "2px solid transparent", color: rightTab === tab ? C.cyan : C.textMute, fontSize: 10, fontFamily: C.mono, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em" }}>
                  {tab === "ai" ? "🤖 AI" : "⚙️ Advanced"}
                </button>
              ))}
            </div>

            {rightTab === "ai" && (
              <>
                <div style={{ padding: "8px 10px", background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: C.textMute }}>Context-aware</span>
                  <button onClick={() => fetchSuggestions(steps, datasetMeta, getLastResult())} disabled={loadingSuggest} style={{ background: "none", border: `1px solid ${C.borderMd}`, borderRadius: 5, padding: "3px 8px", color: C.cyan, fontSize: 10, fontFamily: C.mono, cursor: "pointer", opacity: loadingSuggest ? 0.5 : 1 }}>{loadingSuggest ? "…" : "↻ Refresh"}</button>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: 6, scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
                  {loadingSuggest && [1, 2, 3].map(i => <div key={i} style={{ height: 76, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, opacity: 0.3 + i * 0.1 }} />)}
                  {!loadingSuggest && !suggestions.length && <div style={{ padding: 14, textAlign: "center", color: C.textMute, fontSize: 11, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>{phase === "done" ? "✓ Done. Click ↻ for more." : "No suggestions. Click ↻ to refresh."}</div>}
                  <AnimatePresence>{suggestions.map((s, i) => <SuggestionCard key={s.tool + i} suggestion={s} onAdd={() => addStep(s)} disabled={isRunning} />)}</AnimatePresence>
                </div>
              </>
            )}

            {rightTab === "advanced" && (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: 5, scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
                {(["preprocessing", "cleaning", "modeling"] as const).map(cat => {
                  const tools = Object.entries(ADVANCED_TOOLS).filter(([, t]) => t.category === cat);
                  if (!tools.length) return null;
                  const catColor = CAT_COLOR[cat] || C.textSub;
                  return (
                    <div key={cat}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: catColor, fontFamily: C.mono, letterSpacing: "0.09em", textTransform: "uppercase", padding: "6px 2px 4px", display: "flex", alignItems: "center", gap: 5 }}>
                        <span>{CAT_ICON[cat]}</span> {cat}
                      </div>
                      {tools.map(([toolKey, tool]) => {
                        const alreadyAdded = steps.some(s => s.tool === toolKey);
                        return (
                          <motion.div key={toolKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            onClick={() => !isRunning && !alreadyAdded && addStep({ tool: toolKey, label: tool.label, args: { ...tool.args }, reason: tool.reason, category: tool.category })}
                            style={{ padding: "9px 11px", borderRadius: 8, background: alreadyAdded ? `${catColor}0A` : C.card, border: `1px solid ${alreadyAdded ? catColor + "30" : C.border}`, cursor: isRunning || alreadyAdded ? "default" : "pointer", opacity: alreadyAdded ? 0.6 : 1, marginBottom: 3 }}
                            whileHover={!isRunning && !alreadyAdded ? { borderColor: catColor + "66", backgroundColor: `${catColor}0D` } : {}}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: alreadyAdded ? catColor : C.text, fontFamily: C.head, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                                  {tool.label}{alreadyAdded && <span style={{ fontSize: 8, color: catColor, fontFamily: C.mono }}>✓ added</span>}
                                </div>
                                <div style={{ fontSize: 9.5, color: C.textMute, lineHeight: 1.5 }}>{tool.reason.split(".")[0]}.</div>
                              </div>
                              {!alreadyAdded && !isRunning && <span style={{ fontSize: 14, color: catColor, opacity: 0.5 }}>+</span>}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Collapsible Columns Panel — always shown when cols available ── */}
            {datasetCols.all.length > 0 && <ColsPanel datasetCols={datasetCols} />}
          </div>
        </div>
      </div>

      {/* Inline Request Flow panel */}
      <AnimatePresence>
        {showFlows && (
          <motion.div key="flow-panel" initial={{ width: 0 }} animate={{ width: 320 }} exit={{ width: 0 }} transition={{ type: "spring", stiffness: 340, damping: 34 }} style={{ flexShrink: 0, overflow: "hidden", height: "100%", borderLeft: `1px solid ${C.border}` }}>
            <div style={{ width: 320, height: "100%" }}>
              <RequestFlowPanel onClose={() => setShowFlows(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showExport && <ExportModal steps={steps} pipelineName={pipelineName} onClose={() => setShowExport(false)} />}
        {showTemplates && <TemplateModal onSelect={loadTemplate} onClose={() => setShowTemplates(false)} />}
        {showDownloadCSV && sessionId && <DownloadCSVModal sessionId={sessionId} defaultName={datasetLabel || pipelineName} onClose={() => setShowDownloadCSV(false)} />}
      </AnimatePresence>

      <style>{`
        @keyframes rfspin  { to { transform: rotate(360deg); } }
        @keyframes pls     { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes rfpulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes dot     { 0%,80%,100%{transform:scale(0.6);opacity:0.3} 40%{transform:scale(1);opacity:1} }
      `}</style>
    </div>
  );
}