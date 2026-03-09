"use client";

import React, { useRef, useMemo, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import { motion, useInView } from "framer-motion";
import * as THREE from "three";
import dynamic from "next/dynamic";

// Dynamically load Spline to avoid SSR issues
const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
      }}
    >
      Loading 3D Scene...
    </div>
  ),
});

/* =========================================
   THREE.JS COMPONENTS
   ========================================= */

// --- Animated Particle Network (Hero Background) ---
function ParticleNetwork() {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const count = 120;

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      vel[i * 3] = (Math.random() - 0.5) * 0.003;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.003;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
    }
    return { positions: pos, velocities: vel };
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posArr = pointsRef.current.geometry.attributes.position
      .array as Float32Array;

    for (let i = 0; i < count; i++) {
      posArr[i * 3] += velocities[i * 3];
      posArr[i * 3 + 1] += velocities[i * 3 + 1];
      posArr[i * 3 + 2] += velocities[i * 3 + 2];
      // Wrap around
      for (let j = 0; j < 3; j++) {
        const limit = j === 0 ? 8 : j === 1 ? 5 : 4;
        if (Math.abs(posArr[i * 3 + j]) > limit) {
          velocities[i * 3 + j] *= -1;
        }
      }
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    // Build line connections
    if (linesRef.current) {
      const linePositions: number[] = [];
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = posArr[i * 3] - posArr[j * 3];
          const dy = posArr[i * 3 + 1] - posArr[j * 3 + 1];
          const dz = posArr[i * 3 + 2] - posArr[j * 3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 2.5) {
            linePositions.push(
              posArr[i * 3],
              posArr[i * 3 + 1],
              posArr[i * 3 + 2],
              posArr[j * 3],
              posArr[j * 3 + 1],
              posArr[j * 3 + 2]
            );
          }
        }
      }
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(linePositions, 3)
      );
      linesRef.current.geometry.dispose();
      linesRef.current.geometry = lineGeom;
    }
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={count}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.06}
          color="#00D4FF"
          transparent
          opacity={0.8}
          sizeAttenuation
        />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry />
        <lineBasicMaterial color="#00D4FF" transparent opacity={0.12} />
      </lineSegments>
    </>
  );
}

// --- Rotating Torus Knot ---
function HeroTorusKnot() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * 0.15;
      ref.current.rotation.y += delta * 0.2;
    }
  });
  return (
    <mesh ref={ref} position={[0, 0, -1]}>
      <torusKnotGeometry args={[1.8, 0.4, 128, 32]} />
      <meshBasicMaterial color="#00D4FF" wireframe transparent opacity={0.15} />
    </mesh>
  );
}

// --- Hero Scene ---
function HeroScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 70 }}
      style={{ background: "transparent" }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={0.3} />
      <ParticleNetwork />
      <HeroTorusKnot />
      <Stars
        radius={100}
        depth={60}
        count={1500}
        factor={4}
        fade
        speed={0.5}
      />
    </Canvas>
  );
}

// --- Pipeline 3D Shapes ---
function RotatingCube() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (ref.current) {
      ref.current.rotation.x += d * 0.4;
      ref.current.rotation.y += d * 0.6;
    }
  });
  return (
    <Float speed={2} floatIntensity={0.5}>
      <mesh ref={ref}>
        <boxGeometry args={[1.3, 1.3, 1.3]} />
        <meshStandardMaterial
          color="#00D4FF"
          wireframe
          transparent
          opacity={0.7}
        />
      </mesh>
    </Float>
  );
}

function FunnelShape() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.3;
  });
  return (
    <Float speed={1.5} floatIntensity={0.6}>
      <mesh ref={ref}>
        <coneGeometry args={[1, 1.6, 6, 1, true]} />
        <meshStandardMaterial
          color="#8B5CF6"
          wireframe
          transparent
          opacity={0.7}
        />
      </mesh>
    </Float>
  );
}

function GearShape() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.z += d * 0.5;
  });
  return (
    <Float speed={1.8} floatIntensity={0.4}>
      <mesh ref={ref}>
        <torusGeometry args={[0.7, 0.25, 8, 24]} />
        <meshStandardMaterial
          color="#F59E0B"
          wireframe
          transparent
          opacity={0.7}
        />
      </mesh>
    </Float>
  );
}

function NeuralSphere() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (ref.current) {
      ref.current.rotation.x += d * 0.2;
      ref.current.rotation.y += d * 0.3;
    }
  });
  return (
    <Float speed={2} floatIntensity={0.5}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.9, 1]} />
        <meshStandardMaterial
          color="#00D4FF"
          wireframe
          transparent
          opacity={0.7}
        />
      </mesh>
    </Float>
  );
}

