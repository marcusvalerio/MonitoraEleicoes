"use client";

import { motion } from "motion/react";
import type { TimelinePoint } from "@/analytics/turnos";

const f = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/**
 * "Ao longo da apuração": % oficial dos válidos de cada finalista em função das seções apuradas (eixo x = % apurado).
 * Cada ponto é um arquivo do TSE efetivamente coletado; trechos sem coleta ficam como reta entre os pontos reais.
 */
export function CountTimeline({ points, series }: { points: TimelinePoint[]; series: { number: string; name: string; color: string }[] }) {
  if (points.length < 2) return <p className="text-[12px] text-fg-3">Histórico insuficiente: menos de dois arquivos coletados neste turno.</p>;
  const W = 600, H = 300, P = 34;
  const vals = points.flatMap((p) => series.map((s) => p.pct[s.number]).filter((v): v is number => v !== undefined));
  const lo = Math.floor(Math.min(45, ...vals) - 1), hi = Math.ceil(Math.max(55, ...vals) + 1);
  const x = (c: number) => P + (c / 100) * (W - 2 * P - 46);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const last = points[points.length - 1];
  return (
    <figure data-testid="count-timeline">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evolução do percentual dos finalistas ao longo da apuração">
        {[0, 25, 50, 75, 100].map((c) => (
          <g key={c}>
            <line x1={x(c)} x2={x(c)} y1={P / 2} y2={H - P} stroke="currentColor" className="text-border" />
            <text x={x(c)} y={H - 8} textAnchor="middle" className="fill-fg-3 text-[15px]">{c}%</text>
          </g>
        ))}
        <line x1={P} x2={W - P} y1={y(50)} y2={y(50)} stroke="currentColor" strokeDasharray="4 4" className="text-fg-3" />
        <text x={P + 4} y={y(50) - 6} className="fill-fg-3 text-[14px]">50%</text>
        {series.map((s) => {
          const pts = points.filter((p) => p.pct[s.number] !== undefined);
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.counted).toFixed(1)},${y(p.pct[s.number]).toFixed(1)}`).join("");
          const end = pts[pts.length - 1];
          return (
            <g key={s.number}>
              <motion.path d={d} fill="none" stroke={s.color} strokeWidth={3.5} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: "easeOut" }} />
              {end && <circle cx={x(end.counted)} cy={y(end.pct[s.number])} r={6} fill={s.color} stroke="#fff" strokeWidth={2} />}
              {end && <text x={x(end.counted) + 10} y={y(end.pct[s.number]) + (end.pct[s.number] >= 50 ? -4 : 16)} className="text-[16px] font-bold" fill={s.color}>{f(end.pct[s.number])}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-fg-3">
        {series.map((s) => <span key={s.number} className="inline-flex items-center gap-1"><span className="h-0.5 w-3" style={{ background: s.color }} />{s.name}</span>)}
        <span className="basis-full">Eixo horizontal = % das seções apuradas · {points.length} arquivos oficiais do TSE · último com {last.counted.toFixed(2).replace(".", ",")}%</span>
      </figcaption>
    </figure>
  );
}
