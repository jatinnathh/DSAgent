import sys
import re

print("Updating app/page.tsx")
with open("app/page.tsx", "r", encoding="utf-8") as f:
    ts_content = f.read()

ts_content = ts_content.replace('import { Float, Stars } from "@react-three/drei";\n', "")

pattern_hero = re.compile(r"function ParticleNetwork\(\) \{.*?function HeroScene\(\) \{.*?\}\n", re.DOTALL)
new_hero = """function NeuralFluxField() {
  const ref = React.useRef<THREE.Points>(null);
  const count = 800;

  const positions = React.useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = t * Math.PI * 8;
      const radius = 1.5 + Math.sin(t * 6) * 0.6;

      arr[i * 3] = Math.cos(angle) * radius;
      arr[i * 3 + 1] = Math.sin(angle) * radius;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!ref.current) return;

    const pos = ref.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      pos[i * 3 + 2] = Math.sin(t + i * 0.02) * 0.8;
    }

    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color="#C4B5FD"
        transparent
        opacity={0.4}
      />
    </points>
  );
}

function IntelligenceCore() {
  const ref = React.useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!ref.current) return;

    ref.current.rotation.y = t * 0.3;
    ref.current.rotation.x = Math.sin(t * 0.4) * 0.2;

    const scale = 1 + Math.sin(t * 1.2) * 0.08;
    ref.current.scale.set(scale, scale, scale);
  });

  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1.6, 4]} />
      <meshStandardMaterial
        color="#ffffff"
        wireframe
        transparent
        opacity={0.06}
      />
    </mesh>
  );
}

function HeroScene() {
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 60 }} style={{ background: "transparent", pointerEvents: "none" }}>
      <ambientLight intensity={0.2} />
      <pointLight position={[3, 3, 3]} intensity={1.2} color="#A78BFA" />
      <pointLight position={[-3, -2, 2]} intensity={0.6} color="#F59E0B" />

      <NeuralFluxField />
      <IntelligenceCore />
    </Canvas>
  );
}
"""
ts_content = pattern_hero.sub(new_hero, ts_content)

pattern_pipeline = re.compile(r"function RotatingCube\(\) \{.*?function DiamondShape\(\) \{.*?\}\n", re.DOTALL)
new_pipeline = """function AbstractNodeOne() {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y += 0.01;
    ref.current.rotation.x += 0.005;
    const t = clock.elapsedTime;
    ref.current.scale.set(1 + Math.sin(t * 1.5) * 0.1, 1, 1 + Math.cos(t * 1.5) * 0.1);
  });
  return (
    <mesh ref={ref}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#A78BFA" wireframe transparent opacity={0.2} />
    </mesh>
  );
}

function AbstractNodeTwo() {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y += 0.015;
    const t = clock.elapsedTime;
    const scale = 1 + Math.sin(t * 2) * 0.15;
    ref.current.scale.set(scale, scale, scale);
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#F59E0B" wireframe transparent opacity={0.2} />
    </mesh>
  );
}

function AbstractNodeThree() {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z += 0.01;
    ref.current.rotation.x += 0.01;
    const t = clock.elapsedTime;
    ref.current.scale.set(1, 1 + Math.cos(t) * 0.1, 1);
  });
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#14B8A6" wireframe transparent opacity={0.2} />
    </mesh>
  );
}

function AbstractNodeFour() {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y -= 0.01;
    const t = clock.elapsedTime;
    ref.current.scale.set(1 + Math.sin(t * 1.2) * 0.1, 1 + Math.cos(t * 1.2) * 0.1, 1);
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1, 2]} />
      <meshStandardMaterial color="#A78BFA" wireframe transparent opacity={0.2} />
    </mesh>
  );
}

function AbstractNodeFive() {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.x -= 0.015;
    ref.current.rotation.y += 0.01;
    const t = clock.elapsedTime;
    const scale = 1 + Math.cos(t * 1.8) * 0.12;
    ref.current.scale.set(scale, scale, scale);
  });
  return (
    <mesh ref={ref}>
      <dodecahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#ffffff" wireframe transparent opacity={0.2} />
    </mesh>
  );
}
"""
ts_content = pattern_pipeline.sub(new_pipeline, ts_content)

