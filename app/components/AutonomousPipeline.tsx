// app/components/AutonomousPipeline.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createRFStore, addRFTo, updateRFIn } from "./PipelineBuilder";

/* ── Fonts: JetBrains Mono for terminal, Sora for headings ── */
const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
const SANS = "'Inter', system-ui, sans-serif";
const HEAD = "'Sora', 'Inter', sans-serif";

/* ── Terminal color palette ── */
const T = {
  bg:      "#141414",
  termBg:  "#1C1C1C",
  chrome:  "#252525",
  border:  "rgba(255,255,255,0.08)",
  prompt:  "#FFFFFF",
  arrow:   "#888888",
  dim:     "#555555",
  green:   "#3FB950",
  cyan:    "#00D4FF",
  amber:   "#F59E0B",
  red:     "#F85149",
  violet:  "#8B5CF6",
  teal:    "#14B8A6",
};

interface TermLine {
  kind: "cmd" | "out" | "step" | "metric" | "divider" | "error";
  text: string;
  time?: number;
  success?: boolean;
  index?: number;
  total?: number;
}

interface PhaseResult {
  step_count: number;
  success_count: number;
  steps: { tool: string; label: string; success: boolean; time_ms: number; image_base64?: string; result_preview?: Record<string, any> }[];
  llm_explanation: string;
}

interface AutonomousResult {
  success: boolean;
  report_id: string;
  total_time_ms: number;
  conclusion: string;
  phases: Record<string, PhaseResult>;
}

interface Props {
  sessionId: string;
  datasetName: string;
  onComplete?: (reportId: string) => void;
  onBack?: () => void;
}

type RFEntry = { id: string; type: "llm"|"tool"|"upload"; label: string; detail?: string; status: "running"|"success"|"error"; timestamp: Date; durationMs?: number; };

const PHASE_CMDS: Record<string, string> = {
  eda:                 "dsagent run --phase eda",
  cleaning:            "dsagent run --phase cleaning",
  visualization:       "dsagent run --phase visualization",
  feature_engineering: "dsagent run --phase feature-engineering",
  modeling:            "dsagent run --phase modeling",
  evaluation:          "dsagent run --phase evaluation",
  report:              "dsagent generate --report pdf",
};

