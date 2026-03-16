// app/dashboard/DashboardClient.tsx
"use client";

import { useRef, useMemo, useState, useEffect } from "react";
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

/* ─────────────────────────── STATIC DATA ──────────────────────────────── */
const NAV_GROUPS = [
  {
    section: "WORKSPACE",
    items: [
      { id: "overview",  label: "Overview",     badge: null  },
      { id: "agent",     label: "AI Analyst",   badge: "NEW" },
      { id: "pipelines", label: "Pipelines",    badge: "3"   },
      { id: "datasets",  label: "Datasets",     badge: "12"  },
      { id: "models",    label: "Models",       badge: null  },
    ],
  },
  {
    section: "INTELLIGENCE",
    items: [
      { id: "explainability", label: "Explainability", badge: null },
      { id: "reports",        label: "Reports",        badge: null },
    ],
  },
  {
    section: "DEPLOY",
    items: [
      { id: "endpoints",  label: "API Endpoints", badge: null },
      { id: "monitoring", label: "Monitoring",    badge: null },
    ],
  },
];

const PIPELINES_DEMO = [
  { id: "PL-2847", name: "Customer Churn Analysis",   status: "completed" as const, model: "XGBoost",       score: "94.2%", time: "12m ago" },
  { id: "PL-2846", name: "Revenue Forecasting Q1",    status: "running"   as const, model: "LSTM",          score: "—",     time: "34m ago" },
  { id: "PL-2845", name: "Fraud Detection v3",        status: "completed" as const, model: "Random Forest", score: "97.8%", time: "2h ago"  },
  { id: "PL-2844", name: "Sentiment Classification",  status: "failed"    as const, model: "DistilBERT",   score: "—",     time: "5h ago"  },
  { id: "PL-2843", name: "Supply Chain Optimization", status: "completed" as const, model: "LightGBM",     score: "89.1%", time: "1d ago"  },
];

const DATASETS_DEMO = [
  { name: "customer_churn.csv",   rows: "45,231",    cols: 23, size: "12.4 MB", date: "Today"     },
  { name: "sales_2024.csv",       rows: "128,400",   cols: 31, size: "34.7 MB", date: "Yesterday" },
  { name: "transactions.parquet", rows: "1,240,000", cols: 18, size: "156 MB",  date: "2 days ago"},
  { name: "reviews.json",         rows: "8,920",     cols:  6, size: "4.2 MB",  date: "3 days ago"},
];

const ACTIVITY_DEMO = [
  { type: "success", text: "Pipeline PL-2847 completed — 94.2% accuracy",         time: "12m ago" },
  { type: "deploy",  text: "XGBoost model deployed to endpoint /v2/churn",         time: "28m ago" },
  { type: "upload",  text: "customer_churn.csv uploaded (45,231 rows)",            time: "1h ago"  },
  { type: "warning", text: "Data drift detected on Revenue Forecast model",         time: "3h ago"  },
  { type: "success", text: "Pipeline PL-2845 completed — 97.8% accuracy",         time: "5h ago"  },
  { type: "report",  text: "Q4 Comprehensive Analysis report generated",           time: "1d ago"  },
];

const MODEL_PERF = [
  { name: "Random Forest — Fraud Detection", score: 97.8, color: C.green  },
  { name: "XGBoost — Churn Prediction",      score: 94.2, color: C.text   },
  { name: "LightGBM — Supply Chain",         score: 89.1, color: C.purple },
  { name: "LSTM — Revenue Forecast",         score: 86.4, color: C.amber  },
];

const STATUS_MAP = {
  completed: { label: "Done",    color: C.green, bg: C.greenBg, border: C.greenBorder },
  running:   { label: "Running", color: C.text,  bg: C.whiteDim, border: C.borderMd  },
  failed:    { label: "Error",   color: C.red,   bg: C.redBg,   border: C.redBorder  },
} as const;

const ACT_DOT: Record<string, string> = {
  success: C.green, deploy: C.purple, upload: C.textSub, warning: C.amber, report: C.pink,
};

const SPARKLINE = [80, 72, 60, 50, 42, 35, 28, 22];

