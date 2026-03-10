"use client";

import React, { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import * as THREE from "three";

/* =========================================
   THREE.JS COMPONENTS
   ========================================= */

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
      for (let j = 0; j < 3; j++) {
        const limit = j === 0 ? 8 : j === 1 ? 5 : 4;
        if (Math.abs(posArr[i * 3 + j]) > limit) {
          velocities[i * 3 + j] *= -1;
        }
      }
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;

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
              posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2],
              posArr[j * 3], posArr[j * 3 + 1], posArr[j * 3 + 2]
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
          size={0.05}
          color="#00D4FF"
          transparent
          opacity={0.6}
          sizeAttenuation
        />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry />
        <lineBasicMaterial color="#00D4FF" transparent opacity={0.08} />
      </lineSegments>
    </>
  );
}

function HeroTorusKnot() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * 0.12;
      ref.current.rotation.y += delta * 0.18;
    }
  });
  return (
    <mesh ref={ref} position={[0, 0, -1]}>
      <torusKnotGeometry args={[1.8, 0.4, 128, 32]} />
      <meshBasicMaterial color="#00D4FF" wireframe transparent opacity={0.08} />
    </mesh>
  );
}

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
      <Stars radius={100} depth={60} count={1200} factor={4} fade speed={0.3} />
    </Canvas>
  );
}

/* --- Pipeline 3D Shapes --- */
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
        <meshStandardMaterial color="#00D4FF" wireframe transparent opacity={0.6} />
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
        <meshStandardMaterial color="#8B5CF6" wireframe transparent opacity={0.6} />
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
        <meshStandardMaterial color="#F59E0B" wireframe transparent opacity={0.6} />
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
        <meshStandardMaterial color="#00D4FF" wireframe transparent opacity={0.6} />
      </mesh>
    </Float>
  );
}

function DiamondShape() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.4;
  });
  return (
    <Float speed={2.2} floatIntensity={0.6}>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color="#8B5CF6" wireframe transparent opacity={0.5} />
      </mesh>
    </Float>
  );
}

function MiniPipelineCanvas({ children }: { children: React.ReactNode }) {
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

/* --- AI Orb --- */
function AiOrb() {
  const outerRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  const particlePositions = useMemo(() => {
    const pos = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.2 + Math.random() * 0.8;
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
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = t * -0.3;
      ring2Ref.current.rotation.y = t * 0.4;
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y = t * 0.08;
    }
  });

  return (
    <>
      <mesh>
        <sphereGeometry args={[0.45, 32, 32]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.2} />
      </mesh>
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.75, 32, 32]} />
        <meshBasicMaterial color="#8B5CF6" wireframe transparent opacity={0.15} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.0, 16, 16]} />
        <meshBasicMaterial color="#00D4FF" wireframe transparent opacity={0.06} />
      </mesh>
      <mesh ref={ringRef}>
        <torusGeometry args={[1.1, 0.015, 16, 64]} />
        <meshBasicMaterial color="#00D4FF" transparent opacity={0.4} />
      </mesh>
      <mesh ref={ring2Ref}>
        <torusGeometry args={[1.3, 0.01, 16, 64]} />
        <meshBasicMaterial color="#8B5CF6" transparent opacity={0.25} />
      </mesh>
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particlePositions, 3]}
            count={300}
          />
        </bufferGeometry>
        <pointsMaterial size={0.025} color="#00D4FF" transparent opacity={0.5} sizeAttenuation />
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

