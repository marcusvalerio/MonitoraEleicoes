"use client";
import { useMemo, useState } from "react";
import { fmtBRL, fmtDateBR } from "@/evaluation/model";

type Point = { start: string; cents: number };
const LABEL = { day: "Diário", week: "Semanal", month: "Mensal" } as const;

/**
 * INVESTIMENTO AO LONGO DO TEMPO — somente valores REGISTRADOS (uma série ⇒ sem legenda; o título nomeia).
 * Barras finas com 2px de respiro, topo arredondado, grade recessiva, tooltip por barra e tabela acessível.
 */
export function TimelineChart({ series }: { series: Record<keyof typeof LABEL, Point[]> }) {
  const [g, setG] = useState<keyof typeof LABEL>(series.day.length > 60 ? "week" : "day");
  const [hover, setHover] = useState<number | null>(null);
  const data = series[g];
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.cents)), [data]);
  const W = 720, H = 220, P = { l: 56, r: 8, t: 12, b: 26 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const bw = data.length ? iw / data.length : 0;
  const ticks = [0, 0.5, 1].map((k) => k * max);
  const label = (s: string) => (g === "month" ? `${s.slice(5, 7)}/${s.slice(0, 4)}` : fmtDateBR(s).slice(0, 5));
  return (
    <figure data-testid="evaluation-timeline">
      <div className="mb-3 flex items-center justify-between gap-2">
        <figcaption className="font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-[0.16em] text-fg-3">INVESTIMENTO AO LONGO DO TEMPO</figcaption>
        <div role="radiogroup" aria-label="Agregação" className="flex rounded-[8px] border border-border p-0.5 text-[11.5px]">
          {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={g === k} onClick={() => setG(k)} className={`h-7 rounded-[6px] px-2.5 ${g === k ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg-2"}`}>{LABEL[k]}</button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-[12.5px] text-fg-3">Nenhum investimento registrado no período selecionado.</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Investimento registrado por período (${LABEL[g].toLowerCase()})`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => {
              const y = P.t + ih - (t / max) * ih;
              return (
                <g key={t}>
                  <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="currentColor" className="text-border" strokeWidth={1} />
                  <text x={P.l - 8} y={y + 3.5} textAnchor="end" className="fill-fg-3 text-[10px]">{fmtBRL(t, { compact: true })}</text>
                </g>
              );
            })}
            {data.map((d, k) => {
              const h = (d.cents / max) * ih;
              const x = P.l + k * bw + Math.min(1, bw / 4);
              const w = Math.max(1, bw - 2);
              const r = Math.min(4, w / 2, h);
              const y = P.t + ih - h;
              return (
                <g key={d.start} onMouseEnter={() => setHover(k)}>
                  <rect x={P.l + k * bw} y={P.t} width={bw} height={ih} fill="transparent" />
                  {h > 0 && <path d={`M${x},${y + ih * 0 + h + 0} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`} fill="#3987e5" opacity={hover === null || hover === k ? 1 : 0.45} />}
                </g>
              );
            })}
            {[0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((k) => (
              <text key={k} x={P.l + k * bw + bw / 2} y={H - 8} textAnchor="middle" className="fill-fg-3 text-[10px]">{label(data[k].start)}</text>
            ))}
          </svg>
          {hover !== null && data[hover] && (
            <div className="pointer-events-none absolute top-0 rounded-[8px] border border-border bg-surface/95 px-2.5 py-1.5 text-[12px] shadow-xl" style={{ left: `${Math.min(80, ((P.l + hover * bw) / W) * 100)}%` }} role="status">
              <span className="block text-fg-3">{g === "week" ? `semana de ${fmtDateBR(data[hover].start)}` : g === "month" ? label(data[hover].start) : fmtDateBR(data[hover].start)}</span>
              <span className="font-[family-name:var(--font-num)] text-[14px] font-semibold text-fg">{fmtBRL(data[hover].cents)}</span>
            </div>
          )}
          <details className="mt-2 text-[11.5px] text-fg-3">
            <summary className="cursor-pointer hover:text-fg-2">Ver tabela</summary>
            <table className="mt-2 w-full text-left tabular-nums"><tbody>{data.filter((d) => d.cents > 0).map((d) => <tr key={d.start} className="border-t border-border"><td className="py-1">{fmtDateBR(d.start)}</td><td className="py-1 text-right text-fg-2">{fmtBRL(d.cents)}</td></tr>)}</tbody></table>
          </details>
        </div>
      )}
    </figure>
  );
}