/* ─────────────────────────── SMALL HELPERS ────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
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

function Sparkline() {
  const pts = SPARKLINE;
  const W = 300, H = 96, pL = 26, pR = 8, pT = 8, pB = 14;
  const xs = pts.map((_, i) => pL + i * ((W - pL - pR) / (pts.length - 1)));
  const toY = (v: number) => pT + ((100 - v) / 100) * (H - pT - pB);
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const area = `${line} L${xs[pts.length - 1]},${H - pB} L${xs[0]},${H - pB}Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 96 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.text} stopOpacity={0.1} />
          <stop offset="100%" stopColor={C.text} stopOpacity={0} />
        </linearGradient>
      </defs>
      {[20, 50, 80].map(v => <line key={v} x1={pL} y1={toY(v)} x2={W - pR} y2={toY(v)} stroke={C.border} strokeWidth={0.5} />)}
      {[20, 50, 80].map(v => <text key={v} x={pL - 4} y={toY(v) + 4} fontSize={8} fill={C.textMute} textAnchor="end" fontFamily={C.mono}>{v}%</text>)}
      <path d={area} fill="url(#sg)" />
      <path d={line} fill="none" stroke={C.text} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((v, i) => <circle key={i} cx={xs[i]} cy={toY(v)} r={i === pts.length - 1 ? 3 : 1.5} fill={C.text} opacity={i === pts.length - 1 ? 1 : 0.3} />)}
      <text x={xs[pts.length - 1] + 5} y={toY(pts[pts.length - 1]) - 3} fontSize={9} fill={C.text} fontFamily={C.mono} fontWeight={600}>91.3%</text>
    </svg>
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
    overview:       <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
    pipelines:      <svg {...p}><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>,
    datasets:       <svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>,
    models:         <svg {...p}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
    agent:          <svg {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    explainability: <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    reports:        <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    endpoints:      <svg {...p}><rect x="2" y="7" width="12" height="7" rx="1"/><path d="M5 7V5a3 3 0 016 0v2"/></svg>,
    monitoring:     <svg {...p}><circle cx="12" cy="12" r="5"/><path d="M12 7v5l2 2"/></svg>,
    settings:       <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  };
  return <>{icons[id] ?? null}</>;
}

const card: React.CSSProperties       = { background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden" };
const cardHdr: React.CSSProperties   = { padding: "14px 18px", borderBottom: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" };
const TH: React.CSSProperties        = { fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: C.textMute, fontFamily: C.mono };

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

function PipelineDemoRow({ row }: { row: typeof PIPELINES_DEMO[number] }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "grid", gridTemplateColumns: "72px 1fr 88px 104px 72px 60px", padding: "10px 18px", gap: 10, alignItems: "center", borderBottom: `0.5px solid ${C.border}`, background: hov ? C.cardHover : "transparent", cursor: "pointer", transition: "background 0.12s" }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMute }}>{row.id}</span>
      <div><span style={{ fontSize: 12, color: C.textSub, fontWeight: 500 }}>{row.name}</span>{row.status === "running" && <RunningBar />}</div>
      <div><Pill status={row.status} /></div>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMute }}>{row.model}</span>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: row.score === "—" ? C.textMute : C.green, fontWeight: 600 }}>{row.score}</span>
      <span style={{ fontSize: 10, color: C.textMute }}>{row.time}</span>
    </div>
  );
}

function ActivityRow({ item, last }: { item: typeof ACTIVITY_DEMO[number]; last: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", gap: 10, padding: "10px 16px", borderBottom: last ? "none" : `0.5px solid ${C.border}`, background: hov ? C.cardHover : "transparent", transition: "background 0.12s" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: ACT_DOT[item.type] ?? C.textMute, marginTop: 4, flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: 11, color: C.textSub, lineHeight: 1.55 }}>{item.text}</p>
        <p style={{ fontSize: 10, color: C.textMute, marginTop: 2, fontFamily: C.mono }}>{item.time}</p>
      </div>
    </div>
  );
}

function DatasetDemoRow({ ds, last }: { ds: typeof DATASETS_DEMO[number]; last: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "grid", gridTemplateColumns: "1fr 92px 52px 82px 76px", padding: "10px 18px", gap: 10, alignItems: "center", borderBottom: last ? "none" : `0.5px solid ${C.border}`, background: hov ? C.cardHover : "transparent", cursor: "pointer", transition: "background 0.12s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 24, height: 24, borderRadius: 5, background: C.pill, border: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth={1.5} strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
        </div>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textSub }}>{ds.name}</span>
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMute }}>{ds.rows}</span>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMute }}>{ds.cols}</span>
      <span style={{ fontSize: 10, color: C.textMute }}>{ds.size}</span>
      <span style={{ fontSize: 10, color: C.textMute }}>{ds.date}</span>
    </div>
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
    } catch {}
  };

  useEffect(() => { fetchChats(); }, []);

  return (
    <div style={{ height: "calc(100vh - 120px)", display: "grid", gridTemplateColumns: chatSidebarCollapsed ? "42px 1fr" : "280px 1fr", gap: 20, transition: "grid-template-columns 0.25s ease" }}>
      {/* Sidebar */}
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
      {/* Chat area */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <AgentChat chatId={selectedChatId} onChatCreated={(id) => { setSelectedChatId(id); fetchChats(); }} />
      </div>
    </div>
  );
}

