// app/components/PipelineBuilder.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";

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
const MULTI_COL_ARGS = new Set(["columns_to_scale", "columns_to_encode", "feature_columns"]);

export const ADVANCED_TOOLS: Record<string, { label: string; category: string; args: Record<string, any>; reason: string }> = {
  standard_scaler:      { label: "Standard Scaler (Z-score)",           category: "preprocessing", args: { columns_to_scale: "" }, reason: "Standardize numeric features to zero mean and unit variance." },
  min_max_scaler:       { label: "Min-Max Scaler [0,1]",                category: "preprocessing", args: { columns_to_scale: "", feature_range_min: "0", feature_range_max: "1" }, reason: "Rescale features to [0,1] range." },
  robust_scaler:        { label: "Robust Scaler (IQR)",                 category: "preprocessing", args: { columns_to_scale: "" }, reason: "Scale using median and IQR — resistant to outliers." },
  log_transform:        { label: "Log Transform (skew fix)",            category: "preprocessing", args: { column: "" }, reason: "Apply log1p transform to reduce right skew." },
  one_hot_encode:       { label: "One-Hot Encoding",                    category: "preprocessing", args: { columns_to_encode: "", drop_first: "true" }, reason: "Convert categorical columns to binary dummy variables." },
  label_encode:         { label: "Label Encoding (ordinal)",            category: "preprocessing", args: { column: "" }, reason: "Map categories to integers." },
  pca_transform:        { label: "PCA Dimensionality Reduction",        category: "preprocessing", args: { n_components: "5", target_column: "" }, reason: "Reduce feature dimensions via PCA." },
  polynomial_features:  { label: "Polynomial Features",                category: "preprocessing", args: { columns_to_scale: "", degree: "2" }, reason: "Create interaction and polynomial terms." },
  drop_columns:         { label: "Drop Columns",                        category: "cleaning",      args: { column: "" }, reason: "Remove a column from the dataset." },
  train_test_split:     { label: "Train/Test Split",                    category: "preprocessing", args: { target_column: "", test_size: "0.2", stratify: "false" }, reason: "Split dataset into train/test sets." },
  auto_ml_pipeline:     { label: "AutoML Pipeline",                    category: "modeling",      args: { target_column: "", cv_folds: "5" }, reason: "Train RF, XGBoost, LightGBM with CV. Picks best model." },
  cross_validate_model: { label: "Cross-Validate Model",               category: "modeling",      args: { target_column: "", model: "random_forest", cv_folds: "5" }, reason: "Run k-fold cross-validation." },
  hyperparameter_tune:  { label: "Hyperparameter Tuning",              category: "modeling",      args: { target_column: "", model: "random_forest", cv_folds: "3" }, reason: "Grid search for optimal hyperparameters." },
  feature_importance:   { label: "Feature Importance",                 category: "modeling",      args: { target_column: "" }, reason: "Rank features by predictive importance." },
  model_evaluation:     { label: "Model Evaluation Report",            category: "modeling",      args: { target_column: "", model: "random_forest" }, reason: "Full metric suite + confusion matrix chart." },
};

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

type RFType = "llm" | "tool" | "upload";
interface RFEntry {
  id: string; type: RFType; label: string; detail?: string;
  status: "running" | "success" | "error";
  timestamp: Date; durationMs?: number;
}

const _rfStore: RFEntry[] = [];
let _rfListeners: (() => void)[] = [];

