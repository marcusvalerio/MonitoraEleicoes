import type { ReactNode } from "react";

/** Tooltip posicionado em coordenadas do container (px). */
export function ChartTooltip({ x, y, children, containerWidth }: { x: number; y: number; children: ReactNode; containerWidth: number }) {
  const flip = x > containerWidth - 180;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 min-w-[140px] rounded-[var(--radius-md)] border border-border-strong bg-elevated px-2.5 py-2 text-[11.5px] shadow-xl"
      style={{ left: flip ? undefined : x + 12, right: flip ? containerWidth - x + 12 : undefined, top: Math.max(0, y - 10) }}
    >
      {children}
    </div>
  );
}

export function TipRow({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-fg-2">
      <span className="flex items-center gap-1.5">
        {color && <span className="size-2 rounded-[2px]" style={{ background: color }} />}
        {label}
      </span>
      <span className="tnum font-medium text-fg">{value}</span>
    </div>
  );
}
