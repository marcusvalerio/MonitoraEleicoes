"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { fmtDuration, wallClock } from "@/lib/format";

// Rampa sequencial (azul) — um matiz, claro→escuro invertido para fundo escuro.
const RAMP = ["#172233", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#86b6ef"];

/** Intensidade (segundos de fala) por tema × janela de tempo. */
export function Heatmap({ rows, grid, windowSize, startsAt, currentWindow }: { rows: { id: string; label: string }[]; grid: number[][]; windowSize: number; startsAt: string; currentWindow?: number }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const cols = grid[0]?.length ?? 0;
  const color = (v: number) => (v <= 0 ? "transparent" : RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1)) + 1)]);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `120px repeat(${cols}, minmax(0,1fr))` }}>
          <span />
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className={cn("tnum pb-1 text-center text-[10px] text-fg-3", currentWindow === c && "text-neg")}>
              {wallClock(startsAt, c * windowSize, false)}
            </span>
          ))}
          {rows.map((row, r) => (
            <div key={row.id} className="contents">
              <span className={cn("truncate pr-2 text-[12px] leading-6", hover?.r === r ? "text-fg" : "text-fg-2")}>{row.label}</span>
              {grid[r].map((v, c) => (
                <div
                  key={c}
                  onMouseEnter={() => setHover({ r, c })}
                  onMouseLeave={() => setHover(null)}
                  className={cn("relative h-6 rounded-[3px] border", v ? "border-transparent" : "border-border/60", hover?.r === r && hover.c === c && "ring-2 ring-fg/70")}
                  style={{ background: color(v) }}
                >
                  {hover?.r === r && hover.c === c && (
                    <div role="tooltip" className={cn("absolute bottom-full z-10 mb-1.5 rounded-[var(--radius-md)] border border-border-strong bg-elevated px-2 py-1 text-[11.5px] whitespace-nowrap text-fg shadow-xl", c > cols / 2 ? "right-0" : "left-0")}>
                      <div className="font-medium">{row.label}</div>
                      <div className="text-fg-3 tnum">
                        {wallClock(startsAt, c * windowSize, false)}–{wallClock(startsAt, (c + 1) * windowSize, false)} · {v ? `${fmtDuration(v)} de fala` : "sem falas"}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-fg-3">
          <span>Menos</span>
          <div className="flex gap-[2px]">
            {RAMP.slice(1).map((c) => (
              <span key={c} className="h-2 w-4 rounded-[2px]" style={{ background: c }} />
            ))}
          </div>
          <span>Mais tempo de fala · janelas de {windowSize / 60} min</span>
        </div>
      </div>
    </div>
  );
}
