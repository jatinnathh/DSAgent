// /app/page.tsx
"use client";

import Link from "next/link";
import React, { useRef, useState, useEffect, useMemo, Suspense } from "react";
import { motion, useScroll, useTransform, useInView, MotionValue } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Stars } from "@react-three/drei";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
   3D SCENE — FLOATING PARTICLES
   ═══════════════════════════════════════════════════════════════ */
function SceneParticles({ count = 200 }) {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 18;
      p[i * 3 + 1] = (Math.random() - 0.5) * 18;
      p[i * 3 + 2] = (Math.random() - 0.5) * 18;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [count]);

  useFrame((s) => {
    ref.current.rotation.y = s.clock.elapsedTime * 0.012;
    ref.current.rotation.x = s.clock.elapsedTime * 0.007;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.03}
        color="#ffffff"
        transparent
        opacity={0.22}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/* ═══════════════════════════════════════════════════════════════
   3D SCENE — FLOATING FRAGMENT (for dissolve effect)
   ═══════════════════════════════════════════════════════════════ */
function FloatingFragment({
  pos, rot, scale, speed, offset, type,
}: {
  pos: [number, number, number]; rot: [number, number, number];
  scale: number; speed: number; offset: number; type: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    ref.current.position.y = pos[1] + Math.sin(t * speed + offset) * 0.28;
    ref.current.rotation.x = t * speed * 0.35;
    ref.current.rotation.z = t * speed * 0.25;
  });
  return (
    <mesh ref={ref} position={pos} rotation={rot} scale={scale}>
      {type === 0 ? <octahedronGeometry args={[1, 0]} /> : type === 1 ? <boxGeometry args={[1, 1, 1]} /> : <tetrahedronGeometry args={[1, 0]} />}
      <meshStandardMaterial color="#0c0c1d" metalness={0.88} roughness={0.12} emissive="#223366" emissiveIntensity={0.2} />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════════
   3D SCENE — DATA AGENT ROBOT
   ═══════════════════════════════════════════════════════════════ */
function DataRobot({
  scrollRef,
  mouseRef,
  pipelineScroll,
}: {
  scrollRef: React.MutableRefObject<number>;
  mouseRef: React.MutableRefObject<{ x: number; y: number }>;
  pipelineScroll: any;
}) {
  const group = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const orbitals = useRef<THREE.Group>(null!);
  const core = useRef<THREE.Mesh>(null!);

  const fragments = useMemo(
    () =>
      Array.from({ length: 22 }, () => ({
        pos: [(Math.random() - 0.5) * 2.4, -(Math.random() * 2.8 + 0.6), (Math.random() - 0.5) * 2.4] as [number, number, number],
        rot: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI] as [number, number, number],
        scale: 0.04 + Math.random() * 0.11,
        speed: 0.3 + Math.random() * 1.1,
        offset: Math.random() * Math.PI * 2,
        type: Math.floor(Math.random() * 3),
      })),
    [],
  );

  const baseY = -1.9;

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const scroll = scrollRef.current;
    const mouse = mouseRef.current;

    // pipeline scroll (0 → 1)
    const p = pipelineScroll.get();

    // smooth motion and speed boost
    const eased = p * p * (3 - 2 * p); // smoothstep

    // START (top-left) → END (bottom-right)
    const xTarget = THREE.MathUtils.lerp(-4, 4, eased);
    const yTarget = THREE.MathUtils.lerp(0, -2, eased);

    // smooth movement
    group.current.position.x = THREE.MathUtils.lerp(
      group.current.position.x,
      xTarget,
      0.06
    );

    group.current.position.y = THREE.MathUtils.lerp(
      group.current.position.y,
      yTarget,
      0.06
    );

    // tilt while moving
    group.current.rotation.z = (p - 0.5) * 0.2;

    // scroll rotation
    const targetY = scroll * Math.PI * 3.5;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.045);

    // float
    const float = Math.sin(t * 0.3) * 0.05 * p;
    group.current.position.y += float;

    // head tracks mouse
    head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, mouse.x * 0.45, 0.04);
    head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -mouse.y * 0.2, 0.04);

    // orbital spin
    orbitals.current.rotation.y = t * 0.35;
    orbitals.current.rotation.z = Math.sin(t * 0.15) * 0.12;

    // core pulse
    const cMat = core.current.material as THREE.MeshStandardMaterial;
    cMat.emissiveIntensity = 1.8 + Math.sin(t * 2.5) * 0.7;
    core.current.rotation.y = t * 0.8;
    core.current.rotation.z = t * 0.5;
  });

  /* shared material props */
  const D = { color: "#140a2a", metalness: 0.95, roughness: 0.05 };
  const M = { color: "#2a145a", metalness: 0.9, roughness: 0.1 };
  const A = { color: "#4c1d95", metalness: 0.85, roughness: 0.15 };

  return (
    <group ref={group} position={[-2.4, -1.9, 0]} scale={0.82}>
      {/* ──── HEAD ──── */}
      <group ref={head} position={[0, 2.2, 0]}>
        <mesh><boxGeometry args={[0.72, 0.62, 0.68]} /><meshStandardMaterial {...D} /></mesh>
        {/* visor */}
        <mesh position={[0, 0.02, 0.345]}>
          <boxGeometry args={[0.54, 0.1, 0.02]} />
          <meshStandardMaterial emissive="#ffffff" emissiveIntensity={3} color="#111" />
        </mesh>
        {/* ear plates */}
        <mesh position={[-0.4, 0.05, 0]}><boxGeometry args={[0.06, 0.24, 0.2]} /><meshStandardMaterial {...M} /></mesh>
        <mesh position={[0.4, 0.05, 0]}><boxGeometry args={[0.06, 0.24, 0.2]} /><meshStandardMaterial {...M} /></mesh>
        {/* antenna */}
        <mesh position={[0.2, 0.48, 0]}><cylinderGeometry args={[0.012, 0.012, 0.38, 6]} /><meshStandardMaterial {...A} /></mesh>
        <mesh position={[0.2, 0.7, 0]}><sphereGeometry args={[0.03, 10, 10]} /><meshStandardMaterial emissive="#ffffff" emissiveIntensity={4} color="#444" /></mesh>
        <pointLight position={[0, 0, 0.6]} color="#aaccff" intensity={0.45} distance={2.5} />
      </group>

      {/* ──── NECK ──── */}
      <mesh position={[0, 1.82, 0]}><cylinderGeometry args={[0.08, 0.12, 0.15, 8]} /><meshStandardMaterial {...M} /></mesh>

      {/* ──── TORSO ──── */}
      <group position={[0, 1.1, 0]}>
        <mesh><boxGeometry args={[1.0, 1.2, 0.58]} /><meshStandardMaterial {...D} /></mesh>
        <mesh position={[0, 0.08, 0.3]}><boxGeometry args={[0.6, 0.7, 0.02]} /><meshStandardMaterial {...A} /></mesh>
        {/* core */}
        <mesh ref={core} position={[0, 0.12, 0.34]}>
          <icosahedronGeometry args={[0.09, 0]} />
          <meshStandardMaterial emissive="#4488ff" emissiveIntensity={2.5} color="#cc15e4ff" transparent opacity={0.9} />
        </mesh>
        <pointLight position={[0, 0.12, 0.6]} color="#3b82f6" intensity={2} distance={3.5} />
        {/* shoulders */}
        <mesh position={[-0.6, 0.38, 0]}><boxGeometry args={[0.22, 0.28, 0.36]} /><meshStandardMaterial {...M} /></mesh>
        <mesh position={[0.6, 0.38, 0]}><boxGeometry args={[0.22, 0.28, 0.36]} /><meshStandardMaterial {...M} /></mesh>
        {/* belt */}
        <mesh position={[0, -0.66, 0]}><boxGeometry args={[0.88, 0.12, 0.5]} /><meshStandardMaterial {...A} /></mesh>
      </group>

      {/* ──── ARMS ──── */}
      {[-1, 1].map((side) => (
        <group key={side} position={[0.76 * side, 1.35, 0]}>
          <mesh><sphereGeometry args={[0.1, 10, 10]} /><meshStandardMaterial {...A} /></mesh>
          <mesh position={[0, -0.32, 0]}><boxGeometry args={[0.17, 0.44, 0.17]} /><meshStandardMaterial {...D} /></mesh>
          <mesh position={[0, -0.58, 0]}><sphereGeometry args={[0.065, 8, 8]} /><meshStandardMaterial {...A} /></mesh>
          <mesh position={[0, -0.85, 0]}><boxGeometry args={[0.14, 0.36, 0.14]} /><meshStandardMaterial {...M} /></mesh>
          <mesh position={[0, -1.08, 0]}><boxGeometry args={[0.12, 0.08, 0.08]} /><meshStandardMaterial {...D} /></mesh>
        </group>
      ))}

      {/* ──── ORBITAL RINGS ──── */}
      <group ref={orbitals} position={[0, 1.1, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.1, 0.007, 8, 80]} />
          <meshStandardMaterial emissive="#ffffff" emissiveIntensity={1.2} color="#333" transparent opacity={0.32} />
        </mesh>
        <mesh rotation={[1.2, 0.4, 0.3]}>
          <torusGeometry args={[1.35, 0.005, 8, 80]} />
          <meshStandardMaterial emissive="#ffffff" emissiveIntensity={0.8} color="#222" transparent opacity={0.18} />
        </mesh>
        {[0, 1.26, 2.51, 3.77, 5.03].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1]}>
            <sphereGeometry args={[0.018, 8, 8]} />
            <meshStandardMaterial emissive="#ffffff" emissiveIntensity={2.5} color="#555" />
          </mesh>
        ))}
      </group>

      {/* ──── DISSOLVING FRAGMENTS ──── */}
      {fragments.map((f, i) => (
        <FloatingFragment key={i} {...f} />
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   3D SCENE — COMBINED HERO SCENE
   ═══════════════════════════════════════════════════════════════ */
function HeroScene({
  scrollRef,
  mouseRef,
  pipelineScroll,
}: {
  scrollRef: React.MutableRefObject<number>;
  mouseRef: React.MutableRefObject<{ x: number; y: number }>;
  pipelineScroll: MotionValue<number>;
}) {
  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[5, 5, 5]} intensity={0.35} color="#aabbff" />
      <directionalLight position={[-4, 3, -4]} intensity={0.18} color="#ffaacc" />
      <pointLight position={[0, 4, 5]} intensity={0.25} color="#ffffff" distance={12} />
      <fog attach="fog" args={["#080808", 6, 22]} />
      <Stars radius={80} depth={60} count={1800} factor={3} saturation={0} fade speed={0.4} />
      <SceneParticles />
      <DataRobot scrollRef={scrollRef} mouseRef={mouseRef} pipelineScroll={pipelineScroll} />
      <Environment preset="night" />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UI — CUSTOM CURSOR
   ═══════════════════════════════════════════════════════════════ */
function Cursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [hov, setHov] = useState(false);
  useEffect(() => {
    const move = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    const over = (e: MouseEvent) => { const t = e.target as HTMLElement; setHov(!!(t.closest("a,button,[data-hover]"))); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseover", over);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseover", over); };
  }, []);
  return (
    <>
      <motion.div style={{ position: "fixed", zIndex: 9999, pointerEvents: "none", top: 0, left: 0 }} animate={{ x: pos.x - (hov ? 20 : 8), y: pos.y - (hov ? 20 : 8) }} transition={{ type: "spring", stiffness: 800, damping: 40, mass: 0.3 }}>
        <div style={{ width: hov ? 40 : 16, height: hov ? 40 : 16, borderRadius: "50%", border: `1.5px solid ${hov ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)"}`, background: hov ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)", transition: "width 0.2s,height 0.2s,background 0.2s,border-color 0.2s" }} />
      </motion.div>
      <motion.div style={{ position: "fixed", zIndex: 9998, pointerEvents: "none", top: 0, left: 0 }} animate={{ x: pos.x - 2, y: pos.y - 2 }} transition={{ type: "spring", stiffness: 2000, damping: 60 }}>
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "white" }} />
      </motion.div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UI — GRAIN OVERLAY
   ═══════════════════════════════════════════════════════════════ */
function Grain() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9990, pointerEvents: "none", opacity: 0.028, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundRepeat: "repeat", backgroundSize: "128px 128px" }} />
  );
}

