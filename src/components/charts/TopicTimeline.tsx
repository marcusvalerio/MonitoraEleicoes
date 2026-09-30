"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { fmtDuration, wallClock } from "@/lib/format";
import { TOPIC_LABEL } from "@/domain/labels";
import type { TopicId } from "@/domain/types";

export interface TopicRun {
  topic: TopicId;
  start: number;
  end: number;
  segments: number;
}

/** Sequência de temas ao longo do debate: faixa temporal + lista cronológica. */
export function TopicTimeline({ runs, startsAt, domainEnd, now, highlight }: { runs: TopicRun[]; startsAt: string; domainEnd: number; now?: number; highlight?: TopicId | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const pct = (t: number) => `${(t / domainEnd) * 100}%`;
  const hv = hover !== null ? runs[hover] : null;
  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="relative h-9 rounded-[var(--radius-md)] border border-border bg-bg">
          {runs.map((r, i) => {
            const on = hover === i || (highlight && r.topic === highlight);
            return (
              <button
                type="button"
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${TOPIC_LABEL[r.topic]}, ${wallClock(startsAt, r.start, false)}`}
                className={cn("absolute inset-y-1 overflow-hidden rounded-[3px] transition-colors", on ? "bg-fg" : i % 2 ? "bg-[#2c2c31]" : "bg-[#3a3a41]")}
                style={{ left: pct(r.start), width: `calc(${pct(r.end - r.start)} - 2px)` }}
              >
                {(r.end - r.start) / domainEnd > 0.06 && (
                  <span className={cn("block truncate px-1.5 text-left text-[10.5px] leading-7", on ? "text-bg" : "text-fg-2")}>{TOPIC_LABEL[r.topic]}</span>
                )}
              </button>
            );
          })}
          {now !== undefined && now < domainEnd && <span className="absolute -inset-y-1 w-px bg-neg" style={{ left: pct(now) }} aria-hidden />}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-fg-3 tnum">
          <span>{wallClock(startsAt, 0, false)}</span>
          <span>{wallClock(startsAt, domainEnd / 2, false)}</span>
          <span>{wallClock(startsAt, domainEnd, false)}</span>
        </div>
        {hv && (
          <div role="tooltip" className="absolute top-11 z-10 rounded-[var(--radius-md)] border border-border-strong bg-elevated px-2 py-1 text-[11.5px] shadow-xl" style={{ left: `min(${pct(hv.start)}, calc(100% - 200px))` }}>
            <span className="font-medium text-fg">{TOPIC_LABEL[hv.topic]}</span>
            <span className="ml-2 text-fg-3 tnum">
              {wallClock(startsAt, hv.start, false)} · {fmtDuration(hv.end - hv.start)} · {hv.segments} falas
            </span>
          </div>
        )}
      </div>
      <ol className="flex flex-wrap gap-x-1 gap-y-1.5 text-[12px]">
        {runs.map((r, i) => (
          <li key={i} className="flex items-center gap-1">
            <button type="button" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={cn("rounded-[var(--radius-sm)] px-1.5 py-0.5", hover === i ? "bg-elevated text-fg" : "text-fg-2")}>
              <span className="mr-1.5 font-mono text-[11px] text-fg-3">{wallClock(startsAt, r.start, false)}</span>
              {TOPIC_LABEL[r.topic]}
            </button>
            {i < runs.length - 1 && <span className="text-fg-3" aria-hidden>→</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
