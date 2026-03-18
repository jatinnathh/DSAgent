// app/dashboard/DashboardClient.tsx
"use client";

import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import * as THREE from "three";
import AgentChat from "@/app/components/AgentChat";
import PipelineBuilder from "@/app/components/PipelineBuilder";

/* ─────────────────────────── DESIGN TOKENS ────────────────────────────── */
const C = {
  bg: "#0E0E0E",
  sidebar: "#111111",
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
  white: "#FFFFFF",
  whiteDim: "rgba(255,255,255,0.08)",
  green: "#3FB950",
  greenBg: "rgba(63,185,80,0.1)",
  greenBorder: "rgba(63,185,80,0.22)",
  amber: "#D29922",
  amberBg: "rgba(210,153,34,0.1)",
  amberBorder: "rgba(210,153,34,0.22)",
  red: "#F85149",
  redBg: "rgba(248,81,73,0.1)",
  redBorder: "rgba(248,81,73,0.22)",
  cyan: "#00D4FF",
  purple: "#8B5CF6",
  pink: "#EC4899",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
  sans: "'Inter', system-ui, sans-serif",
  head: "'Sora', 'Inter', sans-serif",
};

const CATEGORY_COLOR: Record<string, string> = {
  cleaning: C.amber,
  eda: C.cyan,
  visualization: C.purple,
  modeling: C.green,
};

const CATEGORY_ICON: Record<string, string> = {
  cleaning: "🧹",
  eda: "🔍",
  visualization: "📊",
  modeling: "🤖",
};

/* ─────────────────────────── 3-D BANNER ───────────────────────────────── */
function BannerParticles() {
  const ref = useRef<THREE.Points>(null);
  const count = 55;
  const positions = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 22;
      p[i * 3 + 1] = (Math.random() - 0.5) * 9;
      p[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    return p;
  }, []);
  useFrame((s) => {
    if (ref.current) {
      ref.current.rotation.y = s.clock.elapsedTime * 0.014;
      ref.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.05) * 0.015;
    }
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#FFFFFF" transparent opacity={0.12} sizeAttenuation />
    </points>
  );
}

function BannerOrb() {
  const mesh = useRef<THREE.Mesh>(null);
  const r1 = useRef<THREE.Mesh>(null);
  const r2 = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (mesh.current) { mesh.current.rotation.y = t * 0.2; mesh.current.rotation.x = t * 0.09; }
    if (r1.current) { r1.current.rotation.x = t * 0.36; r1.current.rotation.z = t * 0.17; }
    if (r2.current) { r2.current.rotation.x = t * -0.2; r2.current.rotation.y = t * 0.3; }
  });
  return (
    <Float speed={1.1} floatIntensity={0.28}>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[0.78, 1]} />
        <meshBasicMaterial color="#FFFFFF" wireframe transparent opacity={0.055} />
      </mesh>
      <mesh ref={r1}>
        <torusGeometry args={[1.18, 0.007, 16, 64]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.18} />
      </mesh>
      <mesh ref={r2}>
        <torusGeometry args={[1.45, 0.005, 16, 64]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.08} />
      </mesh>
    </Float>
  );
}

function BannerScene() {
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 50 }} style={{ background: "transparent" }} dpr={[1, 1.5]}>
      <BannerParticles />
      <BannerOrb />
      <Stars radius={60} depth={40} count={280} factor={1.8} fade speed={0.1} />
    </Canvas>
  );
}

/* ─────────────────────────── COUNT-UP HOOK ────────────────────────────── */
function useCountUp(end: number, duration = 2000, trigger = true) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - t0) / duration, 1);
      setV(Math.floor((1 - Math.pow(1 - p, 3)) * end));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [end, duration, trigger]);
  return v;
}

/* ─────────────────────────── REAL DATA HOOKS ──────────────────────────── */

interface RealOverviewData {
  totalChats: number;
  totalMessages: number;
  totalPipelines: number;
  completedPipelines: number;
  runningPipelines: number;
  failedPipelines: number;
  totalPipelineRuns: number;
  totalSteps: number;
  recentPipelines: any[];
  recentChats: any[];
  pipelinesByCategory: Record<string, number>;
  lastActivity: string | null;
}