/* ─────────────────────────── PIPELINE VIEW ────────────────────────────── */
function PipelineListCard({ pipeline, onRefresh }: { pipeline: any; onRefresh: () => void }) {
  const [hov, setHov] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusColor: Record<string, string> = { draft: C.textMute, running: C.amber, completed: C.green, failed: C.red };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this pipeline?")) return;
    setDeleting(true);
    await fetch(`/api/pipelines/${pipeline.id}`, { method: "DELETE" });
    onRefresh();
  };

  const steps = Array.isArray(pipeline.steps) ? pipeline.steps : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: "16px 18px", background: hov ? C.cardHover : C.card, border: `1px solid ${hov ? C.borderMd : C.border}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "all 0.13s" }}>
      {/* Icon */}
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.cyan}15`, border: `1px solid ${C.cyan}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>⚡</div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: C.head, fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>{pipeline.name}</div>
        <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>{steps.length} steps · {pipeline._count?.runs ?? 0} runs · {new Date(pipeline.updatedAt).toLocaleDateString()}</div>
      </div>
      {/* Category pills */}
      <div style={{ display: "flex", gap: 4 }}>
        {["cleaning", "eda", "visualization", "modeling"].map((cat) => {
          const count = steps.filter((s: any) => s.category === cat).length;
          if (!count) return null;
          return (
            <span key={cat} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${CATEGORY_COLOR[cat]}18`, color: CATEGORY_COLOR[cat], fontFamily: C.mono, fontWeight: 600 }}>
              {CATEGORY_ICON[cat]} {count}
            </span>
          );
        })}
      </div>
      {/* Status */}
      <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: `${statusColor[pipeline.status] || C.textMute}18`, color: statusColor[pipeline.status] || C.textMute, fontFamily: C.mono, fontWeight: 600, border: `1px solid ${statusColor[pipeline.status] || C.textMute}33` }}>
        {pipeline.status}
      </span>
      {/* Delete */}
      <button onClick={handleDelete} disabled={deleting} style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", padding: "4px", borderRadius: 4, fontSize: 13, opacity: deleting ? 0.3 : 1, transition: "color 0.15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = C.red)} onMouseLeave={(e) => (e.currentTarget.style.color = C.textMute)}>
        🗑
      </button>
    </motion.div>
  );
}