/* ═══════════════════════════════════════════════════════════════
   UI — GLASS CARD
   ═══════════════════════════════════════════════════════════════ */
function Glass({ children, style, onMouseEnter, onMouseLeave, ...rest }: { children: React.ReactNode; style?: React.CSSProperties; onMouseEnter?: React.MouseEventHandler; onMouseLeave?: React.MouseEventHandler;[k: string]: any }) {
  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...rest} style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, transition: "border-color 0.3s, background 0.3s", ...style }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UI — MARQUEE
   ═══════════════════════════════════════════════════════════════ */
const MARQUEE_ITEMS = ["Data Cleaning", "EDA", "Feature Engineering", "AutoML", "XGBoost", "LightGBM", "Random Forest", "Correlation Analysis", "Outlier Detection", "Model Evaluation", "Predictions", "Visualizations"];

function Marquee() {
  return (
    <div style={{ overflow: "hidden", padding: "15px 0", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <motion.div style={{ display: "flex", gap: 48, whiteSpace: "nowrap" }} animate={{ x: [0, -2200] }} transition={{ duration: 32, repeat: Infinity, ease: "linear" }}>
        {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
          <span key={i} style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", fontFamily: "var(--mono)", display: "inline-flex", alignItems: "center", gap: 48 }}>
            {item}<span style={{ color: "rgba(255,255,255,0.1)" }}>×</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UI — COUNTER
   ═══════════════════════════════════════════════════════════════ */
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let s = 0;
    const step = target / 60;
    const tick = () => { s = Math.min(s + step, target); setVal(Math.floor(s)); if (s < target) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [inView, target]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ═══════════════════════════════════════════════════════════════
   UI — TYPING LINE
   ═══════════════════════════════════════════════════════════════ */
function TypedLine({ text, delay = 0 }: { text: string; delay?: number }) {
  const [shown, setShown] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    const timer = setTimeout(() => { let i = 0; const tick = setInterval(() => { i++; setShown(text.slice(0, i)); if (i >= text.length) clearInterval(tick); }, 20); return () => clearInterval(tick); }, delay);
    return () => clearTimeout(timer);
  }, [inView, text, delay]);
  const isDim = text.startsWith("→");
  return (
    <div ref={ref} style={{ fontFamily: "var(--mono)", fontSize: 12, color: isDim ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.35)", lineHeight: 1.9 }}>
      {!isDim && <span style={{ color: "rgba(255,255,255,0.18)", marginRight: 8 }}>$</span>}
      {isDim && <span style={{ color: "rgba(255,255,255,0.18)", marginRight: 8 }}>→</span>}
      <span style={{ color: isDim ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.8)" }}>{shown.replace(/^→\s*/, "")}</span>
      {shown.length < text.length && inView && <span style={{ borderRight: "1px solid rgba(255,255,255,0.6)", marginLeft: 1 }}>&nbsp;</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UI — HORIZONTAL PIPELINE
   ═══════════════════════════════════════════════════════════════ */
const STEPS = [
  { n: "01", title: "Upload", sub: "CSV · Excel · JSON", icon: "↑", desc: "Drag & drop any tabular dataset. Auto schema detection, type inference, and instant preview with sample rows." },
  { n: "02", title: "Clean", sub: "Detect · Impute · Remove", icon: "◌", desc: "Missing values, duplicate rows, outlier detection. One-click fixes or fully automated cleaning pipeline." },
  { n: "03", title: "Analyse", sub: "EDA · Correlations", icon: "◈", desc: "Distribution plots, correlation heatmaps, feature statistics — generated automatically for every column." },
  { n: "04", title: "Model", sub: "AutoML · Compare", icon: "⬡", desc: "Train XGBoost, LightGBM, Random Forest side by side. Pick the best automatically. R², RMSE, accuracy all tracked." },
  { n: "05", title: "Deploy", sub: "Reports · Endpoints", icon: "→", desc: "Export insights as PDF, serve predictions via REST endpoint, or re-run the whole pipeline on fresh data." },
];

function HorizontalPipeline() {
  const container = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: container, offset: ["start start", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["0%", `-${(STEPS.length - 1) * 24}%`]);
  return (
    <section ref={container} style={{ height: `${STEPS.length * 100}vh`, position: "relative" }}>
      <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", top: 36, left: 40, zIndex: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)" }}>Pipeline — scroll to explore</div>
        </div>
        <motion.div style={{ x, display: "flex", gap: 20, paddingLeft: "10vw", willChange: "transform" }}>
          {STEPS.map((step, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: i * 0.06 }} viewport={{ once: true }} style={{ flexShrink: 0, width: "22vw", minWidth: 290 }}>
              <Glass style={{ padding: "44px 38px", height: 400, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 55%)", borderRadius: 20, pointerEvents: "none" }} />
                <div style={{ fontSize: 10.5, letterSpacing: "0.16em", color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)", marginBottom: 36 }}>{step.n}</div>
                <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 28, color: "rgba(255,255,255,0.12)", fontWeight: 300 }}>{step.icon}</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 400, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>{step.title}</div>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase", fontFamily: "var(--mono)", marginBottom: 24 }}>{step.sub}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.75, marginTop: "auto" }}>{step.desc}</div>
              </Glass>
            </motion.div>
          ))}
          <div style={{ flexShrink: 0, width: "10vw" }} />
        </motion.div>
        <div style={{ position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}>
          {STEPS.map((_, i) => <div key={i} style={{ width: 20, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.2)" }} />)}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DATA CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const FEATURES = [
  { title: "AI Analyst Chat", body: "Ask questions about your data in plain English. Qwen with full tool-calling runs the actual analyses — no hallucinations, real results.", tag: "LLM" },
  { title: "Pipeline Builder", body: "Compose reusable workflows visually. AI suggests steps based on your dataset. Save, re-run on new data, view run history.", tag: "Builder" },
  { title: "AutoML", body: "Select a target column. DSAgent detects regression vs classification, trains 3 models, compares them, and surfaces the winner.", tag: "ML" },
  { title: "Explainability", body: "Feature importance, correlation heatmaps, and natural-language summaries baked into every analysis. No black boxes.", tag: "XAI" },
  { title: "Session Memory", body: "Every upload, chat, and pipeline is persisted to PostgreSQL. Resume mid-analysis or reload a conversation weeks later.", tag: "Persistence" },
  { title: "Dark Charts", body: "Histograms, scatter plots, correlation heatmaps, box plots — all styled in dark mode via matplotlib + imshow. PNG export.", tag: "Viz" },
];

const DEMO_LINES = [
  { text: "dsagent upload HousePrices.csv", delay: 300 },
  { text: "→ 4,600 rows · 18 columns detected", delay: 900 },
  { text: "→ Numeric: price, bedrooms, bathrooms, sqft…", delay: 1500 },
  { text: "dsagent suggest --all", delay: 2400 },
  { text: "→ 5 pipeline steps recommended by AI", delay: 3100 },
  { text: "dsagent run --pipeline auto", delay: 4000 },
  { text: "→ [1/5] dataset_overview      ✓  38ms", delay: 4700 },
  { text: "→ [2/5] correlation_analysis  ✓  51ms", delay: 5300 },
  { text: "→ [3/5] detect_outliers       ✓  29ms", delay: 5900 },
  { text: "→ [4/5] create_histogram      ✓  329ms", delay: 6500 },
  { text: "→ [5/5] auto_ml_pipeline      ✓  4.2s", delay: 7400 },
  { text: "→ Best: XGBoost  R²=0.913  RMSE=$18,420", delay: 8200 },
];

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE EXPORT
   ═══════════════════════════════════════════════════════════════ */
export default function Home() {
  /* ── scroll + mouse refs for 3D scene (no re-renders) ── */
  const scrollRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const pipelineRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress: pipelineScroll } = useScroll({
    target: pipelineRef,
    offset: ["start end", "end start"],
  });
  useEffect(() => {
    setMounted(true);
    const onScroll = () => {
      scrollRef.current = window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1);
    };
    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("mousemove", onMouse); };
  }, []);

  /* ── hero parallax ── */
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroScroll } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(heroScroll, [0, 1], [0, 100]);
  const heroOp = useTransform(heroScroll, [0, 0.65], [1, 0]);

  /* ── nav scroll state ── */
  const [navScrolled, setNavScrolled] = useState(false);
  useEffect(() => { const fn = () => setNavScrolled(window.scrollY > 70); window.addEventListener("scroll", fn); return () => window.removeEventListener("scroll", fn); }, []);

  return (
    <>
      {/* ═════ GLOBAL STYLES ═════ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500&family=Geist:wght@300;400;500;600;700&display=swap');
        :root{--serif:'Instrument Serif',Georgia,serif;--mono:'JetBrains Mono',monospace;--sans:'Geist',system-ui,sans-serif}
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth;cursor:none}
        body{background:#080808;color:#f0f0f0;font-family:var(--sans);overflow-x:hidden;-webkit-font-smoothing:antialiased}
        ::selection{background:rgba(255,255,255,0.12)}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#080808}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}
        @keyframes float-a{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-14px) rotate(1deg)}}
        @keyframes float-b{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-20px) rotate(-1.5deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes spin-slow{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse-dot{0%{box-shadow:0 0 0 0 rgba(255,255,255,0.35)}70%{box-shadow:0 0 0 8px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}
        @keyframes scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
      `}</style>

      {/* ═════ FIXED 3D BACKGROUND ═════ */}
      {mounted && (
        <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
          <Canvas
            camera={{ position: [0, 0.5, 6], fov: 45 }}
            dpr={[1, 1.5]}
            gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
            style={{ background: "transparent" }}
          >
            <Suspense fallback={null}>
              <HeroScene scrollRef={scrollRef} mouseRef={mouseRef} pipelineScroll={pipelineScroll} />
            </Suspense>
          </Canvas>
        </div>
      )}

      {/* ═════ HOLOGRAPHIC SCANLINES ═════ */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg,transparent 0px,transparent 2px,rgba(0,0,0,0.018) 2px,rgba(0,0,0,0.018) 4px)",
      }} />
      {/* Moving scanline bar */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "6px", zIndex: 1, pointerEvents: "none",
        background: "linear-gradient(180deg, transparent, rgba(68,136,255,0.06), transparent)",
        animation: "scanline 4s linear infinite",
      }} />

      <Grain />
      <Cursor />

      {/* ═════ ALL CONTENT (above 3D) ═════ */}
      <div style={{ position: "relative", zIndex: 2 }}>

        {/* ────────────────────── NAV ────────────────────── */}
        <motion.nav
          initial={{ y: -70, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 1000,
            width: "calc(100% - 40px)", maxWidth: 880, display: "flex", alignItems: "center",
            justifyContent: "space-between", padding: "11px 18px",
            background: navScrolled ? "rgba(8,8,8,0.88)" : "rgba(255,255,255,0.03)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${navScrolled ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.06)"}`,
            borderRadius: 100, transition: "background 0.4s, border-color 0.4s",
          }}
        >
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "#fff", letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "linear-gradient(135deg, #4488ff, #88aaff)", boxShadow: "0 0 8px rgba(68,136,255,0.4)" }} />
            DSAgent
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["Pipeline", "Features", "Demo"].map(label => (
              <a key={label} href={`#${label.toLowerCase()}`} data-hover style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textDecoration: "none", padding: "6px 13px", borderRadius: 100, letterSpacing: "0.01em", transition: "color 0.2s, background 0.2s" }}
                onMouseEnter={e => { (e.currentTarget).style.color = "#fff"; (e.currentTarget).style.background = "rgba(255,255,255,0.07)"; }}
                onMouseLeave={e => { (e.currentTarget).style.color = "rgba(255,255,255,0.4)"; (e.currentTarget).style.background = "transparent"; }}
              >{label}</a>
            ))}
          </div>
          <Link href="/dashboard" data-hover style={{ fontSize: 12, fontWeight: 600, color: "#080808", background: "#fff", padding: "8px 18px", borderRadius: 100, textDecoration: "none", letterSpacing: "-0.01em", transition: "opacity 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >Dashboard →</Link>
        </motion.nav>

        {/* ────────────────────── HERO ────────────────────── */}
        <section ref={heroRef} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 24px 80px", position: "relative", overflow: "hidden" }}>

          {/* grid bg */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.02, backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)", backgroundSize: "80px 80px" }} />
          {/* glow */}
          <div style={{ position: "absolute", top: "35%", left: "50%", transform: "translate(-50%,-50%)", width: 700, height: 700, background: "radial-gradient(circle,rgba(68,136,255,0.04) 0%,transparent 65%)", pointerEvents: "none" }} />

          <motion.div style={{ y: heroY, opacity: heroOp, textAlign: "center", maxWidth: 880, position: "relative", zIndex: 2 }}>
            {/* status pill */}
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} style={{ display: "inline-flex", alignItems: "center", marginBottom: 44 }}>
              <Glass style={{ padding: "6px 16px", borderRadius: 100, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.7)", animation: "pulse-dot 2.5s ease-out infinite" }} />
                <span style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontFamily: "var(--mono)" }}>Public Beta</span>
              </Glass>
            </motion.div>

            {/* headline */}
            <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ fontFamily: "var(--serif)", fontSize: "clamp(52px, 9.5vw, 108px)", fontWeight: 400, lineHeight: 0.96, letterSpacing: "-0.04em", color: "#fff", marginBottom: 10 }}>
              Your Autonomous
            </motion.h1>
            <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
              style={{ fontFamily: "var(--serif)", fontSize: "clamp(52px, 9.5vw, 108px)", fontWeight: 400, lineHeight: 0.96, letterSpacing: "-0.04em", color: "rgba(255,255,255,0.32)", fontStyle: "italic", marginBottom: 40 }}>
              Data Scientist
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
              style={{ fontSize: 16, color: "rgba(255,255,255,0.38)", lineHeight: 1.7, maxWidth: 480, margin: "0 auto 48px" }}>
              Upload a CSV — get data cleaning, analysis, visualizations, and trained ML models automatically. AI explains every step.
            </motion.p>

            {/* CTAs */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.62 }}
              style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 72 }}>
              <Link href="/dashboard" data-hover style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "13px 28px", borderRadius: 100, background: "#fff", color: "#080808", fontSize: 13, fontWeight: 600, textDecoration: "none", letterSpacing: "-0.01em", transition: "opacity 0.2s, transform 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
              >Start Analysing <span style={{ opacity: 0.45 }}>→</span></Link>
              <button data-hover style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "12px 26px", borderRadius: 100, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)", fontSize: 13, cursor: "pointer", letterSpacing: "-0.01em", transition: "border-color 0.2s, color 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
              >▶ Watch Demo</button>
            </motion.div>

            {/* stats */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.95 }}
              style={{ display: "flex", justifyContent: "center", gap: 56, flexWrap: "wrap" }}>
              {[
                { value: 50, suffix: "+", label: "ML Tools" },
                { value: 10, suffix: "x", label: "Faster Analysis" },
                { value: 99, suffix: ".9%", label: "Uptime" },
                { value: 5, suffix: "s avg", label: "Training Time" },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 34, color: "#fff", letterSpacing: "-0.04em" }}>
                    <Counter target={s.value} suffix={s.suffix} />
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--mono)", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* floating card — model result */}
          <motion.div initial={{ opacity: 0, scale: 0.88, x: 20 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ duration: 1, delay: 0.7 }}
            style={{ position: "absolute", right: "6%", top: "22%", animation: "float-a 8s ease-in-out infinite" }}>
            <Glass style={{ width: 210, padding: "18px 20px", borderRadius: 16 }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", fontFamily: "var(--mono)", marginBottom: 14 }}>Latest Run</div>
              {[["Model", "XGBoost"], ["R²", "0.913"], ["RMSE", "$18,420"], ["Status", "✓ Done"]].map(([k, v], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.28)", fontFamily: "var(--mono)" }}>{k}</span>
                  <span style={{ fontSize: 10.5, color: i === 0 ? "#fff" : `rgba(255,255,255,${0.85 - i * 0.15})`, fontFamily: "var(--mono)", fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </Glass>
          </motion.div>

          {/* floating card — pipeline */}
          <motion.div initial={{ opacity: 0, scale: 0.88, x: -20 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ duration: 1, delay: 0.85 }}
            style={{ position: "absolute", left: "5%", bottom: "16%", animation: "float-b 10s ease-in-out infinite 2s" }}>
            <Glass style={{ padding: "14px 18px", borderRadius: 14, maxWidth: 230 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, lineHeight: 2, color: "rgba(255,255,255,0.28)" }}>
                <div><span style={{ color: "rgba(255,255,255,0.16)" }}>$</span><span style={{ color: "rgba(255,255,255,0.75)", marginLeft: 6 }}>dsagent suggest</span></div>
                <div style={{ color: "rgba(255,255,255,0.5)" }}>→ 5 steps ready</div>
                <div><span style={{ color: "rgba(255,255,255,0.16)" }}>$</span><span style={{ color: "rgba(255,255,255,0.75)", marginLeft: 6 }}>dsagent run</span></div>
                <div style={{ color: "rgba(255,255,255,0.5)" }}>→ Pipeline complete<span style={{ animation: "blink 1s infinite" }}>_</span></div>
              </div>
            </Glass>
          </motion.div>

          {/* spinning ring deco */}
          <div style={{ position: "absolute", bottom: "10%", right: "12%", width: 80, height: 80, border: "1px solid rgba(255,255,255,0.06)", borderRadius: "50%", animation: "spin-slow 20s linear infinite", pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 50, height: 50, border: "1px solid rgba(255,255,255,0.04)", borderRadius: "50%" }} />
          </div>
        </section>

        {/* ────────────────────── MARQUEE ────────────────────── */}
        <Marquee />

        {/* ────────────────────── PIPELINE ────────────────────── */}
        <div id="pipeline" ref={pipelineRef}>
          <HorizontalPipeline />
        </div>

        {/* ────────────────────── TERMINAL DEMO ────────────────────── */}
        <section id="demo" style={{ padding: "120px 24px", maxWidth: 840, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} style={{ marginBottom: 44 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)", marginBottom: 16 }}>Live Demo</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: "clamp(36px, 5vw, 58px)", fontWeight: 400, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1.05 }}>
              See it work in<br /><em style={{ color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>real time</em>
            </h2>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}>
            <Glass style={{ borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
                {[0.12, 0.07, 0.05].map((o, i) => (
                  <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: `rgba(255,255,255,${o})` }} />
                ))}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", fontFamily: "var(--mono)", marginLeft: 8, letterSpacing: "0.1em" }}>dsagent — terminal</span>
              </div>
              <div style={{ padding: "22px 24px 28px" }}>
                {DEMO_LINES.map((line, i) => (
                  <TypedLine key={i} text={line.text} delay={line.delay} />
                ))}
              </div>
            </Glass>
          </motion.div>
        </section>

        {/* ────────────────────── FEATURES ────────────────────── */}
        <section id="features" style={{ padding: "40px 24px 120px", maxWidth: 1080, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ marginBottom: 52 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)", marginBottom: 16 }}>Capabilities</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: "clamp(36px, 5vw, 58px)", fontWeight: 400, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1.05 }}>
              Everything built<br /><em style={{ color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>in</em>
            </h2>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {FEATURES.map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.07 }}>
                <Glass
                  data-hover
                  style={{ padding: "26px 26px 30px", height: "100%", position: "relative", overflow: "hidden" }}
                  onMouseEnter={(e: React.MouseEvent) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.14)";
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.055)";
                  }}
                  onMouseLeave={(e: React.MouseEvent) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                  }}
                >
                  <div style={{ position: "absolute", top: 18, right: 18 }}>
                    <div style={{ padding: "3px 9px", borderRadius: 100, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", fontFamily: "var(--mono)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}>{f.tag}</div>
                  </div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 22, color: "#fff", letterSpacing: "-0.02em", marginBottom: 12 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", lineHeight: 1.72 }}>{f.body}</div>
                </Glass>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ────────────────────── TECH SPLIT ────────────────────── */}
        <section style={{ padding: "80px 24px 120px", borderTop: "1px solid rgba(255,255,255,0.05)", maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
            <motion.div initial={{ opacity: 0, x: -24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)", marginBottom: 16 }}>Stack</div>
              <h2 style={{ fontFamily: "var(--serif)", fontSize: "clamp(32px, 4vw, 50px)", fontWeight: 400, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1.08, marginBottom: 22 }}>
                Built on tools<br /><em style={{ color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>you already trust</em>
              </h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.36)", lineHeight: 1.75, maxWidth: 360 }}>
                Next.js 15, FastAPI, PostgreSQL via Prisma, Clerk auth — and Qwen-3 powering every intelligent decision.
              </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.1 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  ["Next.js 15", "Frontend"], ["FastAPI", "Backend"],
                  ["Qwen", "Intelligence"], ["PostgreSQL", "Database"],
                  ["XGBoost", "ML Engine"], ["LightGBM", "ML Engine"],
                  ["Prisma", "ORM"], ["Clerk", "Auth"],
                ].map(([name, role], i) => (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.94 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.04 }}>
                    <Glass
                      data-hover
                      style={{ padding: "13px 15px" }}
                      onMouseEnter={(e: React.MouseEvent) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.15)";
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.07)";
                      }}
                      onMouseLeave={(e: React.MouseEvent) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>{name}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.26)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--mono)", marginTop: 3 }}>{role}</div>
                    </Glass>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ────────────────────── CTA ────────────────────── */}
        <section style={{ padding: "80px 24px 140px", textAlign: "center", position: "relative", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 500, height: 500, background: "radial-gradient(circle,rgba(68,136,255,0.035) 0%,transparent 65%)", pointerEvents: "none" }} />
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} style={{ position: "relative", zIndex: 2 }}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: "clamp(48px, 9vw, 96px)", fontWeight: 400, letterSpacing: "-0.04em", color: "#fff", lineHeight: 0.96, marginBottom: 28 }}>
              Start in<br /><em style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>seconds</em>
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.32)", marginBottom: 44, maxWidth: 380, margin: "0 auto 44px" }}>
              No code. No configuration. Upload your dataset and let DSAgent handle the rest.
            </p>
            <Link href="/dashboard" data-hover style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "14px 34px", borderRadius: 100, background: "#fff", color: "#080808",
              fontSize: 14, fontWeight: 600, textDecoration: "none", letterSpacing: "-0.01em",
              transition: "opacity 0.2s, transform 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "scale(1.02)"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1)"; }}
            >
              Open DSAgent <span style={{ opacity: 0.38 }}>→</span>
            </Link>
          </motion.div>
        </section>

        {/* ────────────────────── FOOTER ────────────────────── */}
        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 17, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "linear-gradient(135deg, #4488ff, #88aaff)" }} />
            DSAgent
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            {["Features", "Pipeline", "Dashboard", "GitHub"].map(l => (
              <a key={l} href="#" data-hover style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", textDecoration: "none", letterSpacing: "0.02em", transition: "color 0.2s" }}
                onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.65)"}
                onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.22)"}
              >{l}</a>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", fontFamily: "var(--mono)" }}>© 2025 DSAgent</div>
        </footer>

      </div>{/* end content wrapper */}
    </>
  );
}