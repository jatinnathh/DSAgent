'use client';

import React, { useRef, useMemo, Suspense, Component, ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { MotionValue } from "framer-motion";

// Error Boundary for WebGL fallback
class CanvasErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error('[RobotCanvas Error]', error);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

/* ═══════════════════════════════════════════════════════════════
   3D SCENE — CAMERA RIG (zoom in after intro)
   ═══════════════════════════════════════════════════════════════ */
function CameraRig({ introZoom }: { introZoom: MotionValue<number> }) {
  useFrame(({ camera }) => {
    const z = introZoom.get();
    const targetZ = 14 - z * 8; // 14 → 6
    const targetY = 0.5 + (1 - z) * 1.0;
    camera.position.z += (targetZ - camera.position.z) * 0.06;
    camera.position.y += (targetY - camera.position.y) * 0.06;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

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
  const { viewport } = useThree();

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

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const scroll = scrollRef.current;
    const mouse = mouseRef.current;

    const p = Math.max(0, Math.min(1, pipelineScroll?.get() ?? 0));
    const eased = p * p * (3 - 2 * p);

    const startX = THREE.MathUtils.clamp(-viewport.width * 0.26, -3.1, -2.2);
    const endX = THREE.MathUtils.clamp(viewport.width * 0.26, 2.2, 3.1);

    const xTarget = THREE.MathUtils.lerp(startX, endX, eased);
    const yTarget = THREE.MathUtils.lerp(0.1, -1.8, eased);

    group.current.position.x = THREE.MathUtils.lerp(
      group.current.position.x,
      xTarget,
      0.08
    );

    group.current.position.y = THREE.MathUtils.lerp(
      group.current.position.y,
      yTarget,
      0.08
    );

    group.current.rotation.z = (p - 0.5) * 0.2;

    const targetY = scroll * Math.PI * 3.5;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.045);

    const float = Math.sin(t * 0.3) * 0.05 * (p + 0.5);
    group.current.position.y += float;

    head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, mouse.x * 0.45, 0.04);
    head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -mouse.y * 0.2, 0.04);

    orbitals.current.rotation.y = t * 0.35;
    orbitals.current.rotation.z = Math.sin(t * 0.15) * 0.12;

    const cMat = core.current.material as THREE.MeshStandardMaterial;
    cMat.emissiveIntensity = 1.8 + Math.sin(t * 2.5) * 0.7;
    core.current.rotation.y = t * 0.8;
    core.current.rotation.z = t * 0.5;
  });

  const D = { color: "#140a2a", metalness: 0.95, roughness: 0.05 };
  const M = { color: "#2a145a", metalness: 0.9, roughness: 0.1 };
  const A = { color: "#4c1d95", metalness: 0.85, roughness: 0.15 };

  return (
    <group ref={group} position={[-2.5, 0.1, 0]} scale={0.82}>
      {/* ──── HEAD ──── */}
      <group ref={head} position={[0, 2.2, 0]}>
        <mesh><boxGeometry args={[0.72, 0.62, 0.68]} /><meshStandardMaterial {...D} /></mesh>
        <mesh position={[0, 0.02, 0.345]}>
          <boxGeometry args={[0.54, 0.1, 0.02]} />
          <meshStandardMaterial emissive="#ffffff" emissiveIntensity={3} color="#111" />
        </mesh>
        <mesh position={[-0.4, 0.05, 0]}><boxGeometry args={[0.06, 0.24, 0.2]} /><meshStandardMaterial {...M} /></mesh>
        <mesh position={[0.4, 0.05, 0]}><boxGeometry args={[0.06, 0.24, 0.2]} /><meshStandardMaterial {...M} /></mesh>
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
        <mesh ref={core} position={[0, 0.12, 0.34]}>
          <icosahedronGeometry args={[0.09, 0]} />
          <meshStandardMaterial emissive="#4488ff" emissiveIntensity={2.5} color="#cc15e4ff" transparent opacity={0.9} />
        </mesh>
        <pointLight position={[0, 0.12, 0.6]} color="#3b82f6" intensity={2} distance={3.5} />
        <mesh position={[-0.6, 0.38, 0]}><boxGeometry args={[0.22, 0.28, 0.36]} /><meshStandardMaterial {...M} /></mesh>
        <mesh position={[0.6, 0.38, 0]}><boxGeometry args={[0.22, 0.28, 0.36]} /><meshStandardMaterial {...M} /></mesh>
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
  introZoom,
}: {
  scrollRef: React.MutableRefObject<number>;
  mouseRef: React.MutableRefObject<{ x: number; y: number }>;
  pipelineScroll: MotionValue<number>;
  introZoom: MotionValue<number>;
}) {
  return (
    <>
      <CameraRig introZoom={introZoom} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 5, 5]} intensity={0.65} color="#aabbff" />
      <directionalLight position={[-4, 3, -4]} intensity={0.35} color="#ffaacc" />
      <pointLight position={[0, 4, 5]} intensity={0.45} color="#ffffff" distance={12} />
      <fog attach="fog" args={["#080808", 6, 22]} />
      <Stars radius={80} depth={60} count={1800} factor={3} saturation={0} fade speed={0.4} />
      <SceneParticles />
      <DataRobot scrollRef={scrollRef} mouseRef={mouseRef} pipelineScroll={pipelineScroll} />
    </>
  );
}

export default function RobotCanvas({
  scrollRef,
  mouseRef,
  pipelineScroll,
  introZoom,
}: {
  scrollRef: React.MutableRefObject<number>;
  mouseRef: React.MutableRefObject<{ x: number; y: number }>;
  pipelineScroll: MotionValue<number>;
  introZoom: MotionValue<number>;
}) {
  return (
    <CanvasErrorBoundary>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <Canvas
          camera={{ position: [0, 1.2, 14], fov: 45 }}
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          style={{ background: "transparent" }}
        >
          <Suspense fallback={null}>
            <HeroScene
              scrollRef={scrollRef}
              mouseRef={mouseRef}
              pipelineScroll={pipelineScroll}
              introZoom={introZoom}
            />
          </Suspense>
        </Canvas>
      </div>
    </CanvasErrorBoundary>
  );
}