function PipelineView() {
  const [savedPipelines, setSavedPipelines] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [view, setView] = useState<"list" | "create">("list");

  const fetchPipelines = async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/pipelines");
      if (res.ok) { const d = await res.json(); setSavedPipelines(d.pipelines || []); }
    } finally { setLoadingList(false); }
  };

  useEffect(() => { fetchPipelines(); }, []);

  if (view === "create") {
    return (
      <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexShrink: 0 }}>
          <button onClick={() => { setView("list"); fetchPipelines(); }}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", color: C.textSub, fontSize: 11, cursor: "pointer", fontFamily: C.sans, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.text; (e.currentTarget as HTMLElement).style.borderColor = C.borderMd; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textSub; (e.currentTarget as HTMLElement).style.borderColor = C.border; }}>
            ← Pipelines
          </button>
          <h2 style={{ fontFamily: C.head, fontSize: "1rem", fontWeight: 700, color: C.text, margin: 0 }}>Pipeline Builder</h2>
          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: `${C.cyan}15`, color: C.cyan, border: `1px solid ${C.cyan}30`, fontFamily: C.mono }}>AI-Assisted</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PipelineBuilder onSaved={() => fetchPipelines()} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: C.head, fontSize: "1.15rem", fontWeight: 700, color: C.text, marginBottom: 5, letterSpacing: "-0.02em" }}>Pipelines</h2>
          <p style={{ fontSize: 12, color: C.textSub, margin: 0, lineHeight: 1.6 }}>Build, save and re-run automated data science workflows.</p>
        </div>
        <button onClick={() => setView("create")}
          style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: `linear-gradient(135deg, ${C.cyan}, #0099CC)`, color: "#030712", fontSize: 12, fontWeight: 700, fontFamily: C.head, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, boxShadow: `0 4px 20px ${C.cyan}30` }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Pipeline
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Pipelines",  value: savedPipelines.length,                                                  color: C.cyan   },
          { label: "Completed",        value: savedPipelines.filter(p => p.status === "completed").length,            color: C.green  },
          { label: "Draft",            value: savedPipelines.filter(p => p.status === "draft").length,                color: C.textSub},
          { label: "Total Steps",      value: savedPipelines.reduce((acc,p) => acc + (Array.isArray(p.steps) ? p.steps.length : 0), 0), color: C.purple },
        ].map((s, i) => (
          <div key={i} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: C.mono }}>{s.label}</div>
            <div style={{ fontFamily: C.head, fontSize: "1.5rem", fontWeight: 700, color: s.color, letterSpacing: "-0.03em" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* List */}
      {loadingList ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 72, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, opacity: 0.4 + i * 0.1 }} />
          ))}
        </div>
      ) : savedPipelines.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: "center", padding: "80px 20px", background: C.card, borderRadius: 16, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚡</div>
          <div style={{ fontFamily: C.head, fontSize: "1.05rem", fontWeight: 600, color: C.text, marginBottom: 8 }}>No pipelines yet</div>
          <p style={{ fontSize: 12, color: C.textSub, marginBottom: 24, maxWidth: 320, margin: "0 auto 24px" }}>
            Create your first pipeline. Upload a CSV, let the AI suggest steps, then run them automatically.
          </p>
          <button onClick={() => setView("create")}
            style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: `linear-gradient(135deg, ${C.cyan}, #0099CC)`, color: "#030712", fontSize: 12, fontWeight: 700, fontFamily: C.head, cursor: "pointer" }}>
            Build First Pipeline
          </button>
        </motion.div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AnimatePresence>
            {savedPipelines.map(p => <PipelineListCard key={p.id} pipeline={p} onRefresh={fetchPipelines} />)}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── OVERVIEW ─────────────────────────────────── */
