"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { GeoAggregate, GeoBoundarySet } from "@/geo/types";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";
import { fillFor, type MapLayer } from "./scales";
import { useWidth } from "@/components/charts/useWidth";

export interface MapEntity {
  id: string;
  name: string;
  color: string;
  partyAcronym: string;
}

export interface MapCanvasProps {
  boundaries: GeoBoundarySet | null;
  rows: GeoAggregate[];
  layer: MapLayer;
  entities: MapEntity[];
  selectedKey: string | null;
  onHover: (key: string | null, pos?: { x: number; y: number }) => void;
  onActivate: (key: string, pointer: "mouse" | "touch" | "keyboard") => void;
  height?: number;
}

/**
 * Coroplético SVG. Com contornos → mapa; sem contornos (municípios) → grade de blocos.
 * A cor de entidade identifica o predominante; a intensidade representa a métrica selecionada.
 */
export function MapCanvas({ boundaries, rows, layer, entities, selectedKey, onHover, onActivate, height = 460 }: MapCanvasProps) {
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.topicPosts)), [rows]);
  const color = (r: GeoAggregate) => entities.find((e) => e.id === r.predominantCandidateId)?.color ?? null;
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const pos = (e: React.PointerEvent | React.FocusEvent, el: Element) => {
    const box = (ref.current as HTMLElement).getBoundingClientRect();
    if ("clientX" in e) return { x: e.clientX - box.left, y: e.clientY - box.top };
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2 - box.left, y: b.top - box.top };
  };

  const handlers = (key: string) => ({
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      setHoverKey(key);
      onHover(key, pos(e, e.currentTarget));
    },
    onPointerLeave: () => {
      setHoverKey(null);
      onHover(null);
    },
    onPointerUp: (e: React.PointerEvent) => onActivate(key, e.pointerType === "touch" ? "touch" : "mouse"),
    onFocus: (e: React.FocusEvent) => onHover(key, pos(e, e.currentTarget)),
    onBlur: () => onHover(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(key, "keyboard");
      }
    },
  });

  const label = (r?: GeoAggregate, name?: string) => (r ? `${r.name}: ${fmtInt(r.topicPosts)} publicações` : `${name ?? ""}: sem dados`);

  if (!boundaries) {
    // Grade (municípios sem geometria no MVP)
    const sorted = [...rows].sort((a, b) => b.posts - a.posts);
    return (
      <div ref={ref} className="relative">
        <ul className="grid grid-cols-2 gap-[3px] sm:grid-cols-3 lg:grid-cols-4" role="list" aria-label="Territórios">
          {sorted.map((r) => {
            const f = fillFor(r, layer, max, color);
            const sel = selectedKey === r.key;
            return (
              <motion.li key={r.key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <button
                  type="button"
                  aria-label={label(r)}
                  aria-pressed={sel}
                  {...handlers(r.key)}
                  className={cn("relative flex h-[84px] w-full flex-col justify-between overflow-hidden rounded-[4px] p-2.5 text-left outline-offset-2 transition-shadow", sel ? "ring-2 ring-fg" : "hover:ring-1 hover:ring-fg/60")}
                >
                  <span className="absolute inset-0 transition-colors duration-500" style={{ background: f.color, opacity: f.opacity }} aria-hidden />
                  <span className="relative text-[12px] leading-tight font-medium text-fg">{r.name}</span>
                  <span className="relative tnum font-display text-[16px] font-semibold text-fg">{fmtInt(r.topicPosts)}</span>
                </button>
              </motion.li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-fg-3">Geometria municipal ainda não carregada — territórios exibidos como grade, ordenados por volume.</p>
      </div>
    );
  }

  const [, , vw, vh] = boundaries.viewBox.split(" ").map(Number);
  const h = Math.min(height, (width * vh) / vw);
  // Agrupa caminhos por chave (Região = várias UFs)
  const groups = new Map<string, string[]>();
  for (const b of boundaries.boundaries) groups.set(b.key, [...(groups.get(b.key) ?? []), b.path]);
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === (hoverKey ?? selectedKey) ? 1 : b === (hoverKey ?? selectedKey) ? -1 : 0));

  return (
    <div ref={ref} className="relative w-full" style={{ height: h }}>
      <svg viewBox={boundaries.viewBox} width="100%" height={h} role="group" aria-label="Mapa por território" className="overflow-visible">
        {ordered.map(([key, paths]) => {
          const r = byKey.get(key);
          const f = fillFor(r, layer, max, color);
          const active = key === hoverKey || key === selectedKey;
          return (
            <g key={key} role="button" tabIndex={0} aria-label={label(r, key)} {...handlers(key)} className="cursor-pointer outline-none focus-visible:[&_path]:stroke-info">
              {paths.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={f.color}
                  fillOpacity={f.opacity}
                  stroke={active ? "#f2f2f0" : "#0a0a0b"}
                  strokeWidth={active ? 1.6 : 0.7}
                  vectorEffect="non-scaling-stroke"
                  style={{ transition: "fill 500ms ease, fill-opacity 500ms ease" }}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