function useRealOverviewData() {
  const [data, setData] = useState<RealOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pipelinesRes, chatsRes] = await Promise.all([
        fetch("/api/pipelines"),
        fetch("/api/chats"),
      ]);

      const pipelinesData = pipelinesRes.ok ? await pipelinesRes.json() : { pipelines: [] };
      const chatsData = chatsRes.ok ? await chatsRes.json() : { chats: [] };

      const pipelines: any[] = pipelinesData.pipelines || [];
      const chats: any[] = chatsData.chats || [];

      // Compute stats from real data
      const totalMessages = chats.reduce((acc: number, c: any) => acc + (c._count?.messages || 0), 0);
      const completedPipelines = pipelines.filter((p: any) => p.status === "completed").length;
      const runningPipelines = pipelines.filter((p: any) => p.status === "running").length;
      const failedPipelines = pipelines.filter((p: any) => p.status === "failed").length;
      const totalSteps = pipelines.reduce((acc: number, p: any) => acc + (Array.isArray(p.steps) ? p.steps.length : 0), 0);
      const totalPipelineRuns = pipelines.reduce((acc: number, p: any) => acc + (p._count?.runs || 0), 0);

      // Category breakdown across all pipeline steps
      const catCounts: Record<string, number> = { cleaning: 0, eda: 0, visualization: 0, modeling: 0 };
      pipelines.forEach((p: any) => {
        (Array.isArray(p.steps) ? p.steps : []).forEach((s: any) => {
          if (s.category && catCounts[s.category] !== undefined) catCounts[s.category]++;
        });
      });

      // Last activity: most recent updatedAt across pipelines and chats
      const allDates = [
        ...pipelines.map((p: any) => p.updatedAt),
        ...chats.map((c: any) => c.updatedAt),
      ].filter(Boolean).sort().reverse();

      setData({
        totalChats: chats.length,
        totalMessages,
        totalPipelines: pipelines.length,
        completedPipelines,
        runningPipelines,
        failedPipelines,
        totalPipelineRuns,
        totalSteps,
        recentPipelines: pipelines.slice(0, 5),
        recentChats: chats.slice(0, 4),
        pipelinesByCategory: catCounts,
        lastActivity: allDates[0] || null,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/* ─────────────────────────── STATIC DATA ──────────────────────────────── */
const NAV_GROUPS = [
  {
    section: "WORKSPACE",
    items: [
      { id: "overview", label: "Overview", badge: null },
      { id: "agent", label: "AI Analyst", badge: "NEW" },
      { id: "pipelines", label: "Pipelines", badge: "3" },
      { id: "datasets", label: "Datasets", badge: "12" },
      { id: "models", label: "Models", badge: null },
    ],
  },
  {
    section: "INTELLIGENCE",
    items: [
      { id: "explainability", label: "Explainability", badge: null },
      { id: "reports", label: "Reports", badge: null },
    ],
  },
  {
    section: "DEPLOY",
    items: [
      { id: "endpoints", label: "API Endpoints", badge: null },
      { id: "monitoring", label: "Monitoring", badge: null },
    ],
  },
];

const STATUS_MAP = {
  completed: { label: "Done", color: C.green, bg: C.greenBg, border: C.greenBorder },
  running: { label: "Running", color: C.text, bg: C.whiteDim, border: C.borderMd },
  failed: { label: "Error", color: C.red, bg: C.redBg, border: C.redBorder },
  draft: { label: "Draft", color: C.textSub, bg: C.whiteDim, border: C.borderMd },
} as const;

/* ─────────────────────────── SMALL HELPERS ────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Bar({ pct, color, delay = 0, h = 3 }: { pct: number; color: string; delay?: number; h?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), delay + 80); return () => clearTimeout(t); }, [pct, delay]);
  return (
    <div style={{ height: h, background: C.border, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 2, transition: "width 0.9s cubic-bezier(0.25,0.46,0.45,0.94)" }} />
    </div>
  );
}

function RunningBar() {
  const [w, setW] = useState(62);
  useEffect(() => { const id = setInterval(() => setW(p => p >= 99 ? 62 : p + 0.25), 80); return () => clearInterval(id); }, []);
  return (
    <div style={{ marginTop: 5, height: 2, background: C.border, borderRadius: 1, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${w}%`, background: C.text, borderRadius: 1, transition: "width 0.1s linear" }} />
    </div>
  );
}

function SkeletonBlock({ w = "100%", h = 16, r = 4 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <div style={{ width: w, height: h, borderRadius: r, background: `linear-gradient(90deg, ${C.card} 25%, ${C.cardHover} 50%, ${C.card} 75%)`, backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite" }} />
  );
}

function Pill({ status }: { status: keyof typeof STATUS_MAP }) {
  const s = STATUS_MAP[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 5, background: s.bg, color: s.color, border: `0.5px solid ${s.border}`, fontSize: 10, fontWeight: 600, letterSpacing: "0.03em", fontFamily: C.mono }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, flexShrink: 0, animation: status === "running" ? "pls 1.8s ease-in-out infinite" : "none" }} />
      {s.label}
    </span>
  );
}

function NI({ id }: { id: string }) {
  const p = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const icons: Record<string, React.ReactNode> = {
    overview: <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
    pipelines: <svg {...p}><polyline points="22,12 18,12 15,21 9,3 6,12 2,12" /></svg>,
    datasets: <svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /></svg>,
    models: <svg {...p}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>,
    agent: <svg {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
    explainability: <svg {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    reports: <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
    endpoints: <svg {...p}><rect x="2" y="7" width="12" height="7" rx="1" /><path d="M5 7V5a3 3 0 016 0v2" /></svg>,
    monitoring: <svg {...p}><circle cx="12" cy="12" r="5" /><path d="M12 7v5l2 2" /></svg>,
    settings: <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>,
  };
  return <>{icons[id] ?? null}</>;
}

const card: React.CSSProperties = { background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden" };
const cardHdr: React.CSSProperties = { padding: "14px 18px", borderBottom: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" };
const TH: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: C.textMute, fontFamily: C.mono };

function Btn({ children, primary, onClick, style }: { children: React.ReactNode; primary?: boolean; onClick?: () => void; style?: React.CSSProperties }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: primary ? "7px 16px" : "6px 12px", borderRadius: 7, border: `0.5px solid ${hov ? C.borderHi : primary ? C.borderMd : C.border}`, background: primary ? (hov ? "#F0F0F0" : C.white) : (hov ? C.cardHover : "transparent"), color: primary ? C.bg : (hov ? C.text : C.textSub), fontSize: 11, fontWeight: primary ? 600 : 500, fontFamily: C.sans, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, transition: "all 0.14s", ...style }}>
      {children}
    </button>
  );
}

function NavBtn({ item, isActive, collapsed, onClick }: { item: { id: string; label: string; badge: string | null }; isActive: boolean; collapsed: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  const isNew = item.badge === "NEW";
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: collapsed ? "9px 0" : "8px 10px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 8, border: isActive ? `0.5px solid ${C.borderMd}` : "0.5px solid transparent", background: isActive || hov ? C.cardHover : "transparent", color: isActive ? C.text : hov ? C.textSub : C.textMute, fontSize: 12, fontWeight: isActive ? 500 : 400, fontFamily: C.sans, cursor: "pointer", transition: "all 0.13s" }}>
      <NI id={item.id} />
      {!collapsed && <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>}
      {!collapsed && item.badge && (
        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: isNew ? `${C.cyan}20` : C.pill, color: isNew ? C.cyan : C.textSub, border: `0.5px solid ${isNew ? C.cyan + "40" : C.border}`, fontFamily: C.mono }}>{item.badge}</span>
      )}
    </button>
  );
}

function ActionCard({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick?: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 10, cursor: "pointer", background: hov ? C.cardHover : C.card, border: `0.5px solid ${hov ? C.borderMd : C.border}`, color: hov ? C.text : C.textSub, fontSize: 12, fontWeight: 500, fontFamily: C.sans, transition: "all 0.13s" }}>
      {icon}{label}
    </button>
  );
}

/* ─────────────────────────── PIPELINE RUN HISTORY ─────────────────────── */
function PipelineRunHistory({ pipelineId, onClose }: { pipelineId: string; onClose: () => void }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/pipelines/${pipelineId}/run`)
      .then(r => r.ok ? r.json() : { runs: [] })
      .then(d => { setRuns(d.runs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [pipelineId]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, width: "100%", maxWidth: 600, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontFamily: C.head, fontSize: "0.95rem", fontWeight: 700, color: C.text, margin: 0 }}>Run History</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.textMute, fontSize: 12 }}>Loading…</div>
          ) : runs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: C.textMute, fontSize: 12 }}>No runs recorded yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {runs.map((run, i) => {
                const results = Array.isArray(run.stepResults) ? run.stepResults : [];
                const successCount = results.filter((r: any) => r.success).length;
                const errorCount = results.filter((r: any) => !r.success).length;
                return (
                  <div key={run.id} style={{ background: C.cardHover, borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: C.textMute }}>Run #{runs.length - i}</span>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: `${C.green}20`, color: C.green, fontFamily: C.mono, fontWeight: 600 }}>{successCount} ✓</span>
                      {errorCount > 0 && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: `${C.red}20`, color: C.red, fontFamily: C.mono, fontWeight: 600 }}>{errorCount} ✗</span>}
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>{new Date(run.startedAt).toLocaleDateString()} {new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {results.map((r: any, ri: number) => (
                      <div key={ri} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: C.mono }}>
                        <span style={{ color: r.success ? C.green : C.red, fontSize: 12 }}>{r.success ? "✓" : "✗"}</span>
                        <span style={{ color: C.textSub, flex: 1 }}>{r.tool}</span>
                        {r.executionMs && <span style={{ color: C.textMute }}>{r.executionMs}ms</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────── REAL PIPELINE ROW ─────────────────────────── */
function RealPipelineRow({ pipeline }: { pipeline: any }) {
  const [hov, setHov] = useState(false);
  const statusKey = (pipeline.status in STATUS_MAP ? pipeline.status : "draft") as keyof typeof STATUS_MAP;
  const steps = Array.isArray(pipeline.steps) ? pipeline.steps : [];
  const runCount = pipeline._count?.runs ?? 0;

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", padding: "11px 18px", gap: 12, alignItems: "center", borderBottom: `0.5px solid ${C.border}`, background: hov ? C.cardHover : "transparent", cursor: "default", transition: "background 0.12s" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.textSub, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pipeline.name}</div>
        <div style={{ fontSize: 10, color: C.textMute, marginTop: 2, fontFamily: C.mono }}>{steps.length} step{steps.length !== 1 ? "s" : ""} · {runCount} run{runCount !== 1 ? "s" : ""}</div>
        {pipeline.status === "running" && <RunningBar />}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {(["cleaning", "eda", "visualization", "modeling"] as const).map(cat => {
          const cnt = steps.filter((s: any) => s.category === cat).length;
          if (!cnt) return null;
          return <span key={cat} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: `${CATEGORY_COLOR[cat]}18`, color: CATEGORY_COLOR[cat], fontFamily: C.mono }}>{CATEGORY_ICON[cat]}{cnt}</span>;
        })}
      </div>
      <Pill status={statusKey} />
      <span style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, whiteSpace: "nowrap" }}>{timeAgo(pipeline.updatedAt)}</span>
    </div>
  );
}

/* ─────────────────────────── REAL CHAT ROW ─────────────────────────────── */
function RealChatRow({ chat, last }: { chat: any; last: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", gap: 10, padding: "10px 16px", borderBottom: last ? "none" : `0.5px solid ${C.border}`, background: hov ? C.cardHover : "transparent", transition: "background 0.12s", cursor: "default" }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.cyan}15`, border: `1px solid ${C.cyan}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12 }}>💬</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: C.textSub, lineHeight: 1.45, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.title || "Untitled Chat"}</p>
        <p style={{ fontSize: 10, color: C.textMute, marginTop: 3, fontFamily: C.mono }}>{chat._count?.messages ?? 0} messages · {timeAgo(chat.updatedAt)}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── CATEGORY DONUT ─────────────────────────────── */
function CategoryDonut({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 80, color: C.textMute, fontSize: 11 }}>No step data yet</div>
  );

  const categories = Object.entries(data).filter(([, v]) => v > 0);
  const colors: Record<string, string> = { cleaning: C.amber, eda: C.cyan, visualization: C.purple, modeling: C.green };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0" }}>
      <svg width={80} height={80} viewBox="0 0 36 36">
        {(() => {
          let cum = 0;
          return categories.map(([cat, val]) => {
            const pct = val / total;
            const start = cum;
            cum += pct;
            const r = 15.9155;
            const circ = 2 * Math.PI * r;
            const dash = pct * circ;
            const gap = circ - dash;
            const offset = circ * (1 - start);
            return (
              <circle key={cat} cx="18" cy="18" r={r} fill="none"
                stroke={colors[cat]} strokeWidth={3.5}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={offset}
                style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }} />
            );
          });
        })()}
        <text x="18" y="20" textAnchor="middle" fontSize="7" fill={C.text} fontFamily={C.mono} fontWeight="bold">{total}</text>
        <text x="18" y="25.5" textAnchor="middle" fontSize="4.5" fill={C.textMute} fontFamily={C.mono}>steps</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {categories.map(([cat, val]) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[cat], flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: C.textSub, fontFamily: C.mono }}>{CATEGORY_ICON[cat]} {cat}</span>
            <span style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, marginLeft: "auto" }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── STAT CARD WITH TREND ─────────────────────── */
function StatCard({ label, value, sub, color, pct, delay, loading }: {
  label: string; value: string | number; sub?: string;
  color: string; pct: number; delay?: number; loading?: boolean;
}) {
  return (
    <motion.div whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 500 }} style={{ ...card, padding: "18px 20px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>{label}</div>
      {loading ? (
        <div style={{ marginBottom: 10 }}><SkeletonBlock h={28} w="60%" /></div>
      ) : (
        <div style={{ fontFamily: C.head, fontSize: "1.65rem", fontWeight: 700, color, letterSpacing: "-0.03em", marginBottom: 2 }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      )}
      {sub && <div style={{ fontSize: 10, color: C.textMute, marginBottom: 8 }}>{sub}</div>}
      <Bar pct={loading ? 0 : pct} color={color} delay={delay} />
    </motion.div>
  );
}

/* ─────────────────────────── AGENT VIEW ───────────────────────────────── */
function AgentView() {
  const [chatSidebarCollapsed, setChatSidebarCollapsed] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const fetchChats = async () => {
    try {
      const res = await fetch("/api/chats");
      if (res.ok) { const d = await res.json(); setChats(d.chats || []); }
    } catch { }
  };

  useEffect(() => { fetchChats(); }, []);

  return (
    <div style={{ height: "calc(100vh - 120px)", display: "grid", gridTemplateColumns: chatSidebarCollapsed ? "42px 1fr" : "280px 1fr", gap: 20, transition: "grid-template-columns 0.25s ease" }}>
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setChatSidebarCollapsed(v => !v)} style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", fontSize: 14 }}>
              {chatSidebarCollapsed ? "▶" : "◀"}
            </button>
            {!chatSidebarCollapsed && <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>Recent Chats</h3>}
          </div>
          {!chatSidebarCollapsed && (
            <button onClick={() => setSelectedChatId(null)} style={{ background: C.cyan, color: "black", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ New</button>
          )}
        </div>
        {!chatSidebarCollapsed && (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {chats.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMute, fontSize: 12 }}>No chats yet</div>
            ) : chats.map((chat) => (
              <div key={chat.id} onClick={() => setSelectedChatId(chat.id)}
                style={{ padding: "12px", borderRadius: 10, border: selectedChatId === chat.id ? `1px solid ${C.cyan}44` : "transparent", background: selectedChatId === chat.id ? `${C.cyan}11` : "transparent", cursor: "pointer", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: selectedChatId === chat.id ? C.cyan : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.title}</div>
                <div style={{ fontSize: 10, color: C.textMute }}>{chat._count.messages} messages</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <AgentChat chatId={selectedChatId} onChatCreated={(id) => { setSelectedChatId(id); fetchChats(); }} />
      </div>
    </div>
  );
}

/* ─────────────────────────── PIPELINE VIEW ────────────────────────────── */
function PipelineListCard({ pipeline, onRefresh, onViewHistory, onOpen }: {
  pipeline: any; onRefresh: () => void; onViewHistory: (id: string) => void;
  onOpen: (pipeline: any) => void;
}) {
  const [hov, setHov] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusColor: Record<string, string> = {
    draft: C.textMute, running: C.amber, completed: C.green, failed: C.red,
  };
  const statusIcon: Record<string, string> = {
    draft: "✏️", running: "⚡", completed: "✅", failed: "❌",
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this pipeline?")) return;
    setDeleting(true);
    await fetch(`/api/pipelines/${pipeline.id}`, { method: "DELETE" });
    onRefresh();
  };

  const steps = Array.isArray(pipeline.steps) ? pipeline.steps : [];
  const runCount = pipeline._count?.runs ?? 0;
  const sc = statusColor[pipeline.status] || C.textMute;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => onOpen(pipeline)}
      style={{
        padding: "0", background: hov ? C.cardHover : C.card,
        border: `1px solid ${hov ? C.cyan + "44" : C.border}`,
        borderRadius: 12, display: "flex", alignItems: "stretch",
        cursor: "pointer", transition: "all 0.15s", overflow: "hidden",
        boxShadow: hov ? `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${C.cyan}22` : "none",
      }}
    >
      {/* Status stripe on left */}
      <div style={{ width: 4, flexShrink: 0, background: hov ? sc : `${sc}66`, transition: "background 0.15s" }} />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, padding: "13px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: `${sc}15`, border: `1px solid ${sc}30`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          transition: "all 0.15s",
        }}>
          {statusIcon[pipeline.status] ?? "⚡"}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: C.head, fontSize: 13, fontWeight: 600, color: hov ? C.white : C.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 0.15s" }}>
            {pipeline.name}
          </div>
          <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, display: "flex", alignItems: "center", gap: 8 }}>
            <span>{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
            <span style={{ color: C.border }}>·</span>
            <span>{runCount} run{runCount !== 1 ? "s" : ""}</span>
            <span style={{ color: C.border }}>·</span>
            <span>{new Date(pipeline.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Category pills */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {(["cleaning", "eda", "visualization", "modeling"] as const).map((cat) => {
            const count = steps.filter((s: any) => s.category === cat).length;
            if (!count) return null;
            return (
              <span key={cat} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${CATEGORY_COLOR[cat]}18`, color: CATEGORY_COLOR[cat], fontFamily: C.mono, fontWeight: 600 }}>
                {CATEGORY_ICON[cat]}{count}
              </span>
            );
          })}
        </div>

        {/* Status badge */}
        <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 6, background: `${sc}18`, color: sc, fontFamily: C.mono, fontWeight: 600, border: `1px solid ${sc}33`, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
          {pipeline.status === "running" && <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc, animation: "pls 1.2s ease-in-out infinite" }} />}
          {pipeline.status}
        </span>

        {/* Open button — shown on hover */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, opacity: hov ? 1 : 0, transition: "opacity 0.15s" }}>
          <span style={{ fontSize: 10, color: C.cyan, fontFamily: C.mono, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            Open →
          </span>
        </div>

        {/* History btn */}
        {runCount > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewHistory(pipeline.id); }}
            style={{ padding: "4px 9px", borderRadius: 5, border: `1px solid ${C.borderMd}`, background: "none", color: C.textSub, fontSize: 10, fontFamily: C.mono, cursor: "pointer", flexShrink: 0, transition: "all 0.13s" }}
            onMouseEnter={(e) => { e.stopPropagation(); (e.currentTarget.style.color = C.cyan); (e.currentTarget.style.borderColor = C.cyan + "55"); }}
            onMouseLeave={(e) => { (e.currentTarget.style.color = C.textSub); (e.currentTarget.style.borderColor = C.borderMd); }}
          >
            📋 History
          </button>
        )}

        {/* Delete */}
        <button
          onClick={handleDelete} disabled={deleting}
          style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", padding: "4px 6px", borderRadius: 4, fontSize: 13, opacity: deleting ? 0.3 : 1, transition: "color 0.15s", flexShrink: 0 }}
          onMouseEnter={(e) => { e.stopPropagation(); (e.currentTarget.style.color = C.red); }}
          onMouseLeave={(e) => { (e.currentTarget.style.color = C.textMute); }}
        >
          🗑
        </button>
      </div>
    </motion.div>
  );
}