/* --- 3D Bar Chart --- */
function BarChart3D() {
  const bars = [
    { height: 2.0, color: "#00D4FF" },
    { height: 1.4, color: "#8B5CF6" },
    { height: 1.1, color: "#F59E0B" },
    { height: 0.8, color: "#10B981" },
    { height: 0.5, color: "#00D4FF" },
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
            <meshStandardMaterial color={bar.color} transparent opacity={0.6} />
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
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
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
   DATA
   ========================================= */

const pipelineSteps = [
  { label: "Data Upload", desc: "CSV, Excel, JSON · Auto schema detection", Shape: RotatingCube },
  { label: "Data Cleaning", desc: "Missing values · Outlier detection · Normalization", Shape: FunnelShape },
  { label: "Feature Engineering", desc: "Encoding · Feature selection · Auto transforms", Shape: GearShape },
  { label: "Model Training", desc: "AutoML · Cross-validation · Hyperparameter tuning", Shape: NeuralSphere },
  { label: "Insights", desc: "Feature importance · Explainability · Reports", Shape: DiamondShape },
];

const techStack = [
  { name: "Next.js", icon: "⚡", color: "#ffffff" },
  { name: "FastAPI", icon: "🚀", color: "#009688" },
  { name: "Python", icon: "🐍", color: "#3776AB" },
  { name: "Scikit-Learn", icon: "🔬", color: "#F7931E" },
  { name: "PyTorch", icon: "🔥", color: "#EE4C2C" },
  { name: "PostgreSQL", icon: "🐘", color: "#336791" },
  { name: "Docker", icon: "🐳", color: "#2496ED" },
];

const features = [
  { icon: "🧠", title: "Automated Insights", desc: "Machine learning models trained and evaluated automatically with zero configuration required." },
  { icon: "⚡", title: "Real-time Analysis", desc: "Get predictions and actionable insights in milliseconds with optimized inference pipelines." },
  { icon: "🔒", title: "Enterprise Security", desc: "SOC 2 compliant infrastructure with end-to-end encryption and data isolation." },
  { icon: "📈", title: "Scalable Infrastructure", desc: "Handle datasets from megabytes to terabytes with auto-scaling compute resources." },
  { icon: "🎯", title: "Custom Models", desc: "Deploy tailored machine learning models optimized for your specific business use case." },
  { icon: "💬", title: "24/7 Support", desc: "Expert data science support team available around the clock for guidance." },
];

const stats = [
  { number: "10x", label: "Faster Analysis" },
  { number: "99.9%", label: "Uptime SLA" },
  { number: "50+", label: "ML Models" },
  { number: "< 5s", label: "Avg. Training" },
];

/* =========================================
   MAIN PAGE COMPONENT
   ========================================= */

export default function Home() {
  const [showResults, setShowResults] = useState(false);
  const [uploadClicked, setUploadClicked] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const chatRef = useRef(null);
  const chatInView = useInView(chatRef, { once: true, margin: "-100px" });

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const agentResponse = `The prediction was driven by:
• Overall Quality score: 8/10  (+$82k impact)
• Lot Area: 12,000 sqft         (+$34k impact)
• Neighborhood: NridgHt         (+$28k impact)
• Year Built: 2005               (+$15k impact)`;

  const { displayed: typedResponse, done: typingDone } = useTypingEffect(
    agentResponse, 15, chatInView
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
      {/* ============ NAVBAR ============ */}
      <motion.nav
        className="navbar"
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        style={{
          background: scrolled
            ? "rgba(3, 7, 18, 0.85)"
            : "rgba(3, 7, 18, 0.4)",
        }}
      >
        <span className="navbar-logo">DSAgent</span>
        <div className="navbar-links">
          <a href="#pipeline" className="navbar-link">Pipeline</a>
          <a href="#demo" className="navbar-link">Demo</a>
          <a href="#features" className="navbar-link">Features</a>
          <a href="#tech" className="navbar-link">Stack</a>
        </div>
        <button className="navbar-cta">Get Started</button>
      </motion.nav>

      {/* ============ HERO ============ */}
      <section className="section" style={{ padding: 0 }}>
        <div className="liquid-blobs">
          <div className="liquid-blob liquid-blob-1" />
          <div className="liquid-blob liquid-blob-2" />
          <div className="liquid-blob liquid-blob-3" />
        </div>
        <div className="hero-canvas-container" style={{ zIndex: 0, pointerEvents: "none" }}>
          <HeroScene />
        </div>
        <div className="hero-overlay">
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="hero-badge-dot" />
            Now in Public Beta
          </motion.div>

          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            DSAgent
          </motion.h1>

          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            Your Autonomous Data Scientist
          </motion.p>

          <motion.p
            className="hero-desc"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            Upload a dataset and get insights, models, and production-ready reports —
            fully automated with explainable AI.
          </motion.p>

          <motion.div
            className="hero-buttons"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.0 }}
          >
            <button className="btn btn-cyan">
              <span>📤</span> Upload Dataset
            </button>
            <button className="btn btn-glass">▶ Watch Demo</button>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-glass"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </a>
          </motion.div>

          {/* Stats Row */}
          <motion.div
            className="stats-bar"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.3 }}
            style={{ marginTop: 80, width: "100%", maxWidth: 700 }}
          >
            {stats.map((stat, i) => (
              <div key={i} className="stat-item">
                <div className="stat-number">{stat.number}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============ PIPELINE ============ */}
      <section className="section" id="pipeline">
        <div className="liquid-blobs">
          <div className="liquid-blob liquid-blob-2" style={{ top: "10%", left: "20%" }} />
          <div className="liquid-blob liquid-blob-3" style={{ bottom: "10%", right: "10%" }} />
        </div>
        <AnimatedSection className="section-inner">
          <motion.p variants={fadeUp} className="section-label">
            How It Works
          </motion.p>
          <motion.h2 variants={fadeUp} className="section-title">
            Intelligent Pipeline
          </motion.h2>
          <motion.p variants={fadeUp} className="section-subtitle">
            From raw data to production insights — every step is automated,
            optimized, and fully explainable.
          </motion.p>
          <motion.div variants={fadeUp} className="pipeline-wrapper">
            {pipelineSteps.map((step, i) => (
              <React.Fragment key={i}>
                <motion.div
                  className="pipeline-node"
                  variants={fadeUp}
                  whileHover={{ scale: 1.06 }}
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

      {/* ============ AI CHAT DEMO ============ */}
      <section className="section" ref={chatRef}>
        <div className="liquid-blobs">
          <div className="liquid-blob liquid-blob-1" style={{ top: "30%", right: "5%" }} />
          <div className="liquid-blob liquid-blob-3" style={{ top: "60%", left: "5%" }} />
        </div>
        <AnimatedSection className="section-inner">
          <motion.p variants={fadeUp} className="section-label">
            AI Agent
          </motion.p>
          <motion.h2 variants={fadeUp} className="section-title">
            Ask Your Data Anything
          </motion.h2>
          <motion.p variants={fadeUp} className="section-subtitle">
            Get explainable, context-aware answers from your AI data scientist —
            powered by advanced language models.
          </motion.p>
          <motion.div variants={fadeUp} className="chat-section">
            <div className="orb-container">
              <OrbScene />
            </div>
            <div className="chat-window">
              <div className="chat-header">
                <div className="chat-header-dot" />
                DSAgent Terminal
              </div>
              <div className="chat-body">
                <div className="chat-bubble chat-bubble-user">
                  <span className="chat-bubble-label">You</span>
                  Why did the model predict $450,000 for this house?
                </div>
                <div className="chat-bubble chat-bubble-agent">
                  <span className="chat-bubble-label">DSAgent</span>
                  <span style={{ whiteSpace: "pre-wrap" }}>{typedResponse}</span>
                  {!typingDone && <span className="typing-cursor" />}
                  {typingDone && (
                    <div className="chat-confidence">
                      Confidence: 94.2% &nbsp;·&nbsp; Model: XGBoost
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ============ LIVE DEMO ============ */}
      <section className="section" id="demo">
        <div className="liquid-blobs">
          <div className="liquid-blob liquid-blob-2" style={{ bottom: "0%", left: "30%" }} />
        </div>
        <AnimatedSection className="section-inner">
          <motion.p variants={fadeUp} className="section-label">
            Try It Now
          </motion.p>
          <motion.h2 variants={fadeUp} className="section-title">
            Live Demo Preview
          </motion.h2>
          <motion.p variants={fadeUp} className="section-subtitle">
            Experience the power of automated data science — upload a dataset
            and watch DSAgent work.
          </motion.p>

          <motion.div variants={fadeUp} style={{ maxWidth: 680, margin: "0 auto" }}>
            <motion.div
              className="upload-zone"
              onClick={handleUploadClick}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <div className="upload-icon">
                {uploadClicked ? "⏳" : "📁"}
              </div>
              <div style={{
                fontFamily: "var(--font-heading)",
                fontSize: "0.95rem",
                fontWeight: 600,
                color: uploadClicked ? "var(--text)" : "var(--cyan)",
                marginBottom: 8,
              }}>
                {uploadClicked ? "Processing dataset..." : "Drop your dataset here"}
              </div>
              <div style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}>
                {uploadClicked
                  ? "Running automated analysis pipeline"
                  : "CSV, Excel, JSON — up to 500MB"}
              </div>
              {uploadClicked && !showResults && (
                <motion.div
                  style={{
                    marginTop: 20,
                    height: 3,
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    style={{
                      height: "100%",
                      background: "linear-gradient(90deg, var(--cyan), var(--violet))",
                      borderRadius: 2,
                      boxShadow: "0 0 12px rgba(0, 212, 255, 0.4)",
                    }}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                  />
                </motion.div>
              )}
            </motion.div>

            {showResults && (
              <motion.div
                className="result-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="result-header">Ames Housing Dataset</div>
                <div className="result-subheader">1,460 rows · 81 features · Auto-detected regression task</div>
                <div className="result-divider" />

                {metrics.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.15, duration: 0.4 }}
                  >
                    <div className="metric-row">
                      <span className="metric-label">{m.label}</span>
                      <span className="metric-value">
                        {m.value} <span className="metric-check">✓</span>
                      </span>
                    </div>
                    <div className="metric-bar-bg">
                      <motion.div
                        className="metric-bar-fill"
                        initial={{ width: "0%" }}
                        animate={{ width: `${m.pct}%` }}
                        transition={{ delay: i * 0.15 + 0.3, duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </motion.div>
                ))}

                <div style={{ marginTop: 28 }}>
                  <div style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}>
                    Feature Importance
                  </div>
                  <BarChart3D />
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ============ FEATURES ============ */}
      <section className="section" id="features">
        <div className="liquid-blobs">
          <div className="liquid-blob liquid-blob-1" style={{ top: "20%", right: "15%" }} />
          <div className="liquid-blob liquid-blob-2" style={{ bottom: "20%", left: "10%" }} />
        </div>
        <AnimatedSection className="section-inner">
          <motion.p variants={fadeUp} className="section-label">
            Capabilities
          </motion.p>
          <motion.h2 variants={fadeUp} className="section-title">
            Enterprise-Grade Analytics
          </motion.h2>
          <motion.p variants={fadeUp} className="section-subtitle">
            Everything you need to harness the power of intelligent data science at any scale.
          </motion.p>
        </AnimatedSection>
        <AnimatedSection className="features-grid" style={{ position: "relative", zIndex: 2 }}>
          {features.map((item, i) => (
            <motion.div
              key={i}
              className="feature-card liquid-glass-shine"
              variants={fadeUp}
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="feature-icon">{item.icon}</div>
              <div className="feature-title">{item.title}</div>
              <div className="feature-desc">{item.desc}</div>
            </motion.div>
          ))}
        </AnimatedSection>
      </section>

      {/* ============ TECH STACK ============ */}
      <section className="section" id="tech">
        <div className="liquid-blobs">
          <div className="liquid-blob liquid-blob-3" style={{ top: "30%", left: "50%" }} />
        </div>
        <AnimatedSection className="section-inner">
          <motion.p variants={fadeUp} className="section-label">
            Technology
          </motion.p>
          <motion.h2 variants={fadeUp} className="section-title">
            Built for Performance
          </motion.h2>
          <motion.p variants={fadeUp} className="section-subtitle">
            Powered by battle-tested technologies for reliability, speed, and scale.
          </motion.p>
          <motion.div variants={fadeUp} className="tech-grid">
            {techStack.map((tech, i) => (
              <motion.div
                key={i}
                className="tech-card liquid-glass-shine"
                variants={fadeUp}
                whileHover={{
                  scale: 1.05,
                  borderColor: `${tech.color}33`,
                  boxShadow: `0 8px 32px ${tech.color}15`,
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

      {/* ============ CTA ============ */}
      <section className="section">
        <div className="gradient-mesh-bg" />
        <div className="liquid-blobs">
          <div className="liquid-blob liquid-blob-1" />
          <div className="liquid-blob liquid-blob-2" />
          <div className="liquid-blob liquid-blob-3" />
        </div>
        <AnimatedSection className="section-inner cta-section">
          <motion.p variants={fadeUp} className="section-label">
            Get Started
          </motion.p>
          <motion.h2 variants={fadeUp} className="cta-title">
            Start Analyzing Data<br />in Seconds
          </motion.h2>
          <motion.p variants={fadeUp} className="cta-text">
            No code. No configuration. Upload your dataset and let DSAgent handle the rest.
          </motion.p>
          <motion.div
            variants={fadeUp}
            style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}
          >
            <button className="btn btn-cyan">Get Started Free</button>
            <button className="btn btn-glass">Read the Docs</button>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <div className="footer-inner">
          <div>
            <div className="footer-brand">DSAgent</div>
            <p className="footer-tagline">
              Your autonomous AI data scientist. Upload a dataset,
              get insights — automatically.
            </p>
          </div>
          <div>
            <div className="footer-col-title">Product</div>
            <a href="#" className="footer-link">Features</a>
            <a href="#" className="footer-link">Pricing</a>
            <a href="#" className="footer-link">Changelog</a>
            <a href="#" className="footer-link">Roadmap</a>
          </div>
          <div>
            <div className="footer-col-title">Resources</div>
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">API Reference</a>
            <a href="#" className="footer-link">Blog</a>
            <a href="#" className="footer-link">Community</a>
          </div>
          <div>
            <div className="footer-col-title">Company</div>
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Careers</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-copyright">
            © 2024 DSAgent. All rights reserved.
          </span>
          <div className="footer-socials">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="footer-social-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="footer-social-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="footer-social-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}