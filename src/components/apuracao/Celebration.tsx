"use client";

import { useEffect, useRef } from "react";

/**
 * Celebração discreta de resultado OFICIAL (eleito pelo TSE): poucas partículas douradas por ~1,4 s, uma vez por
 * sessão e candidatura. Desativada com prefers-reduced-motion. Nada é exibido para quem não foi eleito.
 */
export function Celebration({ seed }: { seed: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const k = `monitora:celebrou:${seed}`;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {
      /* sem sessionStorage: anima mesmo assim */
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = (c.width = 160);
    const H = (c.height = 160);
    const parts = Array.from({ length: 26 }, (_, i) => ({ a: (i / 26) * Math.PI * 2, v: 0.9 + ((i * 37) % 10) / 12, r: 1 + (i % 3) * 0.6, hue: i % 3 }));
    const colors = ["#e7c35a", "#f5f1e3", "#4cb782"];
    const t0 = performance.now();
    let raf = 0;
    const draw = (t: number) => {
      const k2 = (t - t0) / 1400;
      ctx.clearRect(0, 0, W, H);
      if (k2 >= 1) return;
      for (const p of parts) {
        const d = 14 + p.v * 52 * Math.sin((Math.min(1, k2) * Math.PI) / 2);
        ctx.globalAlpha = 1 - k2;
        ctx.fillStyle = colors[p.hue];
        ctx.beginPath();
        ctx.arc(W / 2 + Math.cos(p.a) * d, H / 2 + Math.sin(p.a) * d + k2 * 10, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [seed]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-[160px] -translate-x-1/2 -translate-y-1/2" />;
}