export default function AutonomousPipeline({ sessionId, datasetName, onComplete, onBack }: Props) {
  const [status, setStatus]     = useState<"idle" | "running" | "done" | "error">("idle");
  const [lines, setLines]       = useState<TermLine[]>([]);
  const [result, setResult]     = useState<AutonomousResult | null>(null);
  const [error, setError]       = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent]       = useState(false);
  const [showRF, setShowRF]             = useState(false);
  const [rfEntries, setRfEntries]       = useState<RFEntry[]>([]);

  const timerRef   = useRef<NodeJS.Timeout | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const rfStore    = useRef(createRFStore()).current;

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  const push = (line: TermLine) => setLines(prev => [...prev, line]);

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTotal = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  const startPipeline = async () => {
    setStatus("running");
    setLines([]);
    setError("");
    setRfEntries([]);
    rfStore.entries.length = 0;

    const t0 = Date.now();
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - t0), 100);

    // RF listener so UI updates
    const rfTick = () => setRfEntries([...rfStore.entries]);
    rfStore.listeners.push(rfTick);

    // Initial upload entry
    const uploadId = addRFTo(rfStore, { type: "upload", label: `Upload: ${datasetName}`, detail: `session ${sessionId.slice(0,8)}`, status: "running" });
    updateRFIn(rfStore, uploadId, { status: "success", durationMs: 0 });

    // Initial command
    push({ kind: "cmd", text: `dsagent upload ${datasetName}` });
    push({ kind: "out", text: `session: ${sessionId.slice(0, 12)}...` });
    push({ kind: "cmd", text: "dsagent run --pipeline auto" });

    // Simulate phase progress lines while waiting
    const PHASES = ["eda", "cleaning", "visualization", "feature_engineering", "modeling", "evaluation"];
    let phaseTimers: NodeJS.Timeout[] = [];
    PHASES.forEach((p, i) => {
      phaseTimers.push(setTimeout(() => {
        push({ kind: "divider", text: "" });
        push({ kind: "cmd", text: PHASE_CMDS[p] });
        addRFTo(rfStore, { type: "llm", label: `Planning phase: ${p}`, status: "running" });
      }, i * 7000 + 500));
    });

    try {
      const res = await fetch("/api/pipelines/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, dataset_name: datasetName }),
      });

      phaseTimers.forEach(clearTimeout);
      if (timerRef.current) clearInterval(timerRef.current);

      if (!res.ok) throw new Error(await res.text());

      const data: AutonomousResult = await res.json();
      setElapsedMs(data.total_time_ms || Date.now() - t0);

      if (!data.success) throw new Error("Pipeline returned unsuccessful result");

      setResult(data);
      setStatus("done");

      // Render real results into terminal
      setLines([]);
      push({ kind: "cmd", text: `dsagent upload ${datasetName}` });

      // EDA summary
      const edaPhase = data.phases["eda"];
      if (edaPhase) {
        const overviewStep = edaPhase.steps.find((s: any) => s.tool === "dataset_overview");
        const r = (overviewStep as any)?.result;
        if (r?.shape) push({ kind: "out", text: `${r.shape.rows?.toLocaleString() ?? "?"} rows · ${r.shape.columns ?? "?"} columns detected` });
        push({ kind: "out", text: `session: ${sessionId.slice(0, 12)}...` });
      }

      push({ kind: "divider", text: "" });
      push({ kind: "cmd", text: "dsagent run --pipeline auto" });
      push({ kind: "divider", text: "" });

      // Render each phase
      const phaseOrder = ["eda", "cleaning", "visualization", "feature_engineering", "modeling", "evaluation"];
      let globalStep = 0;
      const totalSteps = phaseOrder.reduce((a, p) => a + (data.phases[p]?.step_count || 0), 0);

      for (const phase of phaseOrder) {
        const ph = data.phases[phase];
        if (!ph) continue;
        push({ kind: "cmd", text: PHASE_CMDS[phase] });

        // Also add a LLM planning entry
        addRFTo(rfStore, { type: "llm", label: `LLM: ${ph.llm_explanation?.slice(0, 60) || `Plan ${phase}`}`, detail: `${ph.step_count} steps`, status: "success", durationMs: 0 });

        ph.steps.forEach((step) => {
          globalStep++;
          // Log to RF store
          const rfId = addRFTo(rfStore, { type: "tool", label: step.tool, detail: `phase: ${phase}`, status: "running" });
          updateRFIn(rfStore, rfId, { status: step.success ? "success" : "error", durationMs: step.time_ms });

          push({
            kind: "step",
            text: step.tool,
            time: step.time_ms,
            success: step.success,
            index: globalStep,
            total: totalSteps,
          });
        });

        // Phase summary metric
        const metricLine = _buildMetricLine(phase, ph, data);
        if (metricLine) push({ kind: "metric", text: metricLine });
        push({ kind: "divider", text: "" });
      }

      // Report
      push({ kind: "cmd", text: PHASE_CMDS["report"] });
      push({ kind: "step", text: "generate_pdf", time: 0, success: true, index: totalSteps + 1, total: totalSteps + 1 });
      push({ kind: "metric", text: `report: ${data.report_id}.pdf saved` });

      // Final summary
      const totalSuccess = phaseOrder.reduce((a, p) => a + (data.phases[p]?.success_count || 0), 0);
      push({ kind: "divider", text: "" });
      push({ kind: "cmd", text: "dsagent status --pipeline" });
      push({ kind: "out", text: `${totalSuccess}/${totalSteps} steps succeeded  |  ${phaseOrder.length} phases  |  ${formatTotal(data.total_time_ms)}` });

      onComplete?.(data.report_id);


    } catch (e: any) {
      if (timerRef.current) clearInterval(timerRef.current);
      setError(e.message || "Unknown error");
      setStatus("error");
      push({ kind: "error", text: e.message });
    }
  };

  const handleDownload = () => {
    if (!result?.report_id) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    window.open(`${backendUrl}/reports/${result.report_id}/download`, "_blank");
  };

  const handleEmail = async () => {
    if (!result?.report_id || emailSending) return;
    setEmailSending(true);
    try {
      const listRes = await fetch("/api/reports");
      const listData = await listRes.json();
      const dbReport = (listData.reports || []).find((r: any) =>
        (r.metadata as any)?.report_id === result.report_id
      );
      if (!dbReport) { push({ kind: "error", text: "report not found in database for email" }); return; }
      const res = await fetch(`/api/reports/${dbReport.id}/email`, { method: "POST" });
      const d = await res.json();
      if (d.success) {
        setEmailSent(true);
        push({ kind: "metric", text: `email sent to ${d.sentTo}` });
      } else {
        push({ kind: "error", text: `email failed: ${d.error}` });
      }
    } catch (e: any) {
      push({ kind: "error", text: `email error: ${e.message}` });
    } finally { setEmailSending(false); }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12, fontFamily: MONO }}>

      {/* Back + header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 12px", color: T.arrow, fontSize: 11, cursor: "pointer", fontFamily: SANS }}>
            Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: HEAD, fontSize: "0.95rem", fontWeight: 700, color: "#F0F0F0", letterSpacing: "-0.01em" }}>
            Autonomous Pipeline
          </span>
          <span style={{ marginLeft: 10, fontSize: 9, padding: "2px 7px", borderRadius: 3, background: `${T.violet}20`, color: T.violet, border: `1px solid ${T.violet}30`, fontFamily: MONO, fontWeight: 700, letterSpacing: "0.04em" }}>
            AI-DRIVEN
          </span>
        </div>
        {status === "running" && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: T.amber }}>
            {formatTotal(elapsedMs)}
          </span>
        )}
        {status === "done" && result && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: T.green }}>
            {formatTotal(result.total_time_ms)}
          </span>
        )}
        {/* RF Flow toggle */}
        <button
          onClick={() => setShowRF(v => !v)}
          style={{
            padding: "5px 11px", borderRadius: 7, fontSize: 10, fontFamily: MONO, cursor: "pointer",
            border: `1px solid ${showRF ? T.cyan + "66" : rfEntries.filter(e => e.status === "error").length > 0 ? T.red + "55" : T.border}`,
            background: showRF ? `${T.cyan}12` : "transparent",
            color: showRF ? T.cyan : rfEntries.filter(e => e.status === "error").length > 0 ? T.red : T.arrow,
            display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 9 }}>&#9701;</span>
          Flow
          {rfEntries.length > 0 && (
            <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 8, background: `${T.cyan}25`, color: T.cyan }}>{rfEntries.length}</span>
          )}
          {rfEntries.filter(e => e.status === "running").length > 0 && (
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.amber, display: "inline-block", animation: "termBlink 1s ease-in-out infinite" }} />
          )}
        </button>
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, display: "flex", gap: 12, minHeight: 0, overflow: "hidden" }}>

        {/* Terminal window */}
        <div style={{
          flex: 1, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column",
          background: T.termBg, border: `1px solid ${T.border}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>

          {/* Chrome bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 14px",
            background: T.chrome, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FFBD2E" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28CA42" }} />
            <span style={{ flex: 1, textAlign: "center", fontSize: 11, color: T.arrow, fontFamily: MONO, letterSpacing: "0.02em" }}>
              dsagent — terminal
            </span>
            {status === "running" && (
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.amber, animation: "termBlink 1s ease-in-out infinite" }} />
            )}
          </div>

          {/* Liquid glass start button — shown only when idle */}
          {status === "idle" && (
            <div style={{ padding: "14px 16px 0", flexShrink: 0 }}>
              <button
                onClick={startPipeline}
                style={{
                  width: "20%", padding: "13px 0",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(122, 97, 97, 0.1)",
                  backdropFilter: "blur(20px) saturate(180%)",
                  WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
                  color: "#F0F0F0",
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: "0.08em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  transition: "all 0.2s",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 32px rgba(54, 53, 53, 0.45), inset 0 1px 0 rgba(255,255,255,0.18)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.3)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 24px rgba(221, 221, 221, 0.25), inset 0 1px 0 rgba(255,255,255,0.12)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.18)";
                }}
              >
                <span style={{ fontSize: 14, opacity: 0.85 }}>&#9654;</span>
                RUN PIPELINE
              </button>
            </div>
          )}

          {/* Terminal body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 0 }}>

            {/* Idle state */}
            {status === "idle" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: 6 }}>
                <TermRow kind="out" text={`ready · session ${sessionId.slice(0, 12)}...`} />
                <TermRow kind="out" text={`dataset: ${datasetName}`} />
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: T.dim, fontSize: 11, fontFamily: MONO }}>$</span>
                  <span style={{ color: T.prompt, fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>
                    dsagent run --pipeline auto
                    <span style={{ animation: "termCursor 1s step-end infinite", color: T.cyan }}>_</span>
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: T.dim, fontFamily: MONO }}>
                  Press <span style={{ color: T.cyan }}>RUN PIPELINE</span> above to start
                </div>
              </div>
            )}

            {/* Lines */}
            {lines.map((line, i) => <TermRow key={i} {...line} />)}

            {/* Running cursor */}
            {status === "running" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span style={{ color: T.dim, fontSize: 11 }}>$</span>
                <span style={{ color: T.cyan, fontSize: 11, fontFamily: MONO, animation: "termCursor 1s step-end infinite" }}>_</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Right panel — only when done */}
        {status === "done" && result && (
          <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>

            {/* Report actions */}
            <div style={{
              background: T.termBg, borderRadius: 10, border: `1px solid ${T.green}25`,
              padding: "14px 14px", display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: T.green, letterSpacing: "0.08em", marginBottom: 2 }}>
                REPORT READY
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: T.dim, wordBreak: "break-all" }}>
                {result.report_id}.pdf
              </div>

              <button onClick={handleDownload} style={{
                width: "100%", padding: "8px 0", borderRadius: 6, border: "none",
                background: T.cyan, color: "#030712", fontSize: 10,
                fontWeight: 700, fontFamily: MONO, cursor: "pointer", letterSpacing: "0.04em",
              }}>
                DOWNLOAD PDF
              </button>

              <button onClick={handleEmail} disabled={emailSending || emailSent} style={{
                width: "100%", padding: "8px 0", borderRadius: 6,
                border: `1px solid ${emailSent ? T.green + "40" : T.border}`,
                background: emailSent ? `${T.green}12` : "transparent",
                color: emailSent ? T.green : T.arrow,
                fontSize: 10, fontWeight: 600, fontFamily: MONO, cursor: emailSent ? "default" : "pointer",
                letterSpacing: "0.04em", opacity: emailSending ? 0.5 : 1,
              }}>
                {emailSent ? "EMAILED" : emailSending ? "SENDING..." : "EMAIL REPORT"}
              </button>
            </div>

            {/* Stats */}
            <div style={{ background: T.termBg, borderRadius: 10, border: `1px solid ${T.border}`, padding: "12px 14px" }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: T.dim, letterSpacing: "0.08em", marginBottom: 10 }}>
                SUMMARY
              </div>
              {[
                { label: "PHASES", value: Object.keys(result.phases).length, color: T.cyan },
                { label: "TIME", value: formatTotal(result.total_time_ms), color: T.amber },
                { label: "STEPS", value: Object.values(result.phases).reduce((a, p) => a + p.step_count, 0), color: T.violet },
                { label: "SUCCESS", value: Object.values(result.phases).reduce((a, p) => a + p.success_count, 0), color: T.green },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: T.dim, letterSpacing: "0.06em" }}>{s.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: s.color, fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* Show any error that occurred after result loaded */}
            {!!error && (
              <div style={{ background: `${T.red}10`, borderRadius: 10, border: `1px solid ${T.red}30`, padding: "12px 14px" }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: T.red, letterSpacing: "0.08em", marginBottom: 6 }}>ERROR</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: T.dim }}>{error.slice(0, 120)}</div>
                <button onClick={startPipeline} style={{ marginTop: 8, width: "100%", padding: "6px 0", borderRadius: 5, border: `1px solid ${T.red}40`, background: "transparent", color: T.red, fontSize: 9, fontFamily: MONO, cursor: "pointer" }}>RETRY</button>
              </div>
            )}
          </div>
        )}

        {/* Error state when no result yet */}
        {status === "error" && !result && (
          <div style={{ width: 220, flexShrink: 0 }}>
            <div style={{ background: `${T.red}10`, borderRadius: 10, border: `1px solid ${T.red}30`, padding: "14px" }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: T.red, letterSpacing: "0.08em", marginBottom: 6 }}>PIPELINE FAILED</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: T.dim, marginBottom: 10, wordBreak: "break-word" }}>{error.slice(0, 140)}</div>
              <button onClick={startPipeline} style={{
                width: "100%", padding: "8px 0", borderRadius: 6,
                border: `1px solid ${T.red}40`, background: "transparent",
                color: T.red, fontSize: 10, fontFamily: MONO, cursor: "pointer",
              }}>RETRY</button>
            </div>
          </div>
        )}

        {/* ── Request Flow Sidebar ──────────────────────────────────── */}
        <AnimatePresence>
          {showRF && (
            <motion.div
              key="rf-sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 270, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              style={{ flexShrink: 0, overflow: "hidden", height: "100%" }}
            >
              <div style={{
                width: 270, height: "100%", display: "flex", flexDirection: "column",
                background: "#0A0A0A", border: `1px solid ${T.border}`,
                borderRadius: 12, overflow: "hidden",
              }}>
                {/* Header */}
                <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#E0E0E0", letterSpacing: "0.04em" }}>Request Flow</span>
                      {rfEntries.filter(e => e.status === "running").length > 0 && (
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.amber, display: "inline-block", animation: "termBlink 1s ease-in-out infinite" }} />
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button
                        onClick={() => { rfStore.entries.length = 0; setRfEntries([]); }}
                        style={{ fontSize: 8, padding: "2px 7px", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.dim, cursor: "pointer", fontFamily: MONO }}
                      >Clear</button>
                      <button
                        onClick={() => setShowRF(false)}
                        style={{ fontSize: 8, padding: "2px 7px", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.dim, cursor: "pointer", fontFamily: MONO }}
                      >&#10005;</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[
                      { label: "LLM", count: rfEntries.filter(e => e.type === "llm").length, color: T.violet },
                      { label: "Tool", count: rfEntries.filter(e => e.type === "tool").length, color: T.cyan },
                      { label: "Err", count: rfEntries.filter(e => e.status === "error").length, color: T.red },
                    ].map(b => (
                      <span key={b.label} style={{ fontSize: 8, padding: "2px 7px", borderRadius: 8, background: `${b.color}18`, color: b.color, border: `1px solid ${b.color}30`, fontFamily: MONO }}>
                        {b.label} ({b.count})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Entries */}
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px", scrollbarWidth: "thin" as const }}>
                  {rfEntries.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 12px", color: T.dim, fontSize: 10, fontFamily: MONO }}>
                      No activity yet.<br />Run pipeline to see flow.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {[...rfEntries].reverse().map((entry, idx, arr) => {
                        const color = entry.status === "error" ? T.red : entry.status === "running" ? T.amber : entry.type === "llm" ? T.violet : entry.type === "upload" ? T.green : T.cyan;
                        const isLast = idx === arr.length - 1;
                        const prevColor = idx > 0 ? (arr[idx - 1].status === "error" ? T.red : arr[idx - 1].type === "llm" ? T.violet : T.cyan) : color;
                        return (
                          <div key={entry.id} style={{ display: "flex", gap: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 30, flexShrink: 0 }}>
                              {idx > 0 && <div style={{ width: 1.5, height: 12, background: `linear-gradient(to bottom, ${prevColor}44, ${color}44)` }} />}
                              <div style={{
                                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                                background: `${color}18`, border: `1.5px solid ${entry.status === "running" ? color : color + "77"}`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: entry.status === "running" ? `0 0 8px ${color}44` : "none",
                                transition: "all 0.3s",
                              }}>
                                {entry.status === "running"
                                  ? <div style={{ width: 8, height: 8, border: `1.5px solid ${color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "rfspin 0.8s linear infinite" }} />
                                  : <span style={{ fontSize: 8, fontFamily: MONO, color, fontWeight: 700 }}>
                                      {entry.type === "llm" ? "AI" : entry.type === "upload" ? "UP" : "T"}
                                    </span>
                                }
                              </div>
                              {!isLast && <div style={{ width: 1.5, flex: 1, minHeight: 12, background: `${color}33` }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0, paddingLeft: 8, paddingBottom: isLast ? 0 : 6, paddingTop: idx === 0 ? 0 : 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2, flexWrap: "wrap" as const }}>
                                <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 3, background: `${color}18`, color, fontFamily: MONO, fontWeight: 700, border: `1px solid ${color}25`, letterSpacing: "0.06em" }}>
                                  {entry.type.toUpperCase()}
                                </span>
                                {entry.status === "error" && <span style={{ fontSize: 7, color: T.red, fontFamily: MONO }}>FAIL</span>}
                                {entry.durationMs != null && entry.status !== "running" && (
                                  <span style={{ fontSize: 7, color: T.dim, fontFamily: MONO, marginLeft: "auto" }}>{entry.durationMs}ms</span>
                                )}
                              </div>
                              <div style={{ fontSize: 9.5, fontWeight: 600, color: entry.status === "error" ? T.red : "#D0D0D0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, marginBottom: 1 }}>
                                {entry.label}
                              </div>
                              {entry.detail && (
                                <div style={{ fontSize: 8, color: T.dim, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                  {entry.detail}
                                </div>
                              )}
                              <div style={{ fontSize: 7.5, color: T.dim, fontFamily: MONO, marginTop: 1 }}>
                                {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer stats */}
                <div style={{ padding: "8px 10px", borderTop: `1px solid ${T.border}`, flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                  {[
                    { label: "LLM", v: rfEntries.filter(e => e.type === "llm").length, color: T.violet },
                    { label: "TOOL", v: rfEntries.filter(e => e.type === "tool").length, color: T.cyan },
                    { label: "ERR", v: rfEntries.filter(e => e.status === "error").length, color: rfEntries.filter(e => e.status === "error").length > 0 ? T.red : T.dim },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: "center", padding: "5px 2px", borderRadius: 6, background: "#111", border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: MONO, lineHeight: 1 }}>{s.v}</div>
                      <div style={{ fontSize: 7, color: T.dim, fontFamily: MONO, letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      <style>{`
        @keyframes termBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes termCursor { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes rfspin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* ── Single terminal line component ── */
function TermRow({ kind, text, time, success, index, total }: TermLine) {
  if (kind === "divider") {
    return <div style={{ height: 6 }} />;
  }

  if (kind === "cmd") {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2, marginTop: 4 }}>
        <span style={{ color: "#555555", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>$</span>
        <span style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{text}</span>
      </div>
    );
  }

  if (kind === "step") {
    const indexStr = index !== undefined && total !== undefined ? `[${index}/${total}]` : "";
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 1 }}>
        <span style={{ color: "#555555", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>→</span>
        {indexStr && (
          <span style={{ color: "#555555", fontSize: 10, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{indexStr}</span>
        )}
        <span style={{ color: "#CCCCCC", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", flex: 1 }}>{text}</span>
        {success !== undefined && (
          <span style={{ color: success ? "#3FB950" : "#F85149", fontSize: 10, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
            {success ? "✓" : "✗"}
          </span>
        )}
        {time !== undefined && time > 0 && (
          <span style={{ color: "#555555", fontSize: 10, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0, minWidth: 40, textAlign: "right" }}>
            {time < 1000 ? `${time}ms` : `${(time / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>
    );
  }

  if (kind === "metric") {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 1 }}>
        <span style={{ color: "#555555", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>→</span>
        <span style={{ color: "#00D4FF", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>{text}</span>
      </div>
    );
  }

  if (kind === "error") {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 1 }}>
        <span style={{ color: "#F85149", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>✗</span>
        <span style={{ color: "#F85149", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>{text}</span>
      </div>
    );
  }

  // kind === "out"
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 1 }}>
      <span style={{ color: "#555555", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>→</span>
      <span style={{ color: "#888888", fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>{text}</span>
    </div>
  );
}

/* ── Build a concise metric summary line per phase ── */
function _buildMetricLine(phase: string, ph: PhaseResult, data: AutonomousResult): string {
  const steps = ph.steps;
  const ok = ph.success_count;
  const total = ph.step_count;

  switch (phase) {
    case "eda": {
      const miss = steps.find(s => s.tool === "detect_missing_values");
      const mr = (miss as any)?.result;
      const missing = mr?.columns_with_missing ?? mr?.missing_data?.length ?? 0;
      return `eda complete  ${ok}/${total} ok  ${missing} columns with missing values`;
    }
    case "cleaning":
      return `cleaning complete  ${ok}/${total} operations applied`;
    case "visualization":
      return `${ok} chart${ok !== 1 ? "s" : ""} generated`;
    case "feature_engineering":
      return `${ok}/${total} transforms applied`;
    case "modeling": {
      const automl = steps.find(s => s.tool === "auto_ml_pipeline");
      const r = (automl as any)?.result;
      if (r?.best_model) {
        const score = r.best_score ? (r.best_score * 100).toFixed(1) + "%" : "";
        return `best: ${r.best_model}  score: ${score}  type: ${r.problem_type ?? "?"}`;
      }
      return `${ok}/${total} models trained`;
    }
    case "evaluation": {
      const evalStep = steps.find(s => s.tool === "model_evaluation");
      const r = (evalStep as any)?.result;
      if (r?.accuracy != null) return `accuracy: ${(r.accuracy * 100).toFixed(1)}%  f1: ${((r.f1_score ?? 0) * 100).toFixed(1)}%`;
      if (r?.r2_score != null) return `r2: ${r.r2_score.toFixed(3)}  rmse: ${r.rmse?.toFixed(3) ?? "?"}`;
      return `evaluation complete`;
    }
    default:
      return `${ok}/${total} steps succeeded`;
  }
}
