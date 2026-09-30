"use client";

import { useMemo, useState } from "react";
import { fmtInt } from "@/lib/format";
import { colorFor } from "./palette";

export interface SeriesPoint {
  t: string;
  key: string;
  count: number;
}

const fmtBucket = (iso: string, bucket: string) =>
  new Date(iso).toLocaleString("pt-BR", bucket === "hour" ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" } : { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/**
 * Volume ao longo do tempo (um eixo; contagem de conteúdos). Séries selecionáveis pela legenda; cor = entidade (fixa).
 * Hover: linha vertical + tooltip com todas as séries. Alternativa acessível: tabela.
 * Buckets sem ponto = sem conteúdos coletados naquele intervalo dentro das janelas coletadas (a cobertura é mostrada à parte).
 */
export function SeriesChart({ points, labels, colors, bucket, height = 240 }: { points: SeriesPoint[]; labels?: Record<string, string>; colors?: Record<string, string>; bucket: string; height?: number }) {
  const keys = useMemo(() => {
    const tot = new Map<string, number>();
    for (const p of points) tot.set(p.key, (tot.get(p.key) ?? 0) + p.count);
    const sorted = [...tot.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return sorted.slice(0, 7); // no máximo 7 séries (paleta fixa); o resto não é recolorido
  }, [points]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const times = [...new Set(points.map((p) => p.t))].sort();
  const val = (k: string, t: string) => points.find((p) => p.key === k && p.t === t)?.count ?? 0;
  const visible = keys.filter((k) => !hidden.has(k));
  const max = Math.max(1, ...times.flatMap((t) => visible.map((k) => val(k, t))));
  const W = 1000;
  const H = height;
  const pad = { l: 44, r: 12, t: 10, b: 24 };
  const x = (i: number) => pad.l + (times.length <= 1 ? (W - pad.l - pad.r) / 2 : (i / (times.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const name = (k: string) => labels?.[k] ?? k;
  if (!times.length) return <p className="py-8 text-center text-[12.5px] text-fg-3">Sem conteúdos no período para os filtros selecionados.</p>;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  return (
    <div data-testid="series-chart">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
        {keys.length > 1 &&
          keys.map((k) => (
            <button key={k} type="button" onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; })} className={`inline-flex items-center gap-1.5 ${hidden.has(k) ? "text-fg-3 line-through" : "text-fg-2"}`} aria-pressed={!hidden.has(k)}>
              <span className="h-0.5 w-3 rounded" style={{ background: colorFor(k, colors) }} aria-hidden />
              {name(k)}
            </button>
          ))}
        <button type="button" className="ml-auto text-fg-3 hover:text-fg" onClick={() => setTable((v) => !v)}>
          {table ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full font-[family-name:var(--font-data)] text-[12px]">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 pr-2 font-normal">Intervalo</th>
                {visible.map((k) => (
                  <th key={k} className="px-2 py-1 text-right font-normal">
                    {name(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((t) => (
                <tr key={t} className="border-t border-border/60">
                  <td className="py-1 pr-2 text-fg-2 tnum">{fmtBucket(t, bucket)}</td>
                  {visible.map((k) => (
                    <td key={k} className="px-2 py-1 text-right text-fg tnum">
                      {fmtInt(val(k, t))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Volume de conteúdos ao longo do tempo" onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = ((e.clientX - r.left) / r.width) * W;
              let best = 0;
              times.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
              setHover(best);
            }}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v ? "2 4" : undefined} />
                <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="fill-fg-3 text-[11px]">{fmtInt(v)}</text>
              </g>
            ))}
            {[0, Math.floor((times.length - 1) / 2), times.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-fg-3 text-[11px]">{fmtBucket(times[i], bucket)}</text>
            ))}
            {visible.map((k) => (
              <polyline key={k} fill="none" stroke={colorFor(k, colors)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={times.map((t, i) => `${x(i)},${y(val(k, t))}`).join(" ")} />
            ))}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="stroke-fg-3" />
                {visible.map((k) => <circle key={k} cx={x(hover)} cy={y(val(k, times[hover]))} r={4} fill={colorFor(k, colors)} stroke="#111113" strokeWidth={2} />)}
              </g>
            )}
          </svg>
          {hover !== null && (
            <div className="pointer-events-none absolute top-2 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5 text-[12px] shadow-lg" style={{ left: `${Math.min(80, (x(hover) / W) * 100)}%` }} data-testid="series-tooltip">
              <p className="text-fg-3 tnum">{fmtBucket(times[hover], bucket)}</p>
              {visible.map((k) => (
                <p key={k} className="flex items-center gap-2 text-fg-2">
                  <span className="size-2 rounded-full" style={{ background: colorFor(k, colors) }} aria-hidden />
                  {name(k)} <span className="ml-auto text-fg tnum">{fmtInt(val(k, times[hover]))}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
