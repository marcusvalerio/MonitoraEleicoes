"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { fmtInt } from "@/lib/format";

export interface ExteriorCity {
  key: string;
  name: string;
  lat: number | null;
  lon: number | null;
  validVotes: number | null;
  leader: { name: string; pct: number | null; color: string } | null;
}

const R = 150;
const rad = Math.PI / 180;
/** Projeção ortográfica (globo) centrada em lon0/lat0; retorna null para o hemisfério oculto. */
function ortho(lat: number, lon: number, lon0: number, lat0: number) {
  const φ = lat * rad, λ = (lon - lon0) * rad, φ0 = lat0 * rad;
  const cosc = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ);
  if (cosc < 0) return null;
  return { x: R * Math.cos(φ) * Math.sin(λ), y: -R * (Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ)), depth: cosc };
}

/**
 * Votos no exterior: globo de pontos que gira devagar (arrastável). Cada ponto é uma cidade com seção eleitoral do TSE;
 * posição pela tabela de coordenadas (cidade sem coordenada conhecida fica só na lista — nunca posição inventada).
 */
export function ExteriorGlobe({ cities, total }: { cities: ExteriorCity[]; total: { validVotes: number | null; leader: ExteriorCity["leader"]; countedPct: number | null } | null }) {
  const [lon0, setLon0] = useState(-30);
  const drag = useRef<{ x: number; lon: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const placed = cities.filter((c) => c.lat !== null && c.lon !== null);
  const max = Math.max(1, ...cities.map((c) => c.validVotes ?? 0));
  const ranked = [...cities].sort((a, b) => (b.validVotes ?? -1) - (a.validVotes ?? -1));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    let on = true;
    const io = new IntersectionObserver(([e]) => (on = e.isIntersecting));
    const el = document.getElementById("exterior-globe");
    if (el) io.observe(el);
    const tick = (t: number) => {
      if (on && !drag.current && !active) setLon0((l) => l + ((t - last) / 1000) * 6);
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [active]);

  const grat: string[] = [];
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 5) {
      const p = ortho(lat, lon, lon0, 12);
      if (p) pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    if (pts.length > 1) grat.push(`M${pts.join("L")}`);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 5) {
      const p = ortho(lat, lon, lon0, 12);
      pts.push(p ? `${p.x.toFixed(1)},${p.y.toFixed(1)}` : null);
    }
    let seg: string[] = [];
    for (const p of [...pts, null]) {
      if (p) seg.push(p);
      else if (seg.length > 1) {
        grat.push(`M${seg.join("L")}`);
        seg = [];
      } else seg = [];
    }
  }
  const br = ortho(-15.8, -47.9, lon0, 12);

  return (
    <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" data-testid="exterior-globe">
      <div id="exterior-globe" className="relative mx-auto aspect-square w-full max-w-[420px] touch-pan-y select-none"
        onPointerDown={(e) => (drag.current = { x: e.clientX, lon: lon0 })}
        onPointerMove={(e) => drag.current && setLon0(drag.current.lon - (e.clientX - drag.current.x) * 0.4)}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}>
        <svg viewBox="-170 -170 340 340" className="size-full" aria-label="Globo com as cidades do exterior onde houve votação">
          <defs>
            <radialGradient id="globe-fill" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#1a2233" />
              <stop offset="70%" stopColor="#0e1118" />
              <stop offset="100%" stopColor="#0a0a0b" />
            </radialGradient>
            <radialGradient id="globe-glow" r="50%">
              <stop offset="80%" stopColor="#3987e5" stopOpacity="0" />
              <stop offset="100%" stopColor="#3987e5" stopOpacity="0.18" />
            </radialGradient>
          </defs>
          <circle r={R + 14} fill="url(#globe-glow)" />
          <circle r={R} fill="url(#globe-fill)" stroke="#252a36" />
          <path d={grat.join("")} fill="none" stroke="#232a38" strokeWidth="0.7" />
          {br && (
            <g transform={`translate(${br.x},${br.y})`} opacity={0.4 + br.depth * 0.6}>
              <circle r="3" fill="#f2f2f0" />
              <text x="6" y="3" fontSize="8" fill="#a4a4a8">Brasil</text>
            </g>
          )}
          {placed
            .map((c) => ({ c, p: ortho(c.lat!, c.lon!, lon0, 12) }))
            .filter((x) => x.p)
            .sort((a, b) => a.p!.depth - b.p!.depth)
            .map(({ c, p }) => {
              const r = 2 + Math.sqrt((c.validVotes ?? 0) / max) * 11;
              const col = c.leader?.color ?? "#68686e";
              return (
                <g key={c.key} transform={`translate(${p!.x},${p!.y})`} opacity={0.35 + p!.depth * 0.65} onPointerEnter={() => setActive(c.key)} onPointerLeave={() => setActive(null)} className="cursor-pointer">
                  <circle r={r * 2.2} fill={col} opacity="0.12" className="motion-safe:animate-[pulse-dot_2.8s_ease-in-out_infinite]" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
                  <circle r={r} fill={col} stroke={active === c.key ? "#f2f2f0" : "none"} strokeWidth="1.2" />
                  {(active === c.key || r > 9) && <text y={-r - 4} textAnchor="middle" fontSize="8.5" fill="#f2f2f0">{c.name}</text>}
                </g>
              );
            })}
        </svg>
      </div>

      <div>
        {total && (
          <div className="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface/60 p-4">
            <p className="text-[11px] tracking-[0.12em] text-fg-3 uppercase">Exterior · total</p>
            <p className="mt-1 font-[family-name:var(--font-num)] text-[26px] font-semibold text-fg tabular-nums">{total.validVotes === null ? "—" : fmtInt(total.validVotes)} <span className="text-[12px] font-normal text-fg-3">votos válidos</span></p>
            {total.leader && (
              <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-fg-2">
                <span className="size-2 rounded-full" style={{ background: total.leader.color }} aria-hidden />
                à frente: {total.leader.name} {total.leader.pct !== null && `· ${total.leader.pct.toFixed(1).replace(".", ",")}%`}
              </p>
            )}
            {total.countedPct !== null && <p className="mt-1 text-[11px] text-fg-3">{total.countedPct.toFixed(1).replace(".", ",")}% das seções do exterior</p>}
          </div>
        )}
        {ranked.length ? (
          <ol className="max-h-[320px] space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {ranked.map((c, i) => (
              <motion.li key={c.key} initial={{ opacity: 0, x: 8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 12) * 0.03 }}
                onPointerEnter={() => setActive(c.key)} onPointerLeave={() => setActive(null)}
                className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-[4px] px-2 py-1.5 text-[12.5px] ${active === c.key ? "bg-elevated" : ""}`}>
                <span className="text-right text-[11px] text-fg-3 tabular-nums">{i + 1}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 truncate text-fg-2">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.leader?.color ?? "#68686e" }} aria-hidden />
                    {c.name}
                    {c.lat === null && <span className="text-[10px] text-fg-3">· sem coordenada</span>}
                  </span>
                </span>
                <span className="font-[family-name:var(--font-num)] text-fg tabular-nums">{c.validVotes === null ? "—" : fmtInt(c.validVotes)}</span>
              </motion.li>
            ))}
          </ol>
        ) : (
          <p className="text-[12.5px] text-fg-3">Resultados por cidade do exterior ainda não coletados.</p>
        )}
      </div>
    </div>
  );
}
