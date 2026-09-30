"use client";

import { useMemo, useState } from "react";
import { useWidth } from "./useWidth";
import { ChartTooltip, TipRow } from "./Tooltip";
import { fmtInt, wallClock } from "@/lib/format";

export interface Marker {
  t: number;
  label: string;
  code?: string;
}

/**
 * Linha temporal de volume (uma série, um eixo). Crosshair + tooltip.
 * Marcadores de evento são exibidos como traços no topo — proximidade não implica causalidade.
 */
export function VolumeChart({
  series,
  startsAt,
  markers = [],
  height = 180,
  now,
  domainEnd,
  unit = "publicações/min",
}: {
  series: { t: number; v: number }[];
  startsAt: string;
  markers?: Marker[];
  height?: number;
  now?: number;
  domainEnd?: number;
  unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 40, r: 8, t: 14, b: 22 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const t0 = 0;
  const t1 = Math.max(domainEnd ?? 0, series.at(-1)?.t ?? 1, 1);
  const vmax = useMemo(() => {
    const m = Math.max(1, ...series.map((p) => p.v));
    const step = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / step) * step;
  }, [series]);
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * iw;
  const y = (v: number) => pad.t + ih - (v / vmax) * ih;
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = series.length ? `${line}L${x(series.at(-1)!.t)},${y(0)}L${x(series[0].t)},${y(0)}Z` : "";
  const ticks = [0, vmax / 2, vmax];
  const xTicks: number[] = [];
  for (let t = 0; t <= t1; t += 1800) xTicks.push(t);

  const hp = hover !== null ? series[hover] : null;
  const nearMarkers = hp ? markers.filter((m) => Math.abs(m.t - hp.t) <= 90) : [];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = (px / iw) * (t1 - t0);
    let best = 0;
    for (let i = 0; i < series.length; i++) if (Math.abs(series[i].t - t) < Math.abs(series[best].t - t)) best = i;
    setHover(series.length ? best : null);
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={`Volume ao longo do tempo (${unit})`}>
        <defs>
          <linearGradient id="vol-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6b9cf2" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6b9cf2" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(v)} y2={y(v)} stroke="#252529" strokeDasharray={v === 0 ? undefined : "2 4"} />
            <text x={pad.l - 8} y={y(v) + 3} textAnchor="end" className="fill-fg-3 tnum" fontSize={10}>
              {v >= 1000 ? `${(v / 1000).toFixed(1).replace(".0", "")}k` : v}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={height - 6} textAnchor={t === 0 ? "start" : "middle"} className="fill-fg-3 tnum" fontSize={10}>
            {wallClock(startsAt, t, false)}
          </text>
        ))}
        {markers.map((m) => (
          <line key={`${m.t}-${m.label}`} x1={x(m.t)} x2={x(m.t)} y1={pad.t - 10} y2={pad.t - 4} stroke="#a4a4a8" strokeWidth={1.5} strokeLinecap="round" />
        ))}
        <path d={area} fill="url(#vol-fill)" />
        <path d={line} fill="none" stroke="#6b9cf2" strokeWidth={2} strokeLinejoin="round" />
        {now !== undefined && now < t1 && (
          <g>
            <line x1={x(now)} x2={x(now)} y1={pad.t} y2={pad.t + ih} stroke="#e5645f" strokeDasharray="3 3" />
            <text x={x(now) + 4} y={pad.t + 8} fontSize={9.5} className="fill-neg" fontWeight={600}>
              AGORA
            </text>
          </g>
        )}
        {hp && (
          <g>
            <line x1={x(hp.t)} x2={x(hp.t)} y1={pad.t} y2={pad.t + ih} stroke="#68686e" />
            <circle cx={x(hp.t)} cy={y(hp.v)} r={4} fill="#6b9cf2" stroke="#111113" strokeWidth={2} />
          </g>
        )}
        <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hp && (
        <ChartTooltip x={x(hp.t)} y={y(hp.v)} containerWidth={width}>
          <div className="mb-1 font-medium text-fg tnum">{wallClock(startsAt, hp.t, false)}</div>
          <TipRow label={unit} value={fmtInt(hp.v)} color="#6b9cf2" />
          {nearMarkers.map((m) => (
            <div key={m.label} className="mt-1 border-t border-border pt-1 text-fg-3">
              {m.code && <span className="mr-1 font-mono text-fg-2">{m.code}</span>}
              {m.label}
            </div>
          ))}
        </ChartTooltip>
      )}
    </div>
  );
}
