"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";
import { useWidth } from "@/components/charts/useWidth";
import { wallClock } from "@/lib/format";

export interface ScrubberEvent {
  id: string;
  code: string;
  t: number;
  title: string;
  topicLabel: string;
}

/**
 * Controle temporal do mapa: arrasta-se o instante; eventos de pico são marcadores clicáveis.
 * Ao escolher um pico, o mapa mostra o recorte naquele momento — associação temporal, não causal.
 */
export function TimeScrubber({ series, startsAt, totalEnd, now, value, onChange, events, focusEvent, windowMode, onWindowMode }: {
  series: { t: number; v: number }[];
  startsAt: string;
  totalEnd: number;
  now: number;
  value: number;
  onChange: (v: number, ev?: ScrubberEvent) => void;
  events: ScrubberEvent[];
  focusEvent: ScrubberEvent | null;
  windowMode: "acumulado" | "janela";
  onWindowMode: (m: "acumulado" | "janela") => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const h = 56;
  const max = Math.max(1, ...series.map((s) => s.v));
  const x = (t: number) => (t / totalEnd) * width;
  const bw = Math.max(1, x(300) - 2);
  const dragging = useRef(false);
  const toT = (clientX: number) => {
    const b = (ref.current as HTMLElement).getBoundingClientRect();
    return Math.max(300, Math.min(now, ((clientX - b.left) / b.width) * totalEnd));
  };
  const ticks: number[] = [];
  for (let t = 0; t <= totalEnd; t += width < 520 ? 1800 : 900) ticks.push(t);

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-fg-2">
          <span className="eyebrow mr-2">Período</span>
          {windowMode === "janela" ? `${wallClock(startsAt, Math.max(0, value - 900), false)}–${wallClock(startsAt, value, false)}` : `21:00 → ${wallClock(startsAt, value, false)}`}
          {value < now && (
            <button type="button" onClick={() => onChange(now)} className="ml-3 text-[11.5px] text-info hover:underline">
              Voltar ao agora
            </button>
          )}
        </p>
        <div className="flex rounded-[var(--radius-md)] border border-border p-0.5 text-[11.5px]" role="radiogroup" aria-label="Janela temporal">
          {(["acumulado", "janela"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={windowMode === m} onClick={() => onWindowMode(m)} className={cn("h-6 rounded-[4px] px-2", windowMode === m ? "bg-elevated text-fg" : "text-fg-3")}>
              {m === "acumulado" ? "Acumulado" : "Janela de 15 min"}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={ref}
        className="relative touch-none select-none"
        style={{ height: h + 22 }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          onChange(toT(e.clientX));
        }}
        onPointerMove={(e) => dragging.current && onChange(toT(e.clientX))}
        onPointerUp={() => (dragging.current = false)}
        role="slider"
        aria-label="Instante do recorte"
        aria-valuemin={0}
        aria-valuemax={Math.round(now)}
        aria-valuenow={Math.round(value)}
        aria-valuetext={wallClock(startsAt, value, false)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onChange(Math.max(300, value - 300));
          if (e.key === "ArrowRight") onChange(Math.min(now, value + 300));
        }}
      >
        <svg width={width} height={h} className="block">
          {series.map((s) => (
            <rect key={s.t} x={x(s.t) + 1} y={h - (s.v / max) * (h - 6)} width={bw} height={(s.v / max) * (h - 6)} rx={1.5} fill={s.t + 300 <= value ? (windowMode === "janela" && s.t < value - 900 ? "#34343a" : "#4a8be6") : s.t < now ? "#26262b" : "#18181b"} />
          ))}
          <line x1={x(now)} x2={x(now)} y1={0} y2={h} stroke="#e5645f" strokeDasharray="2 3" />
        </svg>
        <div className="absolute top-0 bottom-[22px] w-[2px] -translate-x-1/2 rounded-full bg-fg shadow-[0_0_0_3px_#0a0a0b]" style={{ left: x(value) }} aria-hidden>
          <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-fg" />
        </div>
        {events.map((ev) => (
          <button
            key={ev.id}
            type="button"
            title={`${ev.code} · ${ev.title}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange(ev.t + 300, ev)}
            className={cn("absolute top-0 -translate-x-1/2 rounded-full border px-1 font-mono text-[9px] leading-[14px]", focusEvent?.id === ev.id ? "border-info bg-info text-bg" : "border-info/50 bg-bg text-info hover:bg-info-bg")}
            style={{ left: x(ev.t) }}
          >
            ▲
          </button>
        ))}
        <div className="absolute inset-x-0 bottom-0 flex h-[18px]">
          {ticks.map((t) => (
            <span key={t} className="absolute text-[10px] text-fg-3 tnum" style={{ left: x(t), transform: t === 0 ? undefined : "translateX(-50%)" }}>
              {wallClock(startsAt, t, false)}
            </span>
          ))}
        </div>
      </div>
      {focusEvent && (
        <p className="text-[12px] text-fg-2">
          <span className="font-mono text-info">{focusEvent.code}</span> Pico de conversa às {wallClock(startsAt, focusEvent.t, false)} · {focusEvent.topicLabel}. Territórios em verde tiveram alta no volume — pico <em>temporalmente associado</em> ao evento, sem relação causal estabelecida.
        </p>
      )}
    </div>
  );
}
