// app/components/StarfieldBg.tsx
"use client";

import { useEffect, useRef } from "react";

/**
 * Pure canvas starfield — matches the landing page vibe.
 * Drop it as a fixed/absolute background anywhere.
 */
export default function StarfieldBg({
  count = 220,
  fixed = false,
}: {
  count?: number;
  fixed?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    // Generate stars once
    const makeStars = (w: number, h: number) =>
      Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 0.9 + 0.2,
        alpha: Math.random() * 0.55 + 0.08,
        speed: Math.random() * 0.006 + 0.002, // twinkle speed
        phase: Math.random() * Math.PI * 2,
      }));

    let stars = makeStars(canvas.offsetWidth, canvas.offsetHeight);

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      stars = makeStars(canvas.offsetWidth, canvas.offsetHeight);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let t = 0;
    const draw = () => {
      t += 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        const twinkle = s.alpha * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${twinkle.toFixed(3)})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: fixed ? "fixed" : "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        display: "block",
      }}
    />
  );
}