function PipelineView() {
  const [savedPipelines, setSavedPipelines] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingPipeline, setEditingPipeline] = useState<any | null>(null);
  const [historyPipelineId, setHistoryPipelineId] = useState<string | null>(null);

  const fetchPipelines = async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/pipelines");
      if (res.ok) { const d = await res.json(); setSavedPipelines(d.pipelines || []); }
    } finally { setLoadingList(false); }
  };

  useEffect(() => { fetchPipelines(); }, []);

  const totalSteps = savedPipelines.reduce((acc, p) => acc + (Array.isArray(p.steps) ? p.steps.length : 0), 0);
  const completedCount = savedPipelines.filter(p => p.status === "completed").length;
  const draftCount = savedPipelines.filter(p => p.status === "draft").length;

  const openPipeline = (pipeline: any) => {
    setEditingPipeline(pipeline);
    setView("edit");
  };

  const goBack = () => {
    setView("list");
    setEditingPipeline(null);
    fetchPipelines();
  };

  // ── Builder view (new OR edit) ──
  if (view === "create" || view === "edit") {
    const isEdit = view === "edit" && editingPipeline;
    return (
      <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexShrink: 0 }}>
          <button onClick={goBack}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 12px", color: C.textSub, fontSize: 11, cursor: "pointer", fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5, transition: "all 0.14s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.text; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textSub; }}>
            ← Pipelines
          </button>
          <h2 style={{ fontFamily: C.head, fontSize: "0.95rem", fontWeight: 700, color: C.text, margin: 0 }}>
            {isEdit ? editingPipeline.name : "New Pipeline"}
          </h2>
          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: `${C.cyan}15`, color: C.cyan, border: `1px solid ${C.cyan}30`, fontFamily: C.mono }}>
            AI-Assisted
          </span>
          {isEdit && (
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: `${C.amber}15`, color: C.amber, border: `1px solid ${C.amber}30`, fontFamily: C.mono }}>
              Editing
            </span>
          )}
          {isEdit && (
            <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, marginLeft: "auto" }}>
              {Array.isArray(editingPipeline.steps) ? editingPipeline.steps.length : 0} saved steps · ID: {editingPipeline.id.slice(0, 8)}…
            </span>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <PipelineBuilder
            key={isEdit ? editingPipeline.id : "new"}
            onSaved={() => fetchPipelines()}
            initialPipeline={isEdit ? editingPipeline : undefined}
          />
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontFamily: C.head, fontSize: "1.15rem", fontWeight: 700, color: C.text, marginBottom: 4, letterSpacing: "-0.02em" }}>Pipelines</h2>
          <p style={{ fontSize: 12, color: C.textSub, margin: 0 }}>
            Build, save and re-run automated data science workflows.
            {savedPipelines.length > 0 && <span style={{ color: C.textMute }}> · Click any pipeline to open it.</span>}
          </p>
        </div>
        <button onClick={() => setView("create")}
          style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: `linear-gradient(135deg, ${C.cyan}, #0099CC)`, color: "#030712", fontSize: 12, fontWeight: 700, fontFamily: C.head, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: `0 4px 20px ${C.cyan}30`, flexShrink: 0 }}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Pipeline
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
        {[
          { label: "Total", value: loadingList ? "…" : savedPipelines.length, color: C.cyan },
          { label: "Completed", value: loadingList ? "…" : completedCount, color: C.green },
          { label: "Draft", value: loadingList ? "…" : draftCount, color: C.textSub },
          { label: "Steps", value: loadingList ? "…" : totalSteps, color: C.purple },
        ].map((s, i) => (
          <div key={i} style={{ ...card, padding: "13px 15px" }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.textMute, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 5, fontFamily: C.mono }}>{s.label}</div>
            <div style={{ fontFamily: C.head, fontSize: "1.5rem", fontWeight: 700, color: s.color, letterSpacing: "-0.03em" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Pipeline list */}
      {loadingList ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 70, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, opacity: 0.3 + i * 0.1, overflow: "hidden", display: "flex" }}>
              <div style={{ width: 4, background: C.border }} />
            </div>
          ))}
        </div>
      ) : savedPipelines.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: "center", padding: "70px 20px", background: C.card, borderRadius: 16, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 38, marginBottom: 14 }}>⚡</div>
          <div style={{ fontFamily: C.head, fontSize: "1rem", fontWeight: 600, color: C.text, marginBottom: 7 }}>No pipelines yet</div>
          <p style={{ fontSize: 12, color: C.textSub, marginBottom: 20, maxWidth: 300, margin: "0 auto 20px" }}>
            Upload a CSV, let AI suggest steps, and run them automatically.
          </p>
          <button onClick={() => setView("create")}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${C.cyan}, #0099CC)`, color: "#030712", fontSize: 12, fontWeight: 700, fontFamily: C.head, cursor: "pointer" }}>
            Build First Pipeline
          </button>
        </motion.div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AnimatePresence>
            {savedPipelines.map(p => (
              <PipelineListCard
                key={p.id}
                pipeline={p}
                onRefresh={fetchPipelines}
                onViewHistory={(id) => setHistoryPipelineId(id)}
                onOpen={openPipeline}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {historyPipelineId && <PipelineRunHistory pipelineId={historyPipelineId} onClose={() => setHistoryPipelineId(null)} />}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── OVERVIEW (REAL DATA) ─────────────────────── */
function OverviewContent({ user, setActiveView }: { user: { firstName: string | null; email?: string }; setActiveView: (v: string) => void }) {
  const mRef = useRef<HTMLDivElement>(null);
  const inView = useInView(mRef, { once: true });
  const { data, loading, refetch } = useRealOverviewData();

  // Animate real counts
  const animPipelines = useCountUp(data?.totalPipelines ?? 0, 1200, inView && !loading);
  const animChats = useCountUp(data?.totalChats ?? 0, 1200, inView && !loading);
  const animMessages = useCountUp(data?.totalMessages ?? 0, 1600, inView && !loading);
  const animRuns = useCountUp(data?.totalPipelineRuns ?? 0, 1400, inView && !loading);

  const runningCount = data?.runningPipelines ?? 0;
  const completedCount = data?.completedPipelines ?? 0;
  const totalPipelines = data?.totalPipelines ?? 0;
  const completionRate = totalPipelines > 0 ? Math.round((completedCount / totalPipelines) * 100) : 0;

  return (
    <>
      {/* HERO BANNER */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18 }}
        style={{ ...card, height: 184, marginBottom: 18, display: "flex", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}><BannerScene /></div>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${C.card} 0%, ${C.card}CC 42%, transparent 100%)` }} />
        <div style={{ position: "relative", zIndex: 2, padding: "26px 28px", display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <p style={{ fontFamily: C.head, fontSize: "1.4rem", fontWeight: 700, color: C.text, marginBottom: 6, letterSpacing: "-0.025em" }}>
            {getGreeting()}, {user.firstName ?? "there"} 👋
          </p>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              <SkeletonBlock h={12} w={280} />
              <SkeletonBlock h={12} w={220} />
            </div>
          ) : (
            <p style={{ fontSize: "0.82rem", color: C.textSub, lineHeight: 1.65, maxWidth: 420, marginBottom: 16 }}>
              {runningCount > 0
                ? <>You have <span style={{ color: C.amber, fontWeight: 600 }}>{runningCount} pipeline{runningCount !== 1 ? "s" : ""} running</span> right now.</>
                : completedCount > 0
                ? <>You've completed <span style={{ color: C.green, fontWeight: 600 }}>{completedCount} pipeline{completedCount !== 1 ? "s" : ""}</span> successfully.</>
                : <>Welcome! Build your first pipeline or start a chat with AI Analyst.</>
              }
              {data?.totalChats > 0 && <> You have <span style={{ color: C.cyan, fontWeight: 600 }}>{data.totalChats} chat session{data.totalChats !== 1 ? "s" : ""}</span> saved.</>}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn primary onClick={() => setActiveView("agent")}>Ask AI Analyst</Btn>
            <Btn onClick={() => setActiveView("pipelines")}>Build Pipeline</Btn>
          </div>
        </div>
        {/* User info badge */}
        <div style={{ position: "relative", zIndex: 2, padding: "26px 28px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          {user.email && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", marginBottom: 2 }}>SIGNED IN AS</div>
              <div style={{ fontSize: 11, color: C.text, fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
            </div>
          )}
          {data?.lastActivity && (
            <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>Last active: {timeAgo(data.lastActivity)}</div>
          )}
        </div>
      </motion.div>

      {/* REAL METRICS */}
      <motion.div ref={mRef} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.26 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        <StatCard label="Pipelines" value={animPipelines} sub={completedCount > 0 ? `${completedCount} completed` : "none yet"} color={C.cyan} pct={Math.min(totalPipelines * 10, 100)} delay={0} loading={loading} />
        <StatCard label="Chats" value={animChats} sub={data?.totalMessages ? `${animMessages.toLocaleString()} messages` : undefined} color={C.purple} pct={Math.min((data?.totalChats ?? 0) * 8, 100)} delay={110} loading={loading} />
        <StatCard label="Pipeline Runs" value={animRuns} sub={totalPipelines > 0 ? `${completionRate}% success rate` : undefined} color={C.green} pct={completionRate} delay={220} loading={loading} />
        <StatCard label="Steps Built" value={loading ? "—" : (data?.totalSteps ?? 0)} sub={data?.totalSteps ? "across all pipelines" : undefined} color={C.amber} pct={Math.min((data?.totalSteps ?? 0) * 3, 100)} delay={330} loading={loading} />
      </motion.div>

      {/* QUICK ACTIONS */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.34 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Ask AI Analyst", onClick: () => setActiveView("agent"), icon: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg> },
          { label: "Build Pipeline", onClick: () => setActiveView("pipelines"), icon: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12" /></svg> },
          { label: "Upload Data", onClick: () => setActiveView("agent"), icon: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg> },
          { label: "Refresh Data", onClick: refetch, icon: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" /></svg> },
        ].map((a, i) => <ActionCard key={i} label={a.label} icon={a.icon} onClick={a.onClick} />)}
      </motion.div>

      {/* PIPELINES + CHATS SIDE BY SIDE */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12, marginBottom: 14 }}>

        {/* REAL PIPELINES */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.42 }} style={card}>
          <div style={cardHdr}>
            <div>
              <div style={{ fontFamily: C.head, fontSize: "0.86rem", fontWeight: 600, color: C.text }}>Your Pipelines</div>
              <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>
                {loading ? "Loading…" : `${data?.totalPipelines ?? 0} total · ${data?.completedPipelines ?? 0} completed`}
              </div>
            </div>
            <Btn onClick={() => setActiveView("pipelines")}>View all</Btn>
          </div>
          {loading ? (
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2, 3].map(i => <SkeletonBlock key={i} h={36} r={6} />)}
            </div>
          ) : data?.recentPipelines.length === 0 ? (
            <div style={{ padding: "32px 18px", textAlign: "center", color: C.textMute, fontSize: 11 }}>
              No pipelines yet.{" "}
              <button onClick={() => setActiveView("pipelines")} style={{ color: C.cyan, background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>Build one →</button>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", padding: "8px 18px", gap: 12, borderBottom: `0.5px solid ${C.border}` }}>
                {["Pipeline", "Category", "Status", "Updated"].map(h => <span key={h} style={TH}>{h}</span>)}
              </div>
              {data?.recentPipelines.map(p => <RealPipelineRow key={p.id} pipeline={p} />)}
            </>
          )}
        </motion.div>

        {/* REAL CHATS */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.5 }} style={card}>
          <div style={cardHdr}>
            <div>
              <div style={{ fontFamily: C.head, fontSize: "0.86rem", fontWeight: 600, color: C.text }}>Recent Chats</div>
              <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>
                {loading ? "Loading…" : `${data?.totalChats ?? 0} conversations · ${data?.totalMessages ?? 0} messages`}
              </div>
            </div>
            <Btn primary onClick={() => setActiveView("agent")}>+ New</Btn>
          </div>
          {loading ? (
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2, 3].map(i => <SkeletonBlock key={i} h={40} r={6} />)}
            </div>
          ) : data?.recentChats.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: C.textMute, fontSize: 11 }}>
              No chats yet.{" "}
              <button onClick={() => setActiveView("agent")} style={{ color: C.cyan, background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>Start one →</button>
            </div>
          ) : (
            data?.recentChats.map((c, i) => <RealChatRow key={c.id} chat={c} last={i === (data.recentChats.length - 1)} />)
          )}
        </motion.div>
      </div>

      {/* PIPELINE BREAKDOWN + STATUS CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>

        {/* Step Category Breakdown */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.56 }} style={card}>
          <div style={cardHdr}>
            <div>
              <div style={{ fontFamily: C.head, fontSize: "0.86rem", fontWeight: 600, color: C.text }}>Step Breakdown</div>
              <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>By category</div>
            </div>
          </div>
          <div style={{ padding: "10px 16px 14px" }}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1, 2, 3, 4].map(i => <SkeletonBlock key={i} h={14} r={4} />)}
              </div>
            ) : (
              <CategoryDonut data={data?.pipelinesByCategory ?? { cleaning: 0, eda: 0, visualization: 0, modeling: 0 }} />
            )}
          </div>
        </motion.div>

        {/* Pipeline Status cards */}
        {[
          { label: "Completed", value: loading ? "—" : completedCount, color: C.green, icon: "✅", sub: "pipelines done" },
          { label: "Running", value: loading ? "—" : runningCount, color: C.amber, icon: "⚡", sub: "in progress" },
          { label: "Failed", value: loading ? "—" : (data?.failedPipelines ?? 0), color: C.red, icon: "❌", sub: "need attention" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.6 + i * 0.05 }} style={{ ...card, padding: "18px 20px" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontFamily: C.head, fontSize: "1.8rem", fontWeight: 700, color: s.color, letterSpacing: "-0.03em", marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</div>
            <div style={{ fontSize: 10, color: C.textMute, marginTop: 2 }}>{s.sub}</div>
            {!loading && (
              <div style={{ marginTop: 10 }}>
                <Bar pct={totalPipelines > 0 ? Math.round((Number(s.value) / totalPipelines) * 100) : 0} color={s.color} delay={700 + i * 60} h={3} />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* PIPELINE COMPLETION BAR + USER INFO */}
      {!loading && totalPipelines > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.76 }} style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: "0.07em" }}>Pipeline Success Rate</span>
              <div style={{ fontSize: 10, color: C.textMute, marginTop: 2 }}>{completedCount} of {totalPipelines} pipelines completed · {data?.totalPipelineRuns ?? 0} total runs</div>
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 16, color: completionRate >= 80 ? C.green : completionRate >= 50 ? C.amber : C.red, fontWeight: 700 }}>{completionRate}%</span>
          </div>
          <Bar pct={completionRate} color={completionRate >= 80 ? C.green : completionRate >= 50 ? C.amber : C.red} delay={950} h={5} />
        </motion.div>
      )}

      {/* EMPTY STATE - new user */}
      {!loading && totalPipelines === 0 && (data?.totalChats ?? 0) === 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.76 }}
          style={{ ...card, padding: "40px 28px", marginBottom: 14, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
          <div style={{ fontFamily: C.head, fontSize: "1.1rem", fontWeight: 700, color: C.text, marginBottom: 8 }}>Welcome to DSAgent!</div>
          <p style={{ fontSize: 12, color: C.textSub, maxWidth: 420, margin: "0 auto 24px", lineHeight: 1.65 }}>
            You haven't built any pipelines or started any chats yet. Upload a CSV to get started — DSAgent will automatically suggest cleaning, analysis, and modelling steps.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => setActiveView("agent")}
              style={{ padding: "10px 22px", borderRadius: 9, border: "none", background: `linear-gradient(135deg, ${C.cyan}, #0099CC)`, color: "#030712", fontSize: 12, fontWeight: 700, fontFamily: C.head, cursor: "pointer" }}>
              Chat with AI Analyst →
            </button>
            <button onClick={() => setActiveView("pipelines")}
              style={{ padding: "10px 22px", borderRadius: 9, border: `1px solid ${C.borderMd}`, background: "transparent", color: C.text, fontSize: 12, fontWeight: 600, fontFamily: C.head, cursor: "pointer" }}>
              Build a Pipeline
            </button>
          </div>
        </motion.div>
      )}
    </>
  );
}

/* ─────────────────────────── MAIN EXPORT ──────────────────────────────── */
interface Props { user: { firstName: string | null; email: string | undefined } }

export default function DashboardClient({ user }: Props) {
  const [activeView, setActiveView] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const sW = collapsed ? 60 : 228;

  const topbarTitle = activeView === "agent" ? "AI Analyst" : activeView === "pipelines" ? "Pipelines" : activeView.charAt(0).toUpperCase() + activeView.slice(1);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans }}>

      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <motion.aside initial={{ x: -240 }} animate={{ x: 0 }} transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ width: sW, minHeight: "100vh", position: "fixed", top: 0, left: 0, zIndex: 50, display: "flex", flexDirection: "column", background: C.sidebar, borderRight: `0.5px solid ${C.border}`, transition: "width 0.26s cubic-bezier(0.25,0.46,0.45,0.94)", overflow: "hidden" }}>
        <div style={{ padding: collapsed ? "18px 0" : "16px 16px", borderBottom: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", minHeight: 54 }}>
          {!collapsed && <Link href="/" style={{ fontFamily: C.head, fontSize: "1rem", fontWeight: 700, color: C.text, textDecoration: "none", letterSpacing: "-0.02em" }}>DSAgent</Link>}
          {!collapsed && <span style={{ fontSize: 10, color: C.textMute, background: C.pill, padding: "2px 7px", borderRadius: 4, border: `0.5px solid ${C.border}`, fontFamily: C.mono }}>beta</span>}
          <button onClick={() => setCollapsed(c => !c)} style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", padding: 5, borderRadius: 5, display: "flex", marginLeft: collapsed ? 0 : 2 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          </button>
        </div>
        <nav style={{ flex: 1, padding: "8px 7px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
          {NAV_GROUPS.map(g => (
            <div key={g.section}>
              {!collapsed && <div style={{ fontSize: 9, fontWeight: 600, color: C.textMute, padding: "10px 10px 4px", letterSpacing: "0.09em" }}>{g.section}</div>}
              {g.items.map(item => <NavBtn key={item.id} item={item} isActive={activeView === item.id} collapsed={collapsed} onClick={() => setActiveView(item.id)} />)}
            </div>
          ))}
        </nav>
        <div style={{ padding: "8px 7px", borderTop: `0.5px solid ${C.border}` }}>
          <NavBtn item={{ id: "settings", label: "Settings", badge: null }} isActive={false} collapsed={collapsed} onClick={() => setActiveView("settings")} />
        </div>
        <div style={{ padding: "11px 13px 14px", borderTop: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", gap: 9 }}>
          <UserButton />
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.firstName ?? "User"}</div>
              <div style={{ fontSize: 11, color: C.textMute, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email ?? "Pro plan"}</div>
            </div>
          )}
          {!collapsed && <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />}
        </div>
      </motion.aside>

      {/* ── MAIN ────────────────────────────────────────────────── */}
      <div style={{ marginLeft: sW, flex: 1, minHeight: "100vh", transition: "margin-left 0.26s cubic-bezier(0.25,0.46,0.45,0.94)" }}>
        <header style={{ position: "sticky", top: 0, zIndex: 40, height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", background: `${C.sidebar}EE`, backdropFilter: "blur(18px)", borderBottom: `0.5px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "-0.01em", fontFamily: C.head }}>{topbarTitle}</div>
            <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>Last updated: just now</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 8, background: C.input, border: `0.5px solid ${C.border}`, minWidth: 200 }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={C.textMute} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Search…" style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: "0.78rem", fontFamily: C.sans, width: "100%" }} />
            </div>
            <button style={{ background: C.input, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: "7px", cursor: "pointer", color: C.textMute, position: "relative", display: "flex" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
              <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: C.red }} />
            </button>
            <Btn primary onClick={() => setActiveView("agent")}>+ Ask AI</Btn>
            <span style={{ fontSize: 12, color: C.textSub }}>{user.firstName ?? ""}</span>
            <UserButton />
          </div>
        </header>

        <div style={{ padding: "20px 22px 60px" }}>
          <AnimatePresence mode="wait">
            {activeView === "agent" && (
              <motion.div key="agent" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <AgentView />
              </motion.div>
            )}
            {activeView === "pipelines" && (
              <motion.div key="pipelines" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <PipelineView />
              </motion.div>
            )}
            {activeView !== "agent" && activeView !== "pipelines" && (
              <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <OverviewContent user={user} setActiveView={setActiveView} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        @keyframes pls { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>
    </div>
  );
}