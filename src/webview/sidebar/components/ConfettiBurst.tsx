import React, { useEffect, useRef } from "react";

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
}

const DURATION_MS = 2800;
const GRAVITY = 0.42;
const N_PIECES = 72;

function randomColor(): string {
  const hues = [200, 210, 280, 320, 35, 145, 185];
  const h = hues[Math.floor(Math.random() * hues.length)] + Math.floor(Math.random() * 18) - 9;
  return `hsl(${Math.max(0, Math.min(360, h))}deg, ${72 + Math.floor(Math.random() * 20)}%, ${52 + Math.floor(Math.random() * 15)}%)`;
}

/**
 * Full-viewport confetti burst (sidebar webview). Fires once per `tick` change.
 */
export function ConfettiBurst({ tick }: { tick: number }): React.ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    resize();

    const originX = window.innerWidth / 2;
    const originY = window.innerHeight * 0.28;

    const pieces: Piece[] = [];
    for (let i = 0; i < N_PIECES; i++) {
      const angle = (Math.PI * 2 * i) / N_PIECES + (Math.random() - 0.5) * 0.8;
      const speed = 6 + Math.random() * 10;
      pieces.push({
        x: originX + (Math.random() - 0.5) * 24,
        y: originY + (Math.random() - 0.5) * 16,
        vx: Math.cos(angle) * speed * (0.7 + Math.random() * 0.5),
        vy: Math.sin(angle) * speed * 0.55 - 10 - Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.35,
        w: 5 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        color: randomColor(),
      });
    }

    const start = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const t = now - start;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (const p of pieces) {
        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.vx *= 0.995;

        const alpha = t < DURATION_MS - 400 ? 1 : Math.max(0, 1 - (t - (DURATION_MS - 400)) / 400);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (t < DURATION_MS) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };

    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [tick]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10_000,
      }}
    />
  );
}