function DiamondShape() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (ref.current) {
      ref.current.rotation.y += d * 0.4;
    }
  });
  return (
    <Float speed={2.2} floatIntensity={0.6}>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial
          color="#8B5CF6"
          wireframe
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.92, 0]} />
        <meshBasicMaterial color="#8B5CF6" wireframe transparent opacity={0.2} />
      </mesh>
    </Float>
  );
}

function MiniPipelineCanvas({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3], fov: 50 }}
      style={{ background: "transparent" }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={0.6} />
      <pointLight position={[3, 3, 3]} intensity={0.8} color="#00D4FF" />
      {children}
    </Canvas>
  );
}

// --- AI Orb ---
function AiOrb() {
  const outerRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  const particlePositions = useMemo(() => {
    const pos = new Float32Array(200 * 3);
    for (let i = 0; i < 200; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.2 + Math.random() * 0.6;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (outerRef.current) {
      outerRef.current.rotation.y = t * 0.2;
      outerRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.03);
    }
    if (ringRef.current) {
      ringRef.current.rotation.x = t * 0.5;
      ringRef.current.rotation.z = t * 0.3;
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y = t * 0.1;
    }
  });

  return (
    <>
      {/* Core sphere */}
      <mesh>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.3} />
      </mesh>
      {/* Energy shell */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshBasicMaterial
          color="#8B5CF6"
          wireframe
          transparent
          opacity={0.2}
        />
      </mesh>
      {/* Outer shell */}
      <mesh>
        <sphereGeometry args={[1.0, 16, 16]} />
        <meshBasicMaterial
          color="#00D4FF"
          wireframe
          transparent
          opacity={0.08}
        />
      </mesh>
      {/* Rotating ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[1.1, 0.02, 16, 64]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.5} />
      </mesh>
      {/* Particle corona */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particlePositions, 3]}
            count={200}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.03}
          color="#00D4FF"
          transparent
          opacity={0.6}
          sizeAttenuation
        />
      </points>
    </>
  );
}

function OrbScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 3], fov: 50 }}
      style={{ background: "transparent" }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={0.2} />
      <AiOrb />
    </Canvas>
  );
}

// --- 3D Bar Chart ---
function BarChart3D() {
  const bars = [
    { height: 2.0, label: "Overall Q", color: "#00D4FF" },
    { height: 1.4, label: "Lot Area", color: "#8B5CF6" },
    { height: 1.1, label: "Neighborhood", color: "#F59E0B" },
    { height: 0.8, label: "Year Built", color: "#10B981" },
    { height: 0.5, label: "Garage", color: "#00D4FF" },
  ];

  return (
    <Canvas
      camera={{ position: [3, 2, 4], fov: 45 }}
      style={{ background: "transparent", height: 200 }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={0.8} />
      {bars.map((bar, i) => (
        <Float key={i} speed={1} floatIntensity={0.1}>
          <mesh position={[i * 0.8 - 1.6, bar.height / 2 - 0.5, 0]}>
            <boxGeometry args={[0.5, bar.height, 0.5]} />
            <meshStandardMaterial
              color={bar.color}
              transparent
              opacity={0.7}
            />
          </mesh>
        </Float>
      ))}
    </Canvas>
  );
}

/* =========================================
   ANIMATION HELPERS
   ========================================= */

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.15 } },
};

function AnimatedSection({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={stagger}
    >
      {children}
    </motion.div>
  );
}

/* =========================================
   TYPING ANIMATION HOOK
   ========================================= */

function useTypingEffect(text: string, speed: number = 20, trigger: boolean = true) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    setDisplayed("");
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, trigger]);

  return { displayed, done };
}

/* =========================================
   PIPELINE DATA
   ========================================= */

const pipelineSteps = [
  {
    label: "Data Upload",
    desc: "Upload CSV, Excel, JSON · Auto schema detection",
    Shape: RotatingCube,
  },
  {
    label: "Data Cleaning",
    desc: "Missing values · Outlier detection · Normalization",
    Shape: FunnelShape,
  },
  {
    label: "Feature Engineering",
    desc: "Encoding · Feature selection · Auto transforms",
    Shape: GearShape,
  },
  {
    label: "Model Training",
    desc: "AutoML · Cross-validation · Hyperparameter tuning",
    Shape: NeuralSphere,
  },
  {
    label: "Insights",
    desc: "Feature importance · Explainability · Reports",
    Shape: DiamondShape,
  },
];

/* =========================================
   TECH STACK DATA
   ========================================= */

const techStack = [
  { name: "Next.js", icon: "⚡", color: "#ffffff" },
  { name: "FastAPI", icon: "🚀", color: "#009688" },
  { name: "Python", icon: "🐍", color: "#3776AB" },
  { name: "Scikit-Learn", icon: "🔬", color: "#F7931E" },
  { name: "PyTorch", icon: "🔥", color: "#EE4C2C" },
  { name: "PostgreSQL", icon: "🐘", color: "#336791" },
  { name: "Docker", icon: "🐳", color: "#2496ED" },
];

