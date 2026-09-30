"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { fmtDuration, fmtInt } from "@/lib/format";

export interface BarItem {
  id: string;
  label: string;
  value: number;
  /** Texto secundário à direita (ex.: percentual). */
  secondary?: string;
  href?: string;
  highlighted?: boolean;
}

/** Barras horizontais para comparação de categorias. Valores sempre visíveis (sem depender de cor). */
export function BarList({ items, max, format = "int", color = "#a4a4a8", onSelect }: { items: BarItem[]; max?: number; format?: "int" | "duration"; color?: string; onSelect?: (id: string) => void }) {
  const valueFormat = format === "duration" ? fmtDuration : fmtInt;
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const active = hover === it.id || it.highlighted;
        const Row = onSelect ? "button" : "div";
        return (
          <li key={it.id}>
            <Row
              {...(onSelect ? { type: "button" as const, onClick: () => onSelect(it.id) } : {})}
              onMouseEnter={() => setHover(it.id)}
              onMouseLeave={() => setHover(null)}
              className={cn("grid w-full grid-cols-[minmax(92px,120px)_1fr_auto] items-center gap-3 rounded-[var(--radius-sm)] px-1.5 py-1 text-left", active && "bg-elevated")}
            >
              <span className={cn("truncate text-[12.5px]", active ? "text-fg" : "text-fg-2")}>{it.label}</span>
              <span className="relative h-2 overflow-hidden rounded-r-[4px] bg-transparent">
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-r-[4px]"
                  style={{ background: active ? "#f2f2f0" : color }}
                  initial={false}
                  animate={{ width: `${(it.value / m) * 100}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </span>
              <span className="tnum w-[78px] text-right text-[12px] text-fg">
                {valueFormat(it.value)}
                {it.secondary && <span className="ml-1.5 text-fg-3">{it.secondary}</span>}
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