function addRF(e: Omit<RFEntry, "id" | "timestamp">): string {
  const full: RFEntry = { ...e, id: `rf-${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: new Date() };
  _rfStore.unshift(full);
  if (_rfStore.length > 100) _rfStore.pop();
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

function RequestFlowPanel({ onClose }: { onClose: () => void }) {
  const flows = useRF();
  const llmCount = flows.filter(f => f.type === "llm").length;
  const toolCount = flows.filter(f => f.type === "tool").length;
  const errorCount = flows.filter(f => f.status === "error").length;
  const runningCount = flows.filter(f => f.status === "running").length;
  const ordered = [...flows].reverse();

  const nodeColor = (e: RFEntry) => {
    if (e.status === "error") return C.red;
    if (e.status === "running") return C.amber;
    if (e.type === "llm") return C.violet;
    if (e.type === "tool") return C.cyan;
    return C.amber;
  };

  const nodeIcon = (e: RFEntry) => {
    if (e.status === "running") return (
      <div style={{ width: 10, height: 10, border: `2px solid ${nodeColor(e)}`, borderTopColor: "transparent", borderRadius: "50%", animation: "rfspin 0.8s linear infinite" }} />
    );
    if (e.type === "llm") return <span style={{ fontSize: 12 }}>🤖</span>;
    if (e.type === "tool") return <span style={{ fontSize: 12 }}>⚙️</span>;
    return <span style={{ fontSize: 12 }}>📂</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0D0D0D" }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span>📡</span>
            <span style={{ fontFamily: C.head, fontSize: 13, fontWeight: 700, color: C.text }}>Request Flow</span>
            {runningCount > 0 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber, animation: "rfpulse 1.2s ease-in-out infinite" }} />}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={() => { _rfStore.length = 0; _rfListeners.forEach(f => f()); }} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textMute, cursor: "pointer", fontFamily: C.mono }}>Clear</button>
            <button onClick={onClose} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textMute, cursor: "pointer", fontFamily: C.mono }}>✕</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${C.violet}18`, color: C.violet, border: `1px solid ${C.violet}30`, fontFamily: C.mono }}>🤖 LLM ({llmCount})</span>
          <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${C.cyan}18`, color: C.cyan, border: `1px solid ${C.cyan}30`, fontFamily: C.mono }}>⚙️ Tool ({toolCount})</span>
          {errorCount > 0 && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${C.red}18`, color: C.red, border: `1px solid ${C.red}30`, fontFamily: C.mono }}>⚠ {errorCount} err</span>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 12px 16px 14px", scrollbarWidth: "thin" as const }}>
        {flows.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 16px", color: C.textMute, fontSize: 11, fontFamily: C.mono }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
            No activity yet.<br />Run a pipeline to see the flow.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {ordered.map((entry, idx) => {
            const color = nodeColor(entry);
            const isLast = idx === ordered.length - 1;
            const isErr = entry.status === "error";
            const prevColor = idx > 0 ? nodeColor(ordered[idx - 1]) : color;
            const tagLabel = entry.type === "llm" ? "LLM" : entry.type === "tool" ? "TOOL" : "UPLOAD";
            return (
              <div key={entry.id} style={{ display: "flex", gap: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 34, flexShrink: 0 }}>
                  {idx > 0 && (
                    <div style={{ width: 2, height: 14, background: `linear-gradient(to bottom, ${prevColor}55, ${color}55)`, flexShrink: 0 }} />
                  )}
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: isErr ? `${C.red}20` : entry.status === "running" ? `${color}28` : `${color}18`,
                    border: `2px solid ${isErr ? C.red : entry.status === "running" ? color : color + "77"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: entry.status === "running" ? `0 0 12px ${color}55` : "none",
                    transition: "all 0.3s",
                  }}>
                    {nodeIcon(entry)}
                  </div>
                  {!isLast && <div style={{ width: 2, flex: 1, minHeight: 14, background: `${color}44` }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingLeft: 10, paddingBottom: isLast ? 0 : 8, paddingTop: idx === 0 ? 0 : 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 4, background: `${color}18`, color, fontFamily: C.mono, fontWeight: 700, border: `1px solid ${color}30`, letterSpacing: "0.06em" }}>
                      {tagLabel}
                    </span>
                    {isErr && <span style={{ fontSize: 8, color: C.red, fontFamily: C.mono, fontWeight: 600 }}>FAILED</span>}
                    {entry.status === "running" && <span style={{ fontSize: 8, color: C.amber, fontFamily: C.mono }}>RUNNING…</span>}
                    {entry.durationMs != null && entry.status !== "running" && (
                      <span style={{ fontSize: 8, color: C.textMute, fontFamily: C.mono, marginLeft: "auto" }}>{entry.durationMs}ms</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: isErr ? C.red : C.text, lineHeight: 1.4, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {entry.label}
                  </div>
                  {entry.detail && (
                    <div style={{ fontSize: 9.5, color: isErr ? C.red + "bb" : C.textMute, fontFamily: C.mono, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {isErr ? "✗ " : entry.status === "success" ? "✓ " : ""}{entry.detail}
                    </div>
                  )}
                  <div style={{ fontSize: 8.5, color: C.textMute, fontFamily: C.mono, marginTop: 2 }}>
                    {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.border}`, flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
        {[{ label: "LLM Calls", v: llmCount, color: C.violet }, { label: "Tool Runs", v: toolCount, color: C.cyan }, { label: "Errors", v: errorCount, color: errorCount > 0 ? C.red : C.textMute }].map(s => (
          <div key={s.label} style={{ textAlign: "center", padding: "5px 2px", borderRadius: 7, background: C.card, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: C.head, lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: 8, color: C.textMute, fontFamily: C.mono, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function downloadSessionCSV(sessionId: string, filename: string) {
  const res = await fetch(`/api/agent/session/${sessionId}/download`);
  if (!res.ok) throw new Error("Failed to download CSV");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename.endsWith(".csv") ? filename : filename + ".csv"; a.click();
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
          <div style={{ fontSize: 12, color: C.textSub }}>Downloads the current session state after all pipeline steps.</div>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", background: C.input, border: `1px solid ${C.borderMd}`, borderRadius: 9, overflow: "hidden" }}>
            <input value={filename} onChange={e => setFilename(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, "_"))} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 13, fontFamily: C.mono, padding: "10px 14px" }} onKeyDown={e => e.key === "Enter" && handleDownload()} />
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

function MultiColDropdown({ value, onChange, cols, label }: { value: string; onChange: (v: string) => void; cols: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const pid = useRef(`mcdp-${Math.random().toString(36).slice(2)}`);
  const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
  const toggle = (col: string) => {
    const set = new Set(selected);
    if (set.has(col)) set.delete(col); else set.add(col);
    onChange(Array.from(set).join(", "));
  };
  const openDrop = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const dh = Math.min(cols.length * 36 + 60, 260);
    setPos({ top: window.innerHeight - r.bottom < dh && r.top > dh ? r.top - dh - 4 : r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
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
    <div id={pid.current} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 99999, background: "#1E1E1E", border: `1px solid ${C.borderMd}`, borderRadius: 10, maxHeight: 260, overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.7)", scrollbarWidth: "thin" as const }}>
      <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textMute, fontFamily: C.mono, display: "flex", justifyContent: "space-between" }}>
        <span>{cols.length} columns</span>
        <button onMouseDown={e => { e.preventDefault(); onChange(cols.join(", ")); }} style={{ background: "none", border: "none", color: C.cyan, cursor: "pointer", fontSize: 9, fontFamily: C.mono }}>Select all</button>
      </div>
      <button onMouseDown={e => { e.preventDefault(); onChange(""); setOpen(false); }} style={{ display: "block", width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: C.textMute, fontSize: 11, fontFamily: C.mono, cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.border}` }}>— clear all —</button>
      {cols.map(col => {
        const isSel = selected.includes(col);
        return (
          <button key={col} onMouseDown={e => { e.preventDefault(); toggle(col); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: isSel ? `${C.cyan}15` : "transparent", border: "none", color: isSel ? C.cyan : C.textSub, fontSize: 11, fontFamily: C.mono, cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${isSel ? C.cyan : C.textMute}`, background: isSel ? C.cyan : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {isSel && <span style={{ color: "#030712", fontSize: 9, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{col}</span>
          </button>
        );
      })}
    </div>, document.body) : null;
  const displayText = selected.length === 0 ? null : selected.length === 1 ? selected[0] : `${selected.length} columns`;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{label}</label>
      <button ref={btnRef} onClick={open ? () => setOpen(false) : openDrop} style={{ display: "flex", alignItems: "center", gap: 6, background: C.input, border: `1px solid ${open ? C.cyan + "66" : C.border}`, borderRadius: 6, padding: "5px 10px", color: displayText ? C.text : C.textMute, fontSize: 11, fontFamily: C.mono, cursor: "pointer", minWidth: 160, outline: "none" }}>
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{displayText || <span style={{ color: C.textMute }}>Select columns…</span>}</span>
        {selected.length > 0 && <span style={{ fontSize: 9, background: `${C.cyan}20`, color: C.cyan, padding: "1px 5px", borderRadius: 8, flexShrink: 0 }}>{selected.length}</span>}
        <span style={{ color: C.textMute, fontSize: 9, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
      </button>
      {portal}
    </div>
  );
}

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
      <button onMouseDown={e => { e.preventDefault(); onChange(""); setOpen(false); }} style={{ display: "block", width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: C.textMute, fontSize: 11, fontFamily: C.mono, cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.border}` }}>— clear —</button>
      {cols.map(col => (
        <button key={col} onMouseDown={e => { e.preventDefault(); onChange(col); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: col === value ? `${C.cyan}15` : "transparent", border: "none", color: col === value ? C.cyan : C.textSub, fontSize: 11, fontFamily: C.mono, cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.border}` }} onMouseEnter={e => { if (col !== value) (e.currentTarget as HTMLElement).style.background = C.cardHover; }} onMouseLeave={e => { if (col !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: col === value ? C.cyan : C.textMute, flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{col}</span>
          {col === value && <span style={{ fontSize: 9, color: C.cyan }}>✓</span>}
        </button>
      ))}
    </div>, document.body) : null;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{label}</label>
      <button ref={btnRef} onClick={open ? () => setOpen(false) : openDrop} style={{ display: "flex", alignItems: "center", gap: 6, background: C.input, border: `1px solid ${open ? C.cyan + "66" : C.border}`, borderRadius: 6, padding: "5px 10px", color: value ? C.text : C.textMute, fontSize: 11, fontFamily: C.mono, cursor: "pointer", minWidth: 160, outline: "none" }}>
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{value || <span style={{ color: C.textMute }}>Select column…</span>}</span>
        <span style={{ color: C.textMute, fontSize: 9, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
      </button>
      {portal}
    </div>
  );
}

function ArgField({ argKey, value, onChange, datasetCols }: { argKey: string; value: string; onChange: (v: string) => void; datasetCols: DatasetColumns }) {
  const colType = COL_ARG_MAP[argKey] as keyof DatasetColumns | undefined;
  if (colType && MULTI_COL_ARGS.has(argKey)) return <MultiColDropdown value={value} onChange={onChange} cols={datasetCols[colType]} label={argKey} />;
  if (colType) return <ColDropdown value={value} onChange={onChange} cols={datasetCols[colType]} label={argKey} />;
  if (argKey === "model") return (<div><label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{argKey}</label><select value={value} onChange={e => onChange(e.target.value)} style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", color: C.text, fontSize: 11, fontFamily: C.mono, outline: "none", minWidth: 160, cursor: "pointer" }}>{["random_forest", "xgboost", "lightgbm", "svm", "logistic_regression"].map(m => <option key={m} value={m}>{m}</option>)}</select></div>);
  if (["stratify", "drop_first", "include_preprocessing"].includes(argKey)) return (<div><label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{argKey}</label><select value={value} onChange={e => onChange(e.target.value)} style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", color: C.text, fontSize: 11, fontFamily: C.mono, outline: "none", cursor: "pointer" }}><option value="true">true</option><option value="false">false</option></select></div>);
  return (<div><label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{argKey}</label><input value={value} onChange={e => onChange(e.target.value)} style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", color: C.text, fontSize: 11, fontFamily: C.mono, outline: "none", width: 120 }} /></div>);
}

function DragHandle({ controls }: { controls: ReturnType<typeof useDragControls> }) {
  return <div onPointerDown={e => controls.start(e)} style={{ color: C.textMute, cursor: "grab", fontSize: 16, flexShrink: 0, padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none" as const, touchAction: "none" as const }}>⠿</div>;
}

function SmallBadge({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div style={{ padding: "6px 10px", borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 1, minWidth: 64 }}>
      <div style={{ fontSize: 8.5, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || C.text, fontFamily: C.head }}>{value ?? "—"}</div>
    </div>
  );
}

function DatasetOverviewResult({ r }: { r: any }) {
  const shape = r.shape || {};
  const types = r.column_types || {};
  const miss = r.missing_data_summary || {};
  const numS = r.numeric_summary || {};
  const catS = r.categorical_summary || {};
  return (
    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
        {shape.rows != null && <SmallBadge label="Rows" value={shape.rows?.toLocaleString()} color={C.cyan} />}
        {shape.columns != null && <SmallBadge label="Columns" value={shape.columns} color={C.violet} />}
        {r.memory_usage_mb != null && <SmallBadge label="Memory MB" value={r.memory_usage_mb} color={C.teal} />}
        {miss.total_missing_values != null && <SmallBadge label="Missing" value={miss.total_missing_values} color={miss.total_missing_values > 0 ? C.amber : C.green} />}
        {miss.missing_percentage != null && <SmallBadge label="Missing %" value={`${miss.missing_percentage}%`} color={miss.missing_percentage > 10 ? C.red : C.green} />}
      </div>
      {(types.numeric?.length > 0 || types.categorical?.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {types.numeric?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: C.cyan, fontFamily: C.mono, marginBottom: 3 }}># {types.numeric.length} Numeric</div>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 3 }}>
                {types.numeric.map((c: string) => <span key={c} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${C.cyan}12`, color: C.cyan, fontFamily: C.mono, border: `1px solid ${C.cyan}20` }}>{c}</span>)}
              </div>
            </div>
          )}
          {types.categorical?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: C.violet, fontFamily: C.mono, marginBottom: 3 }}>A {types.categorical.length} Categorical</div>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 3 }}>
                {types.categorical.map((c: string) => <span key={c} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${C.violet}12`, color: C.violet, fontFamily: C.mono, border: `1px solid ${C.violet}20` }}>{c}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
      {Object.keys(numS).length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Numeric Summary</div>
          <div style={{ overflowX: "auto" as const }}>
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 9.5, fontFamily: C.mono }}>
              <thead>
                <tr>{["Column","Mean","Median","Std","Min","Max"].map(h => (
                  <th key={h} style={{ padding: "4px 8px", textAlign: "left" as const, color: C.textMute, fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" as const }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {Object.entries(numS).map(([col, s]: [string, any]) => (
                  <tr key={col} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "4px 8px", color: C.cyan, fontWeight: 600 }}>{col}</td>
                    <td style={{ padding: "4px 8px", color: C.textSub }}>{s.mean}</td>
                    <td style={{ padding: "4px 8px", color: C.textSub }}>{s.median}</td>
                    <td style={{ padding: "4px 8px", color: C.textSub }}>{s.std}</td>
                    <td style={{ padding: "4px 8px", color: C.textSub }}>{s.min}</td>
                    <td style={{ padding: "4px 8px", color: C.textSub }}>{s.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {Object.keys(catS).length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Categorical Summary</div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
            {Object.entries(catS).map(([col, s]: [string, any]) => (
              <div key={col} style={{ padding: "7px 10px", borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, minWidth: 110 }}>
                <div style={{ fontSize: 9, color: C.violet, fontFamily: C.mono, fontWeight: 600, marginBottom: 2 }}>{col}</div>
                <div style={{ fontSize: 10, color: C.textSub }}>{s.unique_count} unique</div>
                <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono }}>Top: "{s.most_frequent}" ({s.most_frequent_count}×)</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MissingValuesResult({ r }: { r: any }) {
  return (
    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <SmallBadge label="Total Rows" value={r.total_rows?.toLocaleString()} color={C.cyan} />
        <SmallBadge label="Cols w/ Missing" value={r.columns_with_missing} color={r.columns_with_missing > 0 ? C.amber : C.green} />
      </div>
      {r.missing_data?.length > 0 ? (
        <div>
          <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Missing by Column</div>
          {r.missing_data.map((m: any) => (
            <div key={m.column} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 10, color: C.cyan, fontFamily: C.mono, minWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>{m.column}</span>
              <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(m.null_percentage, 100)}%`, background: m.null_percentage > 30 ? C.red : C.amber, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, minWidth: 50, textAlign: "right" as const }}>{m.null_count} ({m.null_percentage}%)</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "8px 12px", background: `${C.green}0D`, borderRadius: 8, border: `1px solid ${C.green}22`, fontSize: 11, color: C.green }}>✓ No missing values found!</div>
      )}
    </div>
  );
}

function DataQualityResult({ r }: { r: any }) {
  const info = r.dataset_info || {}; const miss = r.missing_data || {}; const dupes = r.duplicates || {};
  return (
    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
        <SmallBadge label="Rows" value={info.rows?.toLocaleString()} color={C.cyan} />
        <SmallBadge label="Columns" value={info.columns} color={C.violet} />
        <SmallBadge label="Memory MB" value={info.memory_mb} color={C.teal} />
        <SmallBadge label="Duplicates" value={dupes.duplicate_rows} color={dupes.duplicate_rows > 0 ? C.amber : C.green} />
        <SmallBadge label="Missing" value={miss.total_missing} color={miss.total_missing > 0 ? C.amber : C.green} />
      </div>
      {r.potential_issues?.length > 0 ? (
        <div style={{ padding: "8px 12px", background: `${C.amber}08`, borderRadius: 8, border: `1px solid ${C.amber}22` }}>
          <div style={{ fontSize: 9, color: C.amber, fontFamily: C.mono, marginBottom: 4, textTransform: "uppercase" as const }}>⚠ Issues</div>
          {r.potential_issues.map((i: string, idx: number) => <div key={idx} style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>• {i}</div>)}
        </div>
      ) : (
        <div style={{ padding: "8px 12px", background: `${C.green}08`, borderRadius: 8, border: `1px solid ${C.green}22`, fontSize: 11, color: C.green }}>✓ No major data quality issues!</div>
      )}
    </div>
  );
}

function AutoMLResult({ r }: { r: any }) {
  const isClass = r.problem_type === "classification";
  return (
    <div style={{ padding: "12px" }}>
      <div style={{ textAlign: "center", paddingBottom: 10 }}>
        <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, marginBottom: 4, textTransform: "uppercase" as const }}>Best Model</div>
        <div style={{ fontFamily: C.head, fontSize: 20, fontWeight: 700, color: C.green }}>{r.best_model}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.text, fontFamily: C.head, marginTop: 2 }}>{((r.best_score || 0) * 100).toFixed(1)}%</div>
        <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono }}>{isClass ? "ACCURACY" : "R² SCORE"}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {Object.entries(r.results || {}).map(([name, metrics]: [string, any]) => {
          if (metrics.error) return null;
          const score = isClass ? metrics.accuracy : metrics.r2_score;
          const isBest = name === r.best_model;
          return (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, background: isBest ? `${C.green}0D` : "transparent", border: `1px solid ${isBest ? C.green + "33" : C.border}` }}>
              {isBest && <span style={{ fontSize: 9, color: C.green }}>★</span>}
              <span style={{ fontSize: 11, color: isBest ? C.green : C.textSub, flex: 1 }}>{name}</span>
              {metrics.cv_mean != null && <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono }}>CV: {(metrics.cv_mean * 100).toFixed(1)}%</span>}
              <span style={{ fontFamily: C.mono, fontSize: 11, color: isBest ? C.green : C.textMute }}>
                {isClass ? `${((score ?? 0) * 100).toFixed(1)}%` : `R²=${(score ?? 0).toFixed(3)}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GenericResult({ result }: { result: any }) {
  if (!result || typeof result !== "object") return null;
  const simple = Object.entries(result).filter(([, v]) => typeof v !== "object" && !Array.isArray(v)).slice(0, 8);
  if (!simple.length) return null;
  return (
    <div style={{ padding: "12px" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
        {simple.map(([k, v]) => <SmallBadge key={k} label={k.replace(/_/g, " ")} value={String(v)} />)}
      </div>
    </div>
  );
}

function HumanResult({ step }: { step: PipelineStep }) {
  const { tool, result, imageBase64 } = step;
  if (!result && !imageBase64) return null;
  return (
    <div>
      {imageBase64 && (
        <div style={{ padding: "0 12px 8px" }}>
          <img src={imageBase64} alt="Chart" style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} />
          <button onClick={() => { const a = document.createElement("a"); a.href = imageBase64; a.download = `${tool}_chart.png`; a.click(); }} style={{ marginTop: 6, padding: "4px 12px", borderRadius: 5, border: `1px solid ${C.teal}44`, background: `${C.teal}10`, color: C.teal, fontSize: 10, fontFamily: C.mono, cursor: "pointer", fontWeight: 600 }}>
            ⬇ Download Chart
          </button>
        </div>
      )}
      {result && !imageBase64 && (() => {
        if (tool === "dataset_overview") return <DatasetOverviewResult r={result} />;
        if (tool === "detect_missing_values") return <MissingValuesResult r={result} />;
        if (tool === "auto_ml_pipeline") return <AutoMLResult r={result} />;
        if (tool === "data_quality_report") return <DataQualityResult r={result} />;
        return <GenericResult result={result} />;
      })()}
      {result && imageBase64 && <GenericResult result={result} />}
    </div>
  );
}

function AISummary({ step, onGenerate }: { step: PipelineStep; onGenerate: () => void }) {
  if (step.status !== "done") return null;
  return (
    <div style={{ margin: "0 12px 12px", padding: "10px 12px", background: `${C.violet}0D`, border: `1px solid ${C.violet}25`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: step.aiSummary ? 6 : 0 }}>
        <span>✨</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.violet, fontFamily: C.head }}>AI Insight</span>
        {!step.aiSummary && !step.loadingSummary && <button onClick={onGenerate} style={{ marginLeft: "auto", fontSize: 9, padding: "2px 8px", borderRadius: 4, border: `1px solid ${C.violet}44`, background: `${C.violet}15`, color: C.violet, cursor: "pointer", fontFamily: C.mono }}>Explain →</button>}
        {step.loadingSummary && <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>{[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: C.violet, animation: `dot 1.2s ${i*0.2}s ease-in-out infinite` }} />)}</div>}
      </div>
      {step.aiSummary && <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{step.aiSummary}</p>}
    </div>
  );
}

function StatusBadge({ status, color }: { status: PipelineStep["status"]; color: string }) {
  const cfg = { pending: { label: "Pending", bg: C.border, tc: C.textMute }, running: { label: "Running", bg: `${color}22`, tc: color }, done: { label: "Done", bg: `${C.green}22`, tc: C.green }, error: { label: "Error", bg: `${C.red}22`, tc: C.red } }[status];
  return <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: cfg.bg, color: cfg.tc, fontFamily: C.mono, fontWeight: 600, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>{status === "running" && <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, animation: "pls 1.2s ease-in-out infinite" }} />}{cfg.label}</span>;
}

function StepCard({ step, idx, phase, isRunning, expanded, onToggleExpand, onRemove, onUpdateArg, onRunFrom, onGenerateSummary, datasetCols }: { step: PipelineStep; idx: number; phase: string; isRunning: boolean; expanded: boolean; onToggleExpand: () => void; onRemove: () => void; onUpdateArg: (k: string, v: string) => void; onRunFrom: () => void; onGenerateSummary: () => void; datasetCols: DatasetColumns; }) {
  const controls = useDragControls();
  const color = CAT_COLOR[step.category] || C.textSub;
  const [hovRun, setHovRun] = useState(false);
  const canRunFrom = !isRunning && (step.status === "pending" || step.status === "error") && idx > 0;
  const borderColor = step.status === "running" ? color + "88" : step.status === "done" ? color + "33" : step.status === "error" ? C.red + "55" : C.border;
  const hasResult = !!(step.result || step.imageBase64);
  return (
    <Reorder.Item value={step} id={step.id} dragListener={false} dragControls={controls} as="div" style={{ background: C.card, border: `1px solid ${borderColor}`, borderRadius: 12, overflow: "hidden", flexShrink: 0, cursor: "default" }} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.2 }} whileDrag={{ scale: 1.01, boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${color}55`, zIndex: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", background: step.status === "running" ? `${color}08` : "transparent" }}>
        {!isRunning ? <DragHandle controls={controls} /> : <div style={{ width: 20 }} />}
        <div style={{ width: 22, height: 22, borderRadius: 6, background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color, fontFamily: C.mono, flexShrink: 0 }}>{idx + 1}</div>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{CAT_ICON[step.category] || "⚙️"}</span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, fontFamily: C.head, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{step.label}</div><div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono }}>{step.tool}</div></div>
        {canRunFrom && <button onClick={onRunFrom} onMouseEnter={() => setHovRun(true)} onMouseLeave={() => setHovRun(false)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${hovRun ? color + "66" : C.border}`, background: hovRun ? `${color}18` : "transparent", color: hovRun ? color : C.textMute, fontSize: 9, fontFamily: C.mono, cursor: "pointer", flexShrink: 0 }}>▶ from here</button>}
        <StatusBadge status={step.status} color={color} />
        {step.executionMs != null && <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, flexShrink: 0 }}>{step.executionMs}ms</span>}
        {!isRunning && phase !== "run" && <button onClick={onRemove} style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", fontSize: 12, padding: "2px 4px", borderRadius: 4, flexShrink: 0 }} onMouseEnter={e => (e.currentTarget.style.color = C.red)} onMouseLeave={e => (e.currentTarget.style.color = C.textMute)}>✕</button>}
      </div>
      {step.status === "error" && step.errorMsg && <div style={{ padding: "7px 13px", background: `${C.red}08`, borderTop: `1px solid ${C.red}22`, fontSize: 11, color: C.red, fontFamily: C.mono, lineHeight: 1.5, wordBreak: "break-word" as const }}>⚠ {step.errorMsg.slice(0, 250)}</div>}
      {!isRunning && Object.keys(step.args).length > 0 && <div style={{ padding: "10px 13px", borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap" as const, gap: 10 }}>{Object.entries(step.args).map(([key, val]) => <ArgField key={key} argKey={key} value={String(val)} onChange={v => onUpdateArg(key, v)} datasetCols={datasetCols} />)}</div>}
      <div style={{ padding: "5px 13px 8px", fontSize: 10, color: C.textMute, fontFamily: C.sans, borderTop: `1px solid ${C.border}`, fontStyle: "italic", lineHeight: 1.55 }}>{step.reason}</div>
      {hasResult && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          <button onClick={onToggleExpand} style={{ width: "100%", padding: "7px 13px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color, fontSize: 10, fontFamily: C.mono, textAlign: "left" as const }}>{expanded ? "▲" : "▼"} {expanded ? "Hide" : "View"} Results</button>
          <AnimatePresence>
            {expanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: "hidden" }}>
                <HumanResult step={step} />
                <AISummary step={step} onGenerate={onGenerateSummary} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      {step.status === "running" && <div style={{ height: 2, background: `${color}20`, overflow: "hidden" }}><motion.div style={{ height: "100%", background: color }} animate={{ x: ["-100%", "100%"] }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }} /></div>}
    </Reorder.Item>
  );
}

function SuggestionCard({ suggestion, onAdd, disabled }: { suggestion: any; onAdd: () => void; disabled: boolean }) {
  const [hov, setHov] = useState(false);
  const color = CAT_COLOR[suggestion.category] || C.textSub;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18 }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={disabled ? undefined : onAdd}
      style={{ padding: "10px 12px", borderRadius: 10, background: hov && !disabled ? C.cardHover : C.card, border: `1px solid ${hov && !disabled ? color + "55" : C.border}`, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s", opacity: disabled ? 0.5 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 13 }}>{CAT_ICON[suggestion.category] || "⚙️"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.head, flex: 1 }}>{suggestion.label}</span>
        <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: `${color}18`, color, fontFamily: C.mono, fontWeight: 600, border: `1px solid ${color}33` }}>{suggestion.category}</span>
      </div>
      <div style={{ fontSize: 9.5, color: C.textMute, fontFamily: C.mono, marginBottom: 3 }}>{suggestion.tool}</div>
      <div style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5 }}>{suggestion.reason}</div>
      {hov && !disabled && <div style={{ marginTop: 6, fontSize: 10, color, fontFamily: C.mono, fontWeight: 600 }}>+ Add to pipeline →</div>}
    </motion.div>
  );
}

function ColsPanel({ datasetCols }: { datasetCols: DatasetColumns }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: C.card, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" as const }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.07em", textTransform: "uppercase" as const, flex: 1 }}>🗂 Columns ({datasetCols.all.length})</span>
        <span style={{ fontSize: 8, color: C.textMute, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>▲</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "2px 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              {datasetCols.numeric.length > 0 && <div><div style={{ fontSize: 9, color: C.cyan, fontFamily: C.mono, marginBottom: 3 }}># {datasetCols.numeric.length} numeric</div><div style={{ display: "flex", flexWrap: "wrap" as const, gap: 3, maxHeight: 80, overflowY: "auto" as const }}>{datasetCols.numeric.map(c => <span key={c} title={c} style={{ fontSize: 8, padding: "2px 5px", borderRadius: 3, background: `${C.cyan}12`, color: C.cyan, fontFamily: C.mono, border: `1px solid ${C.cyan}20`, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c}</span>)}</div></div>}
              {datasetCols.categorical.length > 0 && <div><div style={{ fontSize: 9, color: C.violet, fontFamily: C.mono, marginBottom: 3 }}>A {datasetCols.categorical.length} categorical</div><div style={{ display: "flex", flexWrap: "wrap" as const, gap: 3, maxHeight: 80, overflowY: "auto" as const }}>{datasetCols.categorical.map(c => <span key={c} title={c} style={{ fontSize: 8, padding: "2px 5px", borderRadius: 3, background: `${C.violet}12`, color: C.violet, fontFamily: C.mono, border: `1px solid ${C.violet}20`, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c}</span>)}</div></div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function PipelineBuilder({ onSaved, initialPipeline }: PipelineBuilderProps) {
  const isEditing = !!initialPipeline;
  const [phase, setPhase] = useState<"upload"|"build"|"run"|"done">(isEditing ? "build" : "upload");
  const [sessionId, setSessionId] = useState<string|null>(initialPipeline?.sessionId ?? null);
  const [datasetMeta, setDatasetMeta] = useState(initialPipeline?.metadata?.datasetMeta ?? "");
  const [datasetLabel, setDatasetLabel] = useState(isEditing ? (initialPipeline?.name?.replace(/^Pipeline\s*[–-]\s*/i,"") || "") : "");
  const [datasetCols, setDatasetCols] = useState<DatasetColumns>(() => {
    const meta = initialPipeline?.metadata?.datasetMeta ?? "";
    const nm = meta.match(/Numeric columns:\s*([^\n]+)/);
    const cm = meta.match(/Categorical columns:\s*([^\n]+)/);
    const nc = nm ? nm[1].split(",").map((c:string) => c.trim()).filter(Boolean) : [];
    const cc = cm ? cm[1].split(",").map((c:string) => c.trim()).filter((c:string) => c !== "none") : [];
    return { all:[...nc,...cc], numeric:nc, categorical:cc };
  });
  const [steps, setSteps] = useState<PipelineStep[]>(() => {
    if (!initialPipeline?.steps?.length) return [];
    return initialPipeline.steps.map((s:any,i:number) => ({
      id: s.id || `step-${Date.now()}-${i}`,
      tool: s.tool, label: s.label, args: s.args||{}, reason: s.reason||"",
      category: s.category||"eda", status: "pending" as const
    }));
  });
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [pipelineName, setPipelineName] = useState(initialPipeline?.name ?? "My Pipeline");
  const [pipelineId, setPipelineId] = useState<string|null>(initialPipeline?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string|null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expandedResult, setExpandedResult] = useState<string|null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDownloadCSV, setShowDownloadCSV] = useState(false);
  const [rightTab, setRightTab] = useState<"ai"|"advanced">("ai");
  const [showFlows, setShowFlows] = useState(false);
  const [renamingPipeline, setRenamingPipeline] = useState(false);

  const pipelineCreatedRef = useRef(false);
  const pipelineIdRef = useRef<string|null>(initialPipeline?.id ?? null);
  const flows = useRF();
  const activeFlows = flows.filter(f => f.status === "running").length;
  const recentErrors = flows.filter(f => f.status === "error" && Date.now() - f.timestamp.getTime() < 30000).length;
  const fileRef = useRef<HTMLInputElement>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stepsEndRef.current && steps.length > 0)
      stepsEndRef.current.scrollIntoView({ behavior:"smooth", block:"nearest" });
  }, [steps.length]);

  useEffect(() => {
    if (renamingPipeline && renameRef.current) { renameRef.current.focus(); renameRef.current.select(); }
  }, [renamingPipeline]);

  useEffect(() => { pipelineIdRef.current = pipelineId; }, [pipelineId]);

  // Restore session metadata when editing
  useEffect(() => {
    if (!isEditing || !initialPipeline?.sessionId) return;
    fetch(`/api/agent/session/${initialPipeline.sessionId}/metadata`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.found) return;
        const meta = data.metadata;
        const nc:string[] = meta.numeric_columns||[], cc:string[] = meta.categorical_columns||[];
        setDatasetCols({ all:[...nc,...cc], numeric:nc, categorical:cc });
        setDatasetLabel(meta.filename || datasetLabel);
        setDatasetMeta([
          `Filename: ${meta.filename}`,
          `Rows: ${meta.row_count?.toLocaleString()}, Columns: ${meta.column_count}`,
          `Size: ${meta.memory_usage_mb} MB`,
          `Numeric columns: ${nc.join(", ")||"none"}`,
          `Categorical columns: ${cc.join(", ")||"none"}`
        ].join("\n"));
      }).catch(() => {});
  }, [isEditing, initialPipeline?.sessionId]);

  useEffect(() => { if (isEditing && datasetMeta) fetchSuggestions(steps, datasetMeta, ""); }, [isEditing, datasetMeta]);

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) return;
    setUploading(true);
    const rfId = addRF({ type:"upload", label:`Uploading ${file.name}`, detail:`${(file.size/1024).toFixed(1)} KB`, status:"running" });
    try {
      const fd = new FormData(); fd.append("file", file);
      const t0 = Date.now();
      const res = await fetch("/api/agent/upload", { method:"POST", body:fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const meta = data.metadata;
      updateRF(rfId, { status:"success", durationMs:Date.now()-t0, detail:`${meta.row_count?.toLocaleString()} rows × ${meta.column_count} cols` });
      setSessionId(data.session_id);
      setDatasetLabel(meta.filename);
      const nc:string[] = meta.numeric_columns||[], cc:string[] = meta.categorical_columns||[];
      setDatasetCols({ all:[...nc,...cc], numeric:nc, categorical:cc });
      const ms = [
        `Filename: ${meta.filename}`,
        `Rows: ${meta.row_count?.toLocaleString()}, Columns: ${meta.column_count}`,
        `Size: ${meta.memory_usage_mb} MB`,
        `Numeric columns: ${nc.join(", ")||"none"}`,
        `Categorical columns: ${cc.join(", ")||"none"}`
      ].join("\n");
      setDatasetMeta(ms);
      setPipelineName(`Pipeline – ${meta.filename}`);
      setPhase("build");
      await fetchSuggestions([], ms, "Dataset just uploaded.");
    } catch (e:any) {
      updateRF(rfId, { status:"error", detail:e.message });
    } finally { setUploading(false); }
  };

  const fetchSuggestions = async (currentSteps:PipelineStep[], meta:string, lastResult:string) => {
    setLoadingSuggest(true); setSuggestions([]);
    const rfId = addRF({ type:"llm", label:"LLM analysing dataset for suggestions", detail:`${currentSteps.length} steps completed`, status:"running" });
    const t0 = Date.now();
    try {
      const res = await fetch("/api/pipelines/suggest", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ completedSteps:currentSteps.map(s=>({tool:s.tool,label:s.label})), datasetMeta:meta, lastResult })
      });
      const data = await res.json();
      updateRF(rfId, { status:"success", durationMs:Date.now()-t0, detail:`${data.suggestions?.length??0} suggestions returned` });
      const existing = new Set(currentSteps.map(s => s.tool));
      setSuggestions((data.suggestions||[]).filter((s:any) => !existing.has(s.tool)));
    } catch (e:any) {
      updateRF(rfId, { status:"error", detail:e.message });
    } finally { setLoadingSuggest(false); }
  };

  const addStep = (sg:any) => {
    setSteps(prev => [...prev, { id:`step-${Date.now()}-${Math.random()}`, tool:sg.tool, label:sg.label, args:sg.args||{}, reason:sg.reason, category:sg.category, status:"pending" }]);
    setSuggestions(prev => prev.filter(s => s.tool !== sg.tool));
  };
  const loadTemplate = (ts:any[]) => {
    setSteps(ts.map((s,i) => ({ ...s, id:`step-tmpl-${Date.now()}-${i}`, status:"pending" as const })));
    setShowTemplates(false);
  };
  const removeStep = (id:string) => setSteps(prev => prev.filter(s => s.id !== id));
  const updateArg = (stepId:string, key:string, value:string) =>
    setSteps(prev => prev.map(s => s.id === stepId ? {...s, args:{...s.args, [key]:value}} : s));

  const generateSummary = async (stepId:string) => {
    const step = steps.find(s => s.id === stepId); if (!step?.result) return;
    setSteps(prev => prev.map(s => s.id===stepId ? {...s, loadingSummary:true} : s));
    const rfId = addRF({ type:"llm", label:`LLM explaining: ${step.label}`, status:"running" });
    const t0 = Date.now();
    try {
      const res = await fetch("/api/llm/run", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ messages:[
          { role:"system", content:"Explain the data science result in 2-3 plain English sentences. No markdown." },
          { role:"user", content:`Step: ${step.label}\nTool: ${step.tool}\nResult: ${JSON.stringify(step.result).slice(0,1000)}\n\nExplain what this means.` }
        ]})
      });
      const data = await res.json();
      let text = "";
      for (const item of (data?.output||[])) { for (const block of (item?.content||[])) { if (block.type==="output_text") text += block.text||""; } }
      if (!text) text = data?.content?.[0]?.text || "";
      updateRF(rfId, { status:"success", durationMs:Date.now()-t0 });
      setSteps(prev => prev.map(s => s.id===stepId ? {...s, aiSummary:text, loadingSummary:false} : s));
    } catch (e:any) {
      updateRF(rfId, { status:"error", detail:e.message });
      setSteps(prev => prev.map(s => s.id===stepId ? {...s, loadingSummary:false} : s));
    }
  };

  const savePipelineToDb = async (currentSteps:PipelineStep[], status:string): Promise<string|null> => {
    try {
      const payload = currentSteps.map(s => ({ tool:s.tool, label:s.label, args:s.args, category:s.category, reason:s.reason }));
      const existingId = pipelineIdRef.current;
      if (!existingId && !pipelineCreatedRef.current) {
        pipelineCreatedRef.current = true;
        const res = await fetch("/api/pipelines", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ name:pipelineName, sessionId, metadata:{ datasetMeta } })
        });
        const data = await res.json();
        const newId = data.pipeline?.id;
        if (!newId) { pipelineCreatedRef.current = false; return null; }
        await fetch(`/api/pipelines/${newId}`, {
          method:"PATCH", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ steps:payload, status })
        });
        setPipelineId(newId); pipelineIdRef.current = newId; onSaved?.(newId); return newId;
      } else if (existingId) {
        await fetch(`/api/pipelines/${existingId}`, {
          method:"PATCH", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ name:pipelineName, steps:payload, status })
        });
        return existingId;
      }
      return pipelineIdRef.current;
    } catch { return null; }
  };

  const handleManualSave = async () => {
    if (!steps.length) return; setSaving(true); setSaveMsg(null);
    const id = await savePipelineToDb(steps, phase==="done"?"completed":"draft");
    setSaving(false); setSaveMsg(id?"Saved ✓":"Failed"); setTimeout(()=>setSaveMsg(null),2000);
  };

  const saveRunHistory = async (pid:string, results:any[]) => {
    try {
      await fetch(`/api/pipelines/${pid}/run`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ sessionId, stepResults:results })
      });
    } catch {}
  };

  // ─── CORE: run steps from index ───────────────────────────────────────
  const runStepsFrom = async (startIdx:number) => {
    if (!sessionId) return;
    setPhase("run");
    const snapshot = [...steps];
    setSteps(prev => prev.map((s,i) => i>=startIdx
      ? {...s, status:"pending", result:undefined, imageBase64:undefined, errorMsg:undefined, aiSummary:undefined}
      : s
    ));
    const runResults:any[] = [];

    for (let i=startIdx; i<snapshot.length; i++) {
      setSteps(prev => prev.map((s,idx) => idx===i ? {...s, status:"running"} : s));
      const step = snapshot[i];

      // Build args — inject session_id, skip blank optional args
      const args:Record<string,any> = { session_id: sessionId };
      for (const [k,v] of Object.entries(step.args)) {
        if (String(v).trim() !== "") args[k] = v;
      }

      const rfId = addRF({ type:"tool", label:`Backend tool: ${step.label}`, detail:`${step.tool} (${i+1}/${snapshot.length})`, status:"running" });
      const t0 = Date.now();

      try {
        const res = await fetch("/api/agent/tools", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ tool_name:step.tool, arguments:args })
        });
        const result = await res.json();
        const dur = Date.now()-t0;

        // Extract image separately so we can display it
        const img64 = result?.output?.image_base64 || result?.output?.chart_base64;

        // Keep ALL result data (don't strip nested objects!) — only remove the raw base64 image field
        const clean = result.output
          ? Object.fromEntries(Object.entries(result.output).filter(([k]) => k !== "image_base64" && k !== "chart_base64"))
          : null;

        const errMsg = result.success ? undefined : (result.error || result.details || "Tool failed");

        updateRF(rfId, {
          status: result.success ? "success" : "error",
          durationMs: dur,
          detail: result.success ? `Done in ${dur}ms` : `✗ ${errMsg?.slice(0,80)}`
        });

        setSteps(prev => prev.map((s,idx) => idx===i ? {
          ...s,
          status: result.success ? "done" : "error",
          result: clean,
          imageBase64: img64 ? (img64.startsWith("data:") ? img64 : `data:image/png;base64,${img64}`) : undefined,
          executionMs: result.execution_time_ms,
          errorMsg: errMsg
        } : s));

        if (result.success) setExpandedResult(step.id);
        runResults.push({ tool:step.tool, success:result.success, executionMs:result.execution_time_ms, errorMsg:errMsg });
        await new Promise(r => setTimeout(r, 200));

      } catch (err:any) {
        updateRF(rfId, { status:"error", durationMs:Date.now()-t0, detail:err.message });
        setSteps(prev => prev.map((s,idx) => idx===i ? {...s, status:"error", errorMsg:err.message} : s));
        runResults.push({ tool:step.tool, success:false, errorMsg:err.message });
      }
    }

    setPhase("done");
    const finalId = await savePipelineToDb(snapshot, "completed");
    if (finalId) await saveRunHistory(finalId, runResults);
  };

  const runAll  = async () => { await savePipelineToDb(steps,"running"); await runStepsFrom(0); };
  const runFrom = async (idx:number) => { await savePipelineToDb(steps,"running"); await runStepsFrom(idx); };
  const resetAll = () => {
    setSteps(prev => prev.map(s => ({...s, status:"pending", result:undefined, imageBase64:undefined, errorMsg:undefined, aiSummary:undefined})));
    setPhase("build");
  };
  const getLastResult = () => {
    const last = [...steps].reverse().find(s => s.status==="done");
    return last?.result ? JSON.stringify(last.result).slice(0,400) : "";
  };
  const downloadReport = () => dlText(
    generateReport(steps, pipelineName, datasetLabel),
    `${pipelineName.replace(/\s+/g,"_")}_report.txt`
  );

  const doneCount = steps.filter(s => s.status==="done").length;
  const errCount  = steps.filter(s => s.status==="error").length;
  const isRunning = phase==="run";

  // ─── Flow toggle button (used in both views) ──────────────────────────
  const FlowBtn = () => (
    <button
      onClick={() => setShowFlows(v => !v)}
      style={{ padding:"5px 10px", borderRadius:6, cursor:"pointer", fontFamily:C.mono, fontSize:11, flexShrink:0,
        display:"flex", alignItems:"center", gap:5, transition:"all 0.2s",
        border:`1px solid ${showFlows ? C.cyan+"55" : recentErrors>0 ? C.red+"44" : activeFlows>0 ? C.amber+"44" : C.border}`,
        background:showFlows ? `${C.cyan}15` : recentErrors>0 ? `${C.red}08` : activeFlows>0 ? `${C.amber}08` : "transparent",
        color:showFlows ? C.cyan : recentErrors>0 ? C.red : activeFlows>0 ? C.amber : C.textMute }}
    >
      📡
      {activeFlows>0 && <span style={{ width:6, height:6, borderRadius:"50%", background:C.amber, animation:"rfpulse 1.2s ease-in-out infinite" }} />}
      {flows.length>0 && <span style={{ fontSize:9, padding:"1px 5px", borderRadius:8, background:`${C.cyan}20`, color:C.cyan }}>{flows.length}</span>}
    </button>
  );

  // ─── UPLOAD PHASE ─────────────────────────────────────────────────────
  if (phase === "upload") {
    return (
      <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>
          <div style={{ padding:"8px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"flex-end", flexShrink:0, background:C.card }}>
            <FlowBtn />
          </div>
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:24, padding:24 }}>
            <div style={{ textAlign:"center" }}>
              <h2 style={{ fontFamily:C.head, fontSize:"1.4rem", fontWeight:700, color:C.text, marginBottom:8 }}>Build a Pipeline</h2>
              <p style={{ fontSize:12.5, color:C.textSub, maxWidth:420, lineHeight:1.65 }}>Upload a CSV — DSAgent suggests cleaning, analysis, and modelling steps.</p>
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f=e.dataTransfer.files[0]; if(f) handleUpload(f); }}
              onClick={() => fileRef.current?.click()}
              style={{ width:"100%", maxWidth:460, border:`2px dashed ${dragOver?C.cyan:C.borderMd}`, borderRadius:18, padding:"52px 32px", textAlign:"center", cursor:uploading?"default":"pointer", background:dragOver?`${C.cyan}06`:C.card, transition:"all 0.2s" }}
            >
              {uploading
                ? <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}><div style={{ width:34, height:34, border:`3px solid ${C.cyan}`, borderTopColor:"transparent", borderRadius:"50%", animation:"rfspin 0.8s linear infinite" }} /><span style={{ fontSize:13, color:C.textSub }}>Uploading…</span></div>
                : <><div style={{ fontSize:36, marginBottom:12 }}>📂</div><div style={{ fontSize:14, fontWeight:600, color:C.cyan, marginBottom:6 }}>Drop your CSV here</div><div style={{ fontSize:11, color:C.textMute }}>or click to browse</div></>
              }
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={e => { const f=e.target.files?.[0]; if(f) handleUpload(f); e.target.value=""; }} />
            <button onClick={() => { setDatasetMeta(""); setDatasetLabel("Template"); setPipelineName("New Pipeline"); setPhase("build"); setShowTemplates(true); }} style={{ padding:"9px 22px", borderRadius:9, border:`1px solid ${C.borderMd}`, background:"transparent", color:C.text, fontSize:12, fontWeight:600, fontFamily:C.head, cursor:"pointer" }}>📋 Browse Templates →</button>
            <AnimatePresence>{showTemplates && <TemplateModal onSelect={loadTemplate} onClose={()=>setShowTemplates(false)} />}</AnimatePresence>
          </div>
        </div>
        <AnimatePresence>
          {showFlows && (
            <motion.div initial={{ width:0 }} animate={{ width:300 }} exit={{ width:0 }} transition={{ type:"spring", stiffness:340, damping:34 }} style={{ flexShrink:0, overflow:"hidden", height:"100%", borderLeft:`1px solid ${C.border}` }}>
              <div style={{ width:300, height:"100%" }}><RequestFlowPanel onClose={()=>setShowFlows(false)} /></div>
            </motion.div>
          )}
        </AnimatePresence>
        <style>{`@keyframes rfspin{to{transform:rotate(360deg)}}@keyframes rfpulse{0%,100%{opacity:1}50%{opacity:0.2}}@keyframes pls{0%,100%{opacity:1}50%{opacity:0.2}}@keyframes dot{0%,80%,100%{transform:scale(0.6);opacity:0.3}40%{transform:scale(1);opacity:1}}`}</style>
      </div>
    );
  }

  // ─── BUILD / RUN / DONE PHASE ─────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

        {/* ── Toolbar ── */}
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", background:C.card, borderBottom:`1px solid ${C.border}`, flexShrink:0, flexWrap:"wrap" as const }}>
          {/* Pipeline name */}
          <div style={{ display:"flex", alignItems:"center", gap:5, flex:1, minWidth:100 }}>
            {renamingPipeline
              ? <input ref={renameRef} value={pipelineName} onChange={e=>setPipelineName(e.target.value)}
                  onBlur={() => { if(!pipelineName.trim()) setPipelineName("My Pipeline"); setRenamingPipeline(false); }}
                  onKeyDown={e => { if(e.key==="Enter"||e.key==="Escape"){ if(!pipelineName.trim()) setPipelineName("My Pipeline"); setRenamingPipeline(false); }}}
                  style={{ background:C.input, border:`1px solid ${C.cyan}55`, borderRadius:6, outline:"none", color:C.text, fontFamily:C.head, fontSize:13, fontWeight:600, padding:"3px 8px", flex:1, minWidth:80, maxWidth:220, boxShadow:`0 0 0 2px ${C.cyan}20` }}
                />
              : <span onDoubleClick={()=>setRenamingPipeline(true)} title="Double-click to rename" style={{ color:C.text, fontFamily:C.head, fontSize:13, fontWeight:600, cursor:"text", whiteSpace:"nowrap" as const, overflow:"hidden", textOverflow:"ellipsis", maxWidth:200 }}>{pipelineName}</span>
            }
            <button onClick={()=>setRenamingPipeline(v=>!v)} title="Rename" style={{ background:"none", border:"none", cursor:"pointer", color:renamingPipeline?C.cyan:C.textMute, fontSize:11, padding:"2px 4px", borderRadius:4, flexShrink:0 }} onMouseEnter={e=>(e.currentTarget.style.color=C.cyan)} onMouseLeave={e=>(e.currentTarget.style.color=renamingPipeline?C.cyan:C.textMute)}>✏️</button>
          </div>

          {/* Dataset pill */}
          {datasetLabel
            ? <span style={{ fontSize:10, padding:"3px 8px", borderRadius:5, background:`${C.cyan}15`, color:C.cyan, border:`1px solid ${C.cyan}30`, fontFamily:C.mono, flexShrink:0 }}>{datasetLabel}</span>
            : <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{ fontSize:10, padding:"4px 10px", borderRadius:5, background:`${C.amber}12`, color:C.amber, border:`1px solid ${C.amber}30`, fontFamily:C.mono, cursor:"pointer", flexShrink:0 }}>{uploading?"⏳…":"📂 Upload CSV"}</button>
          }
          <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={e=>{ const f=e.target.files?.[0]; if(f) handleUpload(f); e.target.value=""; }} />

          {/* Status pill */}
          <span style={{ fontSize:10, padding:"3px 8px", borderRadius:5, fontFamily:C.mono, fontWeight:600, flexShrink:0,
            background:phase==="done"?`${C.green}20`:isRunning?`${C.amber}20`:`${C.violet}15`,
            color:phase==="done"?C.green:isRunning?C.amber:C.violet,
            border:`1px solid ${phase==="done"?C.green+"40":isRunning?C.amber+"40":C.violet+"30"}` }}>
            {phase==="done" ? `✓ ${doneCount}/${steps.length}` : isRunning ? `Running… ${doneCount}/${steps.length}` : `${steps.length} steps`}
          </span>

          {!isRunning && <button onClick={()=>setShowTemplates(true)} style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${C.border}`, background:"transparent", color:C.textSub, fontSize:11, fontFamily:C.sans, cursor:"pointer", flexShrink:0 }}>📋 Templates</button>}
          {sessionId && <button onClick={()=>setShowDownloadCSV(true)} style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${C.teal}44`, background:`${C.teal}10`, color:C.teal, fontSize:11, fontFamily:C.sans, cursor:"pointer", flexShrink:0, fontWeight:600 }}>⬇ CSV</button>}
          {phase==="done" && <button onClick={downloadReport} style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${C.violet}33`, background:`${C.violet}10`, color:C.violet, fontSize:11, cursor:"pointer", flexShrink:0 }}>📄 Report</button>}
          {phase==="done" && <button onClick={()=>setShowExport(true)} style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${C.green}33`, background:`${C.green}10`, color:C.green, fontSize:11, cursor:"pointer", flexShrink:0 }}>↓ Export</button>}
          <button onClick={handleManualSave} disabled={saving||!steps.length} style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${C.borderMd}`, background:saveMsg==="Saved ✓"?`${C.green}20`:"transparent", color:saveMsg==="Saved ✓"?C.green:C.textSub, fontSize:11, cursor:!steps.length?"not-allowed":"pointer", opacity:!steps.length?0.4:1, flexShrink:0, fontFamily:C.sans }}>
            {saving?"…":saveMsg||"💾 Save"}
          </button>
          {!isRunning && <button onClick={runAll} disabled={!steps.length||!sessionId} style={{ padding:"6px 16px", borderRadius:7, border:"none", background:(!steps.length||!sessionId)?C.border:`linear-gradient(135deg,${C.cyan},#0099CC)`, color:(!steps.length||!sessionId)?C.textMute:"#030712", fontSize:11, fontWeight:700, fontFamily:C.head, cursor:(!steps.length||!sessionId)?"not-allowed":"pointer", flexShrink:0 }}>
            {!sessionId?"⚠ Upload CSV first":"▶ Run All"}
          </button>}
          {(phase==="done"||isRunning) && <button onClick={resetAll} disabled={isRunning} style={{ padding:"6px 12px", borderRadius:7, border:`1px solid ${C.borderMd}`, background:"transparent", color:C.text, fontSize:11, fontWeight:600, fontFamily:C.head, cursor:isRunning?"not-allowed":"pointer", opacity:isRunning?0.5:1, flexShrink:0 }}>↺ Reset</button>}
          <FlowBtn />
        </div>

        {/* ── Body (steps + right panel) ── */}
        <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

          {/* Steps column */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
            {/* Warning banner when editing without session */}
            {isEditing && !sessionId && (
              <div style={{ margin:"8px 14px 0", padding:"10px 14px", background:`${C.amber}0D`, borderRadius:9, border:`1px solid ${C.amber}33`, flexShrink:0, display:"flex", alignItems:"center", gap:10 }}>
                <span>⚠️</span>
                <div style={{ flex:1 }}><div style={{ fontSize:11, fontWeight:600, color:C.amber }}>Dataset not loaded</div><div style={{ fontSize:10, color:C.textSub, fontFamily:C.mono }}>Upload the CSV again to run steps.</div></div>
                <button onClick={()=>fileRef.current?.click()} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${C.amber}44`, background:`${C.amber}15`, color:C.amber, fontSize:10, fontFamily:C.mono, cursor:"pointer" }}>Upload CSV →</button>
              </div>
            )}

            {/* Progress bar while running */}
            {isRunning && (
              <div style={{ margin:"8px 14px 0", padding:"8px 14px", background:C.card, borderRadius:8, border:`1px solid ${C.border}`, flexShrink:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:10, color:C.textSub, fontFamily:C.mono }}>
                  <span>Running pipeline…</span><span>{doneCount+errCount}/{steps.length}</span>
                </div>
                <div style={{ height:3, background:C.border, borderRadius:2, overflow:"hidden" }}>
                  <motion.div style={{ height:"100%", background:`linear-gradient(90deg,${C.cyan},${C.violet})`, borderRadius:2 }} animate={{ width:`${((doneCount+errCount)/steps.length)*100}%` }} transition={{ duration:0.4 }} />
                </div>
              </div>
            )}

            {/* Done banner */}
            {phase==="done" && (
              <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} style={{ margin:"8px 14px 0", padding:"10px 14px", background:`${C.green}0A`, borderRadius:9, border:`1px solid ${C.green}28`, flexShrink:0, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
                <span>✅</span>
                <span style={{ fontSize:12, fontWeight:600, color:C.green, fontFamily:C.head }}>Pipeline complete!</span>
                <span style={{ fontSize:10, color:C.textSub, fontFamily:C.mono }}>{doneCount} ok · {errCount} failed</span>
                <span style={{ flex:1 }} />
                {sessionId && <button onClick={()=>setShowDownloadCSV(true)} style={{ padding:"4px 12px", borderRadius:5, border:`1px solid ${C.teal}55`, background:`${C.teal}15`, color:C.teal, fontSize:10, fontFamily:C.mono, cursor:"pointer", fontWeight:600 }}>⬇ Modified CSV</button>}
                <button onClick={downloadReport} style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${C.violet}44`, background:`${C.violet}12`, color:C.violet, fontSize:10, fontFamily:C.mono, cursor:"pointer" }}>📄 Report</button>
                <button onClick={()=>fetchSuggestions(steps,datasetMeta,getLastResult())} style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${C.cyan}33`, background:`${C.cyan}10`, color:C.cyan, fontSize:10, fontFamily:C.mono, cursor:"pointer" }}>Get next steps →</button>
              </motion.div>
            )}

            {/* Steps scroll area */}
            <div style={{ flex:1, minHeight:0, overflowY:"auto" as const, padding:"10px 14px", scrollbarWidth:"thin" as const, scrollbarColor:`${C.border} transparent` }}>
              {steps.length===0 ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:C.textMute, fontSize:12, gap:10, minHeight:200 }}>
                  <div style={{ fontSize:32 }}>⚡</div>
                  <div>Add steps from the AI suggestions panel →</div>
                  <button onClick={()=>setShowTemplates(true)} style={{ padding:"7px 16px", borderRadius:8, border:`1px solid ${C.borderMd}`, background:"transparent", color:C.textSub, fontSize:11, cursor:"pointer", fontFamily:C.sans }}>or load a template</button>
                </div>
              ) : (
                <Reorder.Group axis="y" values={steps} onReorder={newOrder => { if(!isRunning) setSteps(newOrder); }} style={{ display:"flex", flexDirection:"column", gap:8, listStyle:"none", padding:0, margin:0 }} as="div">
                  <AnimatePresence>
                    {steps.map((step, idx) => (
                      <StepCard key={step.id} step={step} idx={idx} phase={phase} isRunning={isRunning}
                        expanded={expandedResult===step.id}
                        onToggleExpand={() => setExpandedResult(expandedResult===step.id ? null : step.id)}
                        onRemove={() => removeStep(step.id)}
                        onUpdateArg={(k,v) => updateArg(step.id,k,v)}
                        onRunFrom={() => runFrom(idx)}
                        onGenerateSummary={() => generateSummary(step.id)}
                        datasetCols={datasetCols}
                      />
                    ))}
                  </AnimatePresence>
                  <div ref={stepsEndRef} style={{ height:1 }} />
                </Reorder.Group>
              )}
            </div>
          </div>

          {/* Right panel: AI suggestions + Advanced tools */}
          <div style={{ width:282, flexShrink:0, display:"flex", flexDirection:"column", borderLeft:`1px solid ${C.border}`, overflow:"hidden" }}>
            {/* Tab bar */}
            <div style={{ display:"flex", background:C.card, borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
              {(["ai","advanced"] as const).map(tab => (
                <button key={tab} onClick={()=>setRightTab(tab)} style={{ flex:1, padding:"10px 6px", background:rightTab===tab?`${C.cyan}12`:"transparent", border:"none", borderBottom:rightTab===tab?`2px solid ${C.cyan}`:"2px solid transparent", color:rightTab===tab?C.cyan:C.textMute, fontSize:10, fontFamily:C.mono, fontWeight:600, cursor:"pointer", letterSpacing:"0.04em" }}>
                  {tab==="ai"?"🤖 AI Suggestions":"⚙️ Advanced"}
                </button>
              ))}
            </div>

            {/* AI tab */}
            {rightTab==="ai" && (
              <>
                <div style={{ padding:"8px 10px", background:C.card, borderBottom:`1px solid ${C.border}`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:10, color:C.textMute }}>LLM-powered suggestions</span>
                  <button onClick={()=>fetchSuggestions(steps,datasetMeta,getLastResult())} disabled={loadingSuggest} style={{ background:"none", border:`1px solid ${C.borderMd}`, borderRadius:5, padding:"3px 8px", color:C.cyan, fontSize:10, fontFamily:C.mono, cursor:"pointer", opacity:loadingSuggest?0.5:1 }}>{loadingSuggest?"…":"↻ Refresh"}</button>
                </div>
                <div style={{ flex:1, minHeight:0, overflowY:"auto" as const, padding:"8px", display:"flex", flexDirection:"column", gap:6, scrollbarWidth:"thin" as const }}>
                  {loadingSuggest && [1,2,3].map(i => <div key={i} style={{ height:76, borderRadius:10, background:C.card, border:`1px solid ${C.border}`, opacity:0.3+i*0.1 }} />)}
                  {!loadingSuggest && !suggestions.length && <div style={{ padding:14, textAlign:"center", color:C.textMute, fontSize:11, background:C.card, borderRadius:10, border:`1px solid ${C.border}` }}>{phase==="done"?"✓ Done. Click ↻ for more.":"Click ↻ to get AI suggestions."}</div>}
                  <AnimatePresence>{suggestions.map((s,i) => <SuggestionCard key={s.tool+i} suggestion={s} onAdd={()=>addStep(s)} disabled={isRunning} />)}</AnimatePresence>
                </div>
              </>
            )}

            {/* Advanced tools tab */}
            {rightTab==="advanced" && (
              <div style={{ flex:1, minHeight:0, overflowY:"auto" as const, padding:"8px", display:"flex", flexDirection:"column", gap:5, scrollbarWidth:"thin" as const }}>
                {(["preprocessing","cleaning","modeling"] as const).map(cat => {
                  const tools = Object.entries(ADVANCED_TOOLS).filter(([,t]) => t.category===cat);
                  if (!tools.length) return null;
                  const catColor = CAT_COLOR[cat]||C.textSub;
                  return (
                    <div key={cat}>
                      <div style={{ fontSize:9, fontWeight:700, color:catColor, fontFamily:C.mono, letterSpacing:"0.09em", textTransform:"uppercase" as const, padding:"6px 2px 4px", display:"flex", alignItems:"center", gap:5 }}>
                        <span>{CAT_ICON[cat]}</span> {cat}
                      </div>
                      {tools.map(([toolKey, tool]) => {
                        const alreadyAdded = steps.some(s => s.tool===toolKey);
                        return (
                          <motion.div key={toolKey} initial={{ opacity:0 }} animate={{ opacity:1 }}
                            onClick={() => !isRunning && !alreadyAdded && addStep({ tool:toolKey, label:tool.label, args:{...tool.args}, reason:tool.reason, category:tool.category })}
                            style={{ padding:"9px 11px", borderRadius:8, background:alreadyAdded?`${catColor}0A`:C.card, border:`1px solid ${alreadyAdded?catColor+"30":C.border}`, cursor:isRunning||alreadyAdded?"default":"pointer", opacity:alreadyAdded?0.6:1, marginBottom:3 }}
                            whileHover={!isRunning&&!alreadyAdded?{ borderColor:catColor+"66", backgroundColor:`${catColor}0D` }:{}}
                          >
                            <div style={{ display:"flex", alignItems:"flex-start", gap:7 }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:11, fontWeight:600, color:alreadyAdded?catColor:C.text, fontFamily:C.head, marginBottom:2, display:"flex", alignItems:"center", gap:5 }}>
                                  {tool.label}
                                  {alreadyAdded && <span style={{ fontSize:8, color:catColor, fontFamily:C.mono }}>✓ added</span>}
                                </div>
                                <div style={{ fontSize:9.5, color:C.textMute, lineHeight:1.5 }}>{tool.reason.split(".")[0]}.</div>
                              </div>
                              {!alreadyAdded && !isRunning && <span style={{ fontSize:14, color:catColor, opacity:0.5 }}>+</span>}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {datasetCols.all.length > 0 && <ColsPanel datasetCols={datasetCols} />}
          </div>
        </div>
      </div>

      {/* Request Flow slide-in panel */}
      <AnimatePresence>
        {showFlows && (
          <motion.div key="flow-panel" initial={{ width:0 }} animate={{ width:300 }} exit={{ width:0 }} transition={{ type:"spring", stiffness:340, damping:34 }} style={{ flexShrink:0, overflow:"hidden", height:"100%", borderLeft:`1px solid ${C.border}` }}>
            <div style={{ width:300, height:"100%" }}>
              <RequestFlowPanel onClose={()=>setShowFlows(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showExport && <ExportModal steps={steps} pipelineName={pipelineName} datasetLabel={datasetLabel} onClose={()=>setShowExport(false)} />}
        {showTemplates && <TemplateModal onSelect={loadTemplate} onClose={()=>setShowTemplates(false)} />}
        {showDownloadCSV && sessionId && <DownloadCSVModal sessionId={sessionId} defaultName={datasetLabel||pipelineName} onClose={()=>setShowDownloadCSV(false)} />}
      </AnimatePresence>

      <style>{`
        @keyframes rfspin  { to { transform:rotate(360deg); } }
        @keyframes pls     { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes rfpulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes dot     { 0%,80%,100%{transform:scale(0.6);opacity:0.3} 40%{transform:scale(1);opacity:1} }
      `}</style>
    </div>
  );
}