function OverviewContent({ user, setActiveView }: { user: { firstName: string | null }; setActiveView: (v: string) => void }) {
  const mRef = useRef<HTMLDivElement>(null);
  const inView = useInView(mRef, { once: true });
  const datasets  = useCountUp(24,    1500, inView);
  const pipelines = useCountUp(7,     1500, inView);
  const models    = useCountUp(156,   2000, inView);
  const apiCalls  = useCountUp(12847, 2400, inView);

  return (
    <>
      {/* HERO */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18 }}
        style={{ ...card, height: 184, marginBottom: 18, display: "flex", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}><BannerScene /></div>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${C.card} 0%, ${C.card}CC 42%, transparent 100%)` }} />
        <div style={{ position: "relative", zIndex: 2, padding: "26px 28px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <p style={{ fontFamily: C.head, fontSize: "1.4rem", fontWeight: 700, color: C.text, marginBottom: 6, letterSpacing: "-0.025em" }}>
            {getGreeting()}, {user.firstName ?? "there"}
          </p>
          <p style={{ fontSize: "0.82rem", color: C.textSub, lineHeight: 1.65, maxWidth: 380 }}>
            You have <span style={{ color: C.text, fontWeight: 600 }}>3 pipelines</span> running and{" "}
            <span style={{ color: C.green, fontWeight: 600 }}>2 new reports</span> ready for review.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn primary onClick={() => setActiveView("agent")}>Ask AI Analyst</Btn>
            <Btn onClick={() => setActiveView("pipelines")}>Build Pipeline</Btn>
          </div>
        </div>
      </motion.div>

      {/* METRICS */}
      <motion.div ref={mRef} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.26 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Datasets",      value: datasets,  suffix: "",       pct: 65 },
          { label: "Pipelines",     value: pipelines, suffix: " active",pct: 48 },
          { label: "Models Trained",value: models,    suffix: "",       pct: 78 },
          { label: "API Requests",  value: apiCalls,  suffix: "",       pct: 54 },
        ].map((m, i) => (
          <motion.div key={i} whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 500 }} style={{ ...card, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>{m.label}</div>
            <div style={{ fontFamily: C.head, fontSize: "1.65rem", fontWeight: 700, color: C.text, letterSpacing: "-0.03em", marginBottom: 10 }}>{m.value.toLocaleString()}{m.suffix}</div>
            <Bar pct={m.pct} color={C.textSub} delay={i * 110} />
          </motion.div>
        ))}
      </motion.div>

      {/* QUICK ACTIONS */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.34 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Ask AI Analyst",  onClick: () => setActiveView("agent"),     icon: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
          { label: "Build Pipeline",  onClick: () => setActiveView("pipelines"), icon: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg> },
          { label: "Upload Data",     onClick: () => setActiveView("agent"),     icon: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
          { label: "Deploy Model",    onClick: undefined,                        icon: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg> },
        ].map((a, i) => <ActionCard key={i} label={a.label} icon={a.icon} onClick={a.onClick} />)}
      </motion.div>

      {/* PIPELINES + ACTIVITY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12, marginBottom: 14 }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.42 }} style={card}>
          <div style={cardHdr}>
            <div>
              <div style={{ fontFamily: C.head, fontSize: "0.86rem", fontWeight: 600, color: C.text }}>Recent Pipelines</div>
              <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>Last 5 executions</div>
            </div>
            <Btn onClick={() => setActiveView("pipelines")}>View all</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "72px 1fr 88px 104px 72px 60px", padding: "8px 18px", gap: 10, borderBottom: `0.5px solid ${C.border}` }}>
            {["ID", "Pipeline", "Status", "Model", "Score", "Time"].map(h => <span key={h} style={TH}>{h}</span>)}
          </div>
          {PIPELINES_DEMO.map(r => <PipelineDemoRow key={r.id} row={r} />)}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.5 }} style={card}>
          <div style={cardHdr}>
            <div>
              <div style={{ fontFamily: C.head, fontSize: "0.86rem", fontWeight: 600, color: C.text }}>Activity</div>
              <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>Recent events</div>
            </div>
          </div>
          {ACTIVITY_DEMO.map((a, i) => <ActivityRow key={i} item={a} last={i === ACTIVITY_DEMO.length - 1} />)}
        </motion.div>
      </div>

      {/* MODEL PERF + DATASETS */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12, marginBottom: 14 }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.56 }} style={card}>
          <div style={cardHdr}>
            <div>
              <div style={{ fontFamily: C.head, fontSize: "0.86rem", fontWeight: 600, color: C.text }}>Model Accuracy</div>
              <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>Top performers</div>
            </div>
          </div>
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
            {MODEL_PERF.map((m, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: C.textSub, fontWeight: 500 }}>{m.name}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: m.color, fontWeight: 600 }}>{m.score}%</span>
                </div>
                <Bar pct={m.score} color={m.color} delay={700 + i * 100} />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.6 }} style={card}>
          <div style={cardHdr}>
            <div>
              <div style={{ fontFamily: C.head, fontSize: "0.86rem", fontWeight: 600, color: C.text }}>Datasets</div>
              <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>Uploaded sources</div>
            </div>
            <Btn primary onClick={() => setActiveView("agent")}>+ Upload</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 92px 52px 82px 76px", padding: "8px 18px", gap: 10, borderBottom: `0.5px solid ${C.border}` }}>
            {["File", "Rows", "Cols", "Size", "Added"].map(h => <span key={h} style={TH}>{h}</span>)}
          </div>
          {DATASETS_DEMO.map((ds, i) => <DatasetDemoRow key={i} ds={ds} last={i === DATASETS_DEMO.length - 1} />)}
        </motion.div>
      </div>

      {/* SPARKLINE + STATUS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.65 }} style={{ ...card, gridColumn: "span 2" }}>
          <div style={cardHdr}>
            <div>
              <div style={{ fontFamily: C.head, fontSize: "0.86rem", fontWeight: 600, color: C.text }}>Accuracy over runs</div>
              <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>Churn classifier</div>
            </div>
          </div>
          <div style={{ padding: "12px 16px" }}>
            <Sparkline />
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              {[{ l: "Run 1", v: "72.1%" }, { l: "Run 4", v: "83.4%" }, { l: "Latest", v: "91.3%", hi: true }].map(r => (
                <span key={r.l} style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>
                  {r.l} <span style={{ color: r.hi ? C.text : C.textSub, fontWeight: r.hi ? 600 : 400 }}>{r.v}</span>
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {[
          { label: "GPU Utilization", value: "73%", pct: 73, color: C.green, sub: "NVIDIA A100 · 40GB VRAM" },
          { label: "Memory Usage",    value: "58%", pct: 58, color: C.amber, sub: "18.6 GB / 32 GB"        },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.7 + i * 0.05 }} style={{ ...card, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</span>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: s.color, fontWeight: 600 }}>{s.value}</span>
            </div>
            <Bar pct={s.pct} color={s.color} delay={900 + i * 80} h={4} />
            <p style={{ fontSize: 10, color: C.textMute, marginTop: 8 }}>{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* UPTIME */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, delay: 0.76 }} style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.textMute, textTransform: "uppercase", letterSpacing: "0.07em" }}>System Uptime</span>
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.green, fontWeight: 600 }}>99.97%</span>
        </div>
        <Bar pct={99.97} color={C.green} delay={950} h={4} />
        <p style={{ fontSize: 10, color: C.textMute, marginTop: 8 }}>Last incident: 14 days ago</p>
      </motion.div>
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

        {/* Logo row */}
        <div style={{ padding: collapsed ? "18px 0" : "16px 16px", borderBottom: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", minHeight: 54 }}>
          {!collapsed && <Link href="/" style={{ fontFamily: C.head, fontSize: "1rem", fontWeight: 700, color: C.text, textDecoration: "none", letterSpacing: "-0.02em" }}>DSAgent</Link>}
          {!collapsed && <span style={{ fontSize: 10, color: C.textMute, background: C.pill, padding: "2px 7px", borderRadius: 4, border: `0.5px solid ${C.border}`, fontFamily: C.mono }}>beta</span>}
          <button onClick={() => setCollapsed(c => !c)} style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", padding: 5, borderRadius: 5, display: "flex", marginLeft: collapsed ? 0 : 2 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
        </div>

        {/* Nav */}
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
              <div style={{ fontSize: 11, color: C.textMute }}>Pro plan</div>
            </div>
          )}
          {!collapsed && <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />}
        </div>
      </motion.aside>

      {/* ── MAIN ────────────────────────────────────────────────── */}
      <div style={{ marginLeft: sW, flex: 1, minHeight: "100vh", transition: "margin-left 0.26s cubic-bezier(0.25,0.46,0.45,0.94)" }}>

        {/* TOPBAR */}
        <header style={{ position: "sticky", top: 0, zIndex: 40, height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", background: `${C.sidebar}EE`, backdropFilter: "blur(18px)", borderBottom: `0.5px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "-0.01em", fontFamily: C.head }}>{topbarTitle}</div>
            <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>Last updated: just now</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 8, background: C.input, border: `0.5px solid ${C.border}`, minWidth: 200 }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={C.textMute} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input placeholder="Search…" style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: "0.78rem", fontFamily: C.sans, width: "100%" }} />
            </div>
            <button style={{ background: C.input, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: "7px", cursor: "pointer", color: C.textMute, position: "relative", display: "flex" }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: C.red }} />
            </button>
            <Btn>Export report</Btn>
            <Btn primary onClick={() => setActiveView("agent")}>+ Ask AI</Btn>
            <span style={{ fontSize: 12, color: C.textSub }}>{user.firstName ?? ""}</span>
            <UserButton />
          </div>
        </header>

        {/* CONTENT */}
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

      <style>{`@keyframes pls { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
    </div>
  );
}