/* =========================================
   MAIN PAGE COMPONENT
   ========================================= */

export default function Home() {
  const [showResults, setShowResults] = useState(false);
  const [uploadClicked, setUploadClicked] = useState(false);

  const chatRef = useRef(null);
  const chatInView = useInView(chatRef, { once: true, margin: "-100px" });

  const agentResponse = `The prediction was driven by:
• Overall Quality score: 8/10  (+$82k impact)
• Lot Area: 12,000 sqft         (+$34k impact)
• Neighborhood: NridgHt         (+$28k impact)
• Year Built: 2005               (+$15k impact)`;

  const { displayed: typedResponse, done: typingDone } = useTypingEffect(
    agentResponse,
    15,
    chatInView
  );

  const handleUploadClick = () => {
    if (uploadClicked) return;
    setUploadClicked(true);
    setTimeout(() => setShowResults(true), 1500);
  };

  const metrics = [
    { label: "Problem Type", value: "Regression", pct: 100 },
    { label: "Best Model", value: "XGBoost", pct: 100 },
    { label: "R² Score", value: "0.913", pct: 91 },
    { label: "RMSE", value: "$18,420", pct: 82 },
    { label: "Training Time", value: "4.2 seconds", pct: 95 },
  ];

  return (
    <main>
      {/* ============ SECTION 1: HERO ============ */}
      <section className="section" style={{ padding: 0 }}>
        <div
          className="section-bg-image"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1920)",
            opacity: 0.06,
          }}
        />
        {/* Spline 3D scene behind hero text */}
        <div className="hero-canvas-container" style={{ zIndex: 0 }}>
          <Spline scene="https://prod.spline.design/wCCUeyxlpgdg6jTx/scene.splinecode" />
        </div>
        {/* Three.js particles overlay */}
        <div className="hero-canvas-container" style={{ zIndex: 1, pointerEvents: "none" }}>
          <HeroScene />
        </div>
        <div className="hero-overlay">
          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            DSAgent
          </motion.h1>
          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            Your Autonomous Data Scientist
          </motion.p>
          <motion.p
            className="hero-desc"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            Upload a dataset. Get insights, models, and reports — automatically.
          </motion.p>
          <motion.div
            className="hero-buttons"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1 }}
          >
            <button className="btn btn-cyan">
              <span>📤</span> Upload Dataset
            </button>
            <button className="btn btn-ghost">▶ View Demo</button>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </a>
          </motion.div>
        </div>
      </section>

      {/* ============ SECTION 2: PIPELINE ============ */}
      <section className="section">
        <div
          className="section-bg-image"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1920)",
            opacity: 0.08,
          }}
        />
        <AnimatedSection className="section-inner">
          <motion.h2 variants={fadeUp} className="section-title">
            Intelligent Pipeline
          </motion.h2>
          <motion.p variants={fadeUp} className="section-subtitle">
            From raw data to production insights — fully automated
          </motion.p>
          <motion.div variants={fadeUp} className="pipeline-wrapper">
            {pipelineSteps.map((step, i) => (
              <React.Fragment key={i}>
                <motion.div
                  className="pipeline-node"
                  variants={fadeUp}
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="pipeline-3d-container">
                    <MiniPipelineCanvas>
                      <step.Shape />
                    </MiniPipelineCanvas>
                  </div>
                  <div className="pipeline-label">{step.label}</div>
                  <div className="pipeline-desc">{step.desc}</div>
                </motion.div>
                {i < pipelineSteps.length - 1 && (
                  <div className="pipeline-connector" />
                )}
              </React.Fragment>
            ))}
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ============ SECTION 3: AI CHAT DEMO ============ */}
      <section className="section" ref={chatRef}>
        <div
          className="section-bg-image"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1655720828018-edd2daec9349?w=1920)",
            opacity: 0.06,
          }}
        />
        <AnimatedSection className="section-inner">
          <motion.h2 variants={fadeUp} className="section-title">
            AI Agent Interface
          </motion.h2>
          <motion.p variants={fadeUp} className="section-subtitle">
            Ask your data anything — get explainable answers instantly
          </motion.p>
          <motion.div variants={fadeUp} className="chat-section">
            {/* Orb */}
            <div className="orb-container">
              <OrbScene />
            </div>
            {/* Chat */}
            <div className="chat-window">
              <div className="chat-header">
                <div className="chat-header-dot" />
                DSAGENT TERMINAL
              </div>
              <div className="chat-body">
                <div className="chat-bubble chat-bubble-user">
                  <span className="chat-bubble-label">USER</span>
                  Why did the model predict $450,000 for this house?
                </div>
                <div className="chat-bubble chat-bubble-agent">
                  <span className="chat-bubble-label">DSAGENT</span>
                  <span style={{ whiteSpace: "pre-wrap" }}>
                    {typedResponse}
                  </span>
                  {!typingDone && <span className="typing-cursor" />}
                  {typingDone && (
                    <div className="chat-confidence">
                      Confidence: 94.2% &nbsp;|&nbsp; Model: XGBoost
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ============ SECTION 4: LIVE DEMO ============ */}
      <section className="section">
        <AnimatedSection className="section-inner">
          <motion.h2 variants={fadeUp} className="section-title">
            Live Demo Preview
          </motion.h2>
          <motion.p variants={fadeUp} className="section-subtitle">
            Experience the power of automated data science
          </motion.p>

          <motion.div
            variants={fadeUp}
            style={{ maxWidth: 700, margin: "0 auto" }}
          >
            {/* Upload Zone */}
            <motion.div
              className="upload-zone"
              onClick={handleUploadClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="upload-icon">
                {uploadClicked ? "⏳" : "📁"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.9rem",
                  color: "var(--cyan)",
                  marginBottom: 8,
                }}
              >
                {uploadClicked
                  ? "Processing dataset..."
                  : "Drop your dataset here"}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {uploadClicked
                  ? "Running automated analysis pipeline"
                  : "CSV, Excel, JSON — up to 500MB"}
              </div>
              {uploadClicked && !showResults && (
                <motion.div
                  style={{
                    marginTop: 16,
                    height: 4,
                    background: "rgba(0,212,255,0.1)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    style={{
                      height: "100%",
                      background:
                        "linear-gradient(90deg, var(--cyan), var(--violet))",
                      borderRadius: 2,
                    }}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                  />
                </motion.div>
              )}
            </motion.div>

            {/* Results */}
            {showResults && (
              <motion.div
                className="result-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="result-header">
                  Dataset: Ames Housing
                </div>
                <div className="result-subheader">
                  1,460 rows · 81 features
                </div>
                <div className="result-divider" />

                {metrics.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.2, duration: 0.4 }}
                  >
                    <div className="metric-row">
                      <span className="metric-label">{m.label}</span>
                      <span className="metric-value">
                        {m.value}{" "}
                        <span className="metric-check">✓</span>
                      </span>
                    </div>
                    <div className="metric-bar-bg">
                      <motion.div
                        className="metric-bar-fill"
                        initial={{ width: "0%" }}
                        animate={{ width: `${m.pct}%` }}
                        transition={{
                          delay: i * 0.2 + 0.3,
                          duration: 0.8,
                          ease: "easeOut",
                        }}
                      />
                    </div>
                  </motion.div>
                ))}

                <div style={{ marginTop: 24 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      marginBottom: 8,
                      letterSpacing: "0.05em",
                    }}
                  >
                    FEATURE IMPORTANCE
                  </div>
                  <BarChart3D />
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ============ SECTION 5: TECH STACK ============ */}
      <section className="section">
        <AnimatedSection className="section-inner">
          <motion.h2 variants={fadeUp} className="section-title">
            Tech Stack
          </motion.h2>
          <motion.p variants={fadeUp} className="section-subtitle">
            Built with battle‑tested technologies for reliability and scale
          </motion.p>
          <motion.div variants={fadeUp} className="tech-grid">
            {techStack.map((tech, i) => (
              <motion.div
                key={i}
                className="tech-card"
                variants={fadeUp}
                whileHover={{
                  scale: 1.05,
                  rotateY: 8,
                  borderColor: tech.color,
                  boxShadow: `0 0 20px ${tech.color}33`,
                }}
                style={{
                  borderColor: `${tech.color}22`,
                }}
              >
                <span className="tech-icon">{tech.icon}</span>
                <span className="tech-name" style={{ color: tech.color }}>
                  {tech.name}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ============ SECTION 6: FINAL CTA ============ */}
      <section className="section">
        <div className="gradient-mesh-bg" />
        <div
          className="section-bg-image"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1639322537228-f710d846310a?w=1920)",
            opacity: 0.1,
          }}
        />
        <AnimatedSection className="section-inner cta-section">
          <motion.h2 variants={fadeUp} className="cta-title">
            Start Analyzing Data in Seconds
          </motion.h2>
          <motion.p variants={fadeUp} className="cta-text">
            No code. No configuration. Just upload and let DSAgent do the work.
          </motion.p>
          <motion.div
            variants={fadeUp}
            style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}
          >
            <button className="btn btn-cyan">Get Started Free</button>
            <button className="btn btn-ghost">Read the Docs</button>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ============ SPLINE FOOTER ============ */}
      <section className="spline-footer" style={{ height: "100vh" }}>
        <Spline scene="https://prod.spline.design/wCCUeyxlpgdg6jTx/scene.splinecode" />
      </section>
    </main>
  );
}
