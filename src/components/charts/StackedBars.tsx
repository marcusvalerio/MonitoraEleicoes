"use client";

import { useState } from "react";
import { Legend } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export interface StackRow {
  id: string;
  label: string;
  values: Record<string, number>;
}
export interface StackKey {
  id: string;
  label: string;
  color: string;
}

/** Barras empilhadas 100% para composição. Gap de 2px entre segmentos; legenda sempre presente. */
export function StackedBars({ rows, keys, normalize = true }: { rows: StackRow[]; keys: StackKey[]; normalize?: boolean }) {
  const [hover, setHover] = useState<{ row: string; key: string } | null>(null);
  const globalMax = Math.max(1, ...rows.map((r) => keys.reduce((a, k) => a + (r.values[k.id] ?? 0), 0)));
  return (
    <div className="space-y-3">
      <Legend items={keys.map((k) => ({ label: k.label, color: k.color }))} />
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const total = keys.reduce((a, k) => a + (r.values[k.id] ?? 0), 0);
          const denom = normalize ? total || 1 : globalMax;
          return (
            <li key={r.id} className="grid grid-cols-[minmax(92px,120px)_1fr_36px] items-center gap-3">
              <span className="truncate text-[12.5px] text-fg-2">{r.label}</span>
              <div className="flex h-5 gap-[2px]" role="img" aria-label={`${r.label}: ${keys.map((k) => `${k.label} ${r.values[k.id] ?? 0}`).join(", ")}`}>
                {keys.map((k) => {
                  const v = r.values[k.id] ?? 0;
                  if (!v) return null;
                  const on = hover?.row === r.id && hover.key === k.id;
                  const dim = hover && !on;
                  return (
                    <div
                      key={k.id}
                      onMouseEnter={() => setHover({ row: r.id, key: k.id })}
                      onMouseLeave={() => setHover(null)}
                      className={cn("relative flex items-center justify-center first:rounded-l-[4px] last:rounded-r-[4px] transition-opacity", dim && "opacity-40")}
                      style={{ width: `${(v / denom) * 100}%`, background: k.color }}
                    >
                      {(v / denom) * 100 > 9 && <span className="tnum text-[10.5px] font-semibold text-bg">{v}</span>}
                      {on && (
                        <div role="tooltip" className="absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-[var(--radius-md)] border border-border-strong bg-elevated px-2 py-1 text-[11.5px] whitespace-nowrap text-fg shadow-xl">
                          {r.label} · {k.label}: <span className="tnum font-medium">{v}</span>
                          <span className="text-fg-3"> ({Math.round((v / (total || 1)) * 100)}%)</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="tnum text-right text-[12px] text-fg-3">{total}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
