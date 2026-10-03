"use client";

import { useState } from "react";
import { fmtInt } from "@/lib/format";

/** Colunas por semana (uma série, um eixo). Hover: tooltip; alternativa acessível: tabela. */
export function WeeklyBars({ data, label, height = 140 }: { data: { week: string; n: number }[]; label: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  if (!data.length) return <p className="py-6 text-center text-[12.5px] text-fg-3">Nenhum registro no recorte.</p>;
  const max = Math.max(1, ...data.map((d) => d.n));
  const fmt = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return (
    <div data-testid="weekly-bars">
      <div className="mb-1 flex justify-end">
        <button type="button" className="text-[12px] text-fg-3 hover:text-fg" onClick={() => setTable((v) => !v)}>
          {table ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {table ? (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-fg-3">
              <th className="py-1 font-normal">Semana de</th>
              <th className="py-1 text-right font-normal">{label}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.week} className="border-t border-border/60">
                <td className="py-1 text-fg-2 tnum">{fmt(d.week)}</td>
                <td className="py-1 text-right text-fg tnum">{fmtInt(d.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <div className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label={`${label} por semana`} onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <div key={d.week} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
                <div className={`w-full rounded-t-[3px] transition-colors ${hover === i ? "bg-fg" : "bg-[#3987e5]"}`} style={{ height: `${Math.max(2, (d.n / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-fg-3 tnum">
            <span>{fmt(data[0].week)}</span>
            <span>{fmt(data[data.length - 1].week)}</span>
          </div>
          {hover !== null && (
            <div className="pointer-events-none absolute -top-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-[12px] shadow-lg" style={{ left: `${Math.min(75, (hover / data.length) * 100)}%` }} data-testid="weekly-tooltip">
              <span className="text-fg-3">semana de {fmt(data[hover].week)}</span> · <span className="text-fg tnum">{fmtInt(data[hover].n)}</span> {label.toLowerCase()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