pattern_barchart = re.compile(r"function BarChart3D\(\) \{.*?\}\n", re.DOTALL)
new_barchart = """function BarChart3D() {
  const bars = [
    { height: 2.0, color: "#A78BFA" },
    { height: 1.4, color: "#F59E0B" },
    { height: 1.1, color: "#14B8A6" },
    { height: 0.8, color: "#8B5CF6" },
    { height: 0.5, color: "#A78BFA" },
  ];
  return (
    <Canvas
      camera={{ position: [3, 2, 4], fov: 45 }}
      style={{ background: "transparent", height: 200 }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={0.8} />
      <group position={[0, -0.5, 0]}>
        {bars.map((bar, i) => (
          <BarMesh key={i} bar={bar} index={i} />
        ))}
      </group>
    </Canvas>
  );
}

function BarMesh({ bar, index }: { bar: { height: number; color: string }, index: number }) {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = bar.height / 2 + Math.sin(clock.elapsedTime * 2 + index) * 0.05;
  });
  return (
    <mesh ref={ref} position={[index * 0.8 - 1.6, bar.height / 2, 0]}>
      <boxGeometry args={[0.5, bar.height, 0.5]} />
      <meshStandardMaterial color={bar.color} transparent opacity={0.6} />
    </mesh>
  );
}
"""
ts_content = pattern_barchart.sub(new_barchart, ts_content)

ts_content = ts_content.replace("Shape: RotatingCube", "Shape: AbstractNodeOne")
ts_content = ts_content.replace("Shape: FunnelShape", "Shape: AbstractNodeTwo")
ts_content = ts_content.replace("Shape: GearShape", "Shape: AbstractNodeThree")
ts_content = ts_content.replace("Shape: NeuralSphere", "Shape: AbstractNodeFour")
ts_content = ts_content.replace("Shape: DiamondShape", "Shape: AbstractNodeFive")
ts_content = ts_content.replace('color="#00D4FF"', 'color="#A78BFA"')

with open("app/page.tsx", "w", encoding="utf-8") as f:
    f.write(ts_content)

print("Updating app/globals.css")
with open("app/globals.css", "r", encoding="utf-8") as f:
    css = f.read()

# Replace root variables
css = css.replace("--cyan: #00D4FF;", "--accent-primary: #A78BFA;\\n  --accent-warm: #F59E0B;\\n  --accent-cool: #14B8A6;")
css = css.replace("--cyan-light: #7AEAFF;", "")
css = css.replace("--cyan: #0099BB;", "--accent-primary: #8B5CF6;\\n  --accent-warm: #D97706;\\n  --accent-cool: #0D9488;")
css = css.replace("--cyan-light: #00BCD4;", "")

css = css.replace("var(--cyan)", "var(--accent-primary)")
css = css.replace("var(--cyan-light)", "var(--accent-primary)")

# Hero title fixes
css = re.sub(r"\.hero-title \{(.*?)\} \n", r".hero-title {\\n  background: linear-gradient(120deg, #ffffff 0%, #A78BFA 40%, #F59E0B 100%);\\n}\\n", css, flags=re.DOTALL)
# A safer way to replace just the gradient line inside .hero-title
css = css.replace("background: linear-gradient(135deg, #ffffff 0%, var(--accent-primary) 50%, var(--violet) 100%);", "background: linear-gradient(120deg, #ffffff 0%, #A78BFA 40%, #F59E0B 100%);")
css = css.replace("background: linear-gradient(135deg, #0F172A 0%, var(--accent-primary) 50%, var(--violet) 100%);", "background: linear-gradient(120deg, #0F172A 0%, #A78BFA 40%, #F59E0B 100%);")


liquid_glass_pattern = re.compile(r"\.liquid-glass \{.*?\}\n\n\[data-theme=\"light\"\] \.liquid-glass \{.*?\}\n\n\.liquid-glass::before \{.*?\}\n\n\.liquid-glass::after \{.*?\}\n", re.DOTALL)

# Sometimes there's hover too, let's just find exactly what we need to rip out and replace
# We will just replace liquid-glass class blocks using regex
css = re.sub(r"\.liquid-glass \{.*?\}", """.liquid-glass {
  position: relative;
  background: rgba(255,255,255,0.035);
  backdrop-filter: blur(28px) saturate(180%);
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
}""", css, count=1, flags=re.DOTALL)

css = re.sub(r"\.liquid-glass::before \{.*?\}", """.liquid-glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    120deg,
    rgba(167,139,250,0.4),
    rgba(245,158,11,0.3),
    transparent
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}""", css, count=1, flags=re.DOTALL)

with open("app/globals.css", "w", encoding="utf-8") as f:
    f.write(css)

print("Done")
