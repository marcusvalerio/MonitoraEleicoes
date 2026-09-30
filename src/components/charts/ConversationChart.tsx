"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useWidth } from "./useWidth";
import { fmtInt, wallClock } from "@/lib/format";
import { TOPIC_LABEL } from "@/domain/labels";
import type { TopicId } from "@/domain/types";
import { cn } from "@/lib/cn";

export interface Annotation {
  t: number;
  label: string;
  sub?: string;
  code: string;
  kind: "spike" | "topic" | "mention" | "flag";
}

/**
 * Gráfico protagonista: volume de publicações por minuto + faixa de temas do debate
 * + anotações diretas dos eventos. Um eixo; proximidade temporal ≠ causalidade.
 */
export function ConversationChart({
  series,
  startsAt,
  domainEnd: fullEnd,
  now,
  runs,
  annotations,
  height = 300,
}: {
  series: { t: number; v: number }[];
  startsAt: string;
  domainEnd: number;
  now?: number;
  runs: { topic: TopicId; start: number; end: number }[];
  annotations: Annotation[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(900);
  const [hover, setHover] = useState<number | null>(null);
  // Telas estreitas: eixo termina logo após "agora" (o restante previsto está vazio).
  const narrow = width < 640;
  const domainEnd = narrow && now !== undefined ? Math.min(fullEnd, Math.max(900, now * 1.08)) : fullEnd;
  const pad = { l: 0, r: 44, t: 58, b: 0 };
  const band = 26;
  const axis = 20;
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - band - axis - 10;
  const vmax = useMemo(() => {
    const m = Math.max(1, ...series.map((p) => p.v));
    const step = Math.pow(10, Math.floor(Math.log10(m))) / 2;
    return Math.ceil(m / step) * step;
  }, [series]);
  const x = (t: number) => pad.l + (t / domainEnd) * iw;
  const y = (v: number) => pad.t + ih - (v / vmax) * ih;
  // suavização leve (média móvel de 3) apenas para a linha de tendência
  const smooth = series.map((p, i) => ({ t: p.t, v: (series[Math.max(0, i - 1)].v + p.v + series[Math.min(series.length - 1, i + 1)].v) / 3 }));
  const path = (pts: { t: number; v: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = series.length ? `${path(series)}L${x(series.at(-1)!.t)},${y(0)}L${x(series[0].t)},${y(0)}Z` : "";
  const bandY = pad.t + ih + 8;

  // Anotações: escolhe as que cabem sem colidir (prioridade: picos > menções > temas)
  const placed = useMemo(() => {
    const prio = { spike: 0, flag: 1, mention: 2, topic: 3 } as const;
    const sorted = [...annotations].sort((a, b) => prio[a.kind] - prio[b.kind] || b.t - a.t);
    const out: (Annotation & { row: number })[] = [];
    const minGap = 118;
    for (const a of sorted) {
      for (const row of [0, 1]) {
        if (out.filter((o) => o.row === row).every((o) => Math.abs(x(o.t) - x(a.t)) > minGap)) {
          out.push({ ...a, row });
          break;
        }
      }
      if (out.length >= Math.max(2, Math.floor(iw / 95))) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, iw, domainEnd]);

  const hp = hover !== null ? series[hover] : null;
  const topicAt = (t: number) => runs.find((r) => t >= r.start && t <= r.end + 30)?.topic ?? null;
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * domainEnd;
    let best = -1;
    for (let i = 0; i < series.length; i++) if (best < 0 || Math.abs(series[i].t - t) < Math.abs(series[best].t - t)) best = i;
    setHover(best >= 0 ? best : null);
  };
  const ticks: number[] = [];
  for (let t = 0; t <= domainEnd; t += narrow ? 1800 : 900) ticks.push(t);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label="Publicações por minuto ao longo do debate, com temas e eventos">
        <defs>
          <linearGradient id="conv-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6b9cf2" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#6b9cf2" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(vmax * f)} y2={y(vmax * f)} stroke="#1f1f23" />
            <text x={pad.l + iw + 6} y={y(vmax * f) + 3} fontSize={10} className="fill-fg-3 tnum">
              {fmtInt(vmax * f)}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={pad.l + iw} y1={y(0)} y2={y(0)} stroke="#34343a" />
        <text x={pad.l + iw + 6} y={y(0) + 3} fontSize={10} className="fill-fg-3">
          /min
        </text>

        {/* anotações */}
        {placed.map((a) => {
          const ax = x(a.t);
          const ty = 12 + a.row * 22;
          const anchor = ax > iw - 110 ? "end" : "start";
          return (
            <g key={a.code}>
              <line x1={ax} x2={ax} y1={ty + 8} y2={y(0)} stroke={a.kind === "spike" ? "#6b9cf2" : "#46464d"} strokeDasharray={a.kind === "spike" ? undefined : "2 3"} strokeWidth={1} opacity={0.8} />
              <circle cx={ax} cy={ty + 8} r={2.5} fill={a.kind === "spike" ? "#6b9cf2" : "#a4a4a8"} />
              <text x={ax + (anchor === "start" ? 6 : -6)} y={ty + 4} textAnchor={anchor} fontSize={10} className="fill-fg-3 tnum font-mono">
                {wallClock(startsAt, a.t, false)}
              </text>
              <text x={ax + (anchor === "start" ? 6 : -6)} y={ty + 16} textAnchor={anchor} fontSize={11.5} className="fill-fg" fontWeight={500}>
                {a.label}
              </text>
            </g>
          );
        })}

        <path d={area} fill="url(#conv-fill)" />
        <motion.path d={path(smooth)} fill="none" stroke="#6b9cf2" strokeWidth={2} strokeLinejoin="round" initial={false} animate={{ d: path(smooth) }} transition={{ duration: 0.6 }} />

        {/* faixa de temas */}
        {runs.map((r, i) => (
          <g key={i}>
            <rect x={x(r.start)} y={bandY} width={Math.max(1, x(r.end) - x(r.start) - 2)} height={band - 8} rx={3} fill={hp && topicAt(hp.t) === r.topic ? "#f2f2f0" : i % 2 ? "#26262b" : "#303036"} />
            {x(r.end) - x(r.start) > 34 && (
              <text x={x(r.start) + 6} y={bandY + 12.5} fontSize={10.5} className={hp && topicAt(hp.t) === r.topic ? "fill-bg" : "fill-fg-2"}>
                {x(r.end) - x(r.start) > 7 * TOPIC_LABEL[r.topic].length + 12 ? TOPIC_LABEL[r.topic] : TOPIC_LABEL[r.topic].slice(0, Math.max(3, Math.floor((x(r.end) - x(r.start) - 12) / 7))) + "."}
              </text>
            )}
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={height - 4} textAnchor={t === 0 ? "start" : "middle"} fontSize={10} className="fill-fg-3 tnum">
            {wallClock(startsAt, t, false)}
          </text>
        ))}
        {now !== undefined && now < domainEnd && (
          <g>
            <line x1={x(now)} x2={x(now)} y1={pad.t - 6} y2={bandY + band - 8} stroke="#e5645f" />
            <rect x={x(now) - 1} y={pad.t - 14} width={40} height={14} rx={2} fill="#e5645f" />
            <text x={x(now) + 19} y={pad.t - 4} fontSize={9} fontWeight={700} textAnchor="middle" className="fill-bg">
              AGORA
            </text>
          </g>
        )}
        {hp && (
          <g>
            <line x1={x(hp.t)} x2={x(hp.t)} y1={pad.t} y2={bandY + band - 8} stroke="#68686e" />
            <circle cx={x(hp.t)} cy={y(hp.v)} r={4} fill="#6b9cf2" stroke="#0a0a0b" strokeWidth={2} />
          </g>
        )}
        <rect x={pad.l} y={pad.t} width={iw} height={ih + band + 8} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hp && (
        <div
          role="tooltip"
          className={cn("pointer-events-none absolute z-10 w-[220px] rounded-[var(--radius-md)] border border-border-strong bg-elevated px-3 py-2 text-[11.5px] shadow-xl")}
          style={{ left: x(hp.t) > width - 250 ? x(hp.t) - 232 : x(hp.t) + 12, top: pad.t }}
        >
          <p className="font-mono text-[11px] text-fg-3">{wallClock(startsAt, hp.t, false)}</p>
          <p className="mt-0.5 font-display text-[18px] font-semibold tnum text-fg">
            {fmtInt(hp.v)} <span className="font-sans text-[11px] font-normal text-fg-3">publicações/min</span>
          </p>
          {topicAt(hp.t) && <p className="text-fg-2">Em debate: {TOPIC_LABEL[topicAt(hp.t)!]}</p>}
          {annotations
            .filter((a) => Math.abs(a.t - hp.t) <= 120)
            .slice(0, 3)
            .map((a) => (
              <p key={a.code} className="mt-1 border-t border-border pt-1 text-fg-3">
                <span className="mr-1 font-mono text-fg-2">{a.code}</span>
                {a.label}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
