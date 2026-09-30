"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useWidth } from "./useWidth";
import type { InteractionEdge } from "@/analytics/debate";

export interface MapNode {
  id: string;
  label: string;
  initials: string;
  color: string;
}

type Kind = InteractionEdge["kind"];
const KINDS: { id: Kind; label: string }[] = [
  { id: "menciona", label: "Menciona" },
  { id: "pergunta", label: "Pergunta a" },
  { id: "responde", label: "Responde a" },
];

/**
 * Mapa de interações. Setas indicam direção (quem → quem) e espessura indica contagem.
 * Nenhuma relação é qualificada como positiva ou negativa; clique para ver o contexto.
 */
export function InteractionMap({ nodes, edges, segmentText }: { nodes: MapNode[]; edges: InteractionEdge[]; segmentText: Record<string, { speaker: string; text: string; time: string }> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [kind, setKind] = useState<Kind>("menciona");
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const h = 300;
  const cx = width / 2;
  const cy = h / 2;
  const rad = Math.min(width / 2 - 70, h / 2 - 40);
  const pos = useMemo(() => Object.fromEntries(nodes.map((n, i) => {
    const a = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2 + Math.PI / 4;
    return [n.id, { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad }];
  })), [nodes, cx, cy, rad]);
  const shown = edges.filter((e) => e.kind === kind);
  const maxC = Math.max(1, ...shown.map((e) => e.count));
  const key = (e: InteractionEdge) => `${e.from}|${e.to}|${e.kind}`;
  const selected = shown.find((e) => key(e) === sel) ?? null;
  const name = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-2 flex gap-1" role="tablist" aria-label="Tipo de interação">
          {KINDS.map((k) => (
            <button key={k.id} role="tab" aria-selected={kind === k.id} onClick={() => (setKind(k.id), setSel(null))} className={cn("h-7 rounded-[var(--radius-md)] px-2.5 text-[12px]", kind === k.id ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg-2")}>
              {k.label}
            </button>
          ))}
        </div>
        <div ref={ref} className="w-full">
          <svg width={width} height={h} role="img" aria-label="Mapa de interações entre candidatos">
            <defs>
              {["idle", "on"].map((s) => (
                <marker key={s} id={`arrow-${s}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={s === "on" ? "#f2f2f0" : "#68686e"} />
                </marker>
              ))}
            </defs>
            {shown.map((e) => {
              const a = pos[e.from];
              const b = pos[e.to];
              if (!a || !b) return null;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const nx = -dy / len;
              const ny = dx / len;
              const off = 22;
              const r = 22;
              const sx = a.x + (dx / len) * r;
              const sy = a.y + (dy / len) * r;
              const ex = b.x - (dx / len) * (r + 4);
              const ey = b.y - (dy / len) * (r + 4);
              const mx = (a.x + b.x) / 2 + nx * off;
              const my = (a.y + b.y) / 2 + ny * off;
              const k = key(e);
              const on = sel === k || hover === k;
              return (
                <g key={k} className="cursor-pointer" onClick={() => setSel(sel === k ? null : k)} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}>
                  <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} fill="none" stroke="transparent" strokeWidth={14} />
                  <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} fill="none" stroke={on ? "#f2f2f0" : "#68686e"} strokeWidth={1.25 + (e.count / maxC) * 3} markerEnd={`url(#arrow-${on ? "on" : "idle"})`} opacity={sel && !on ? 0.35 : 1} />
                  <g transform={`translate(${mx},${my})`}>
                    <rect x={-10} y={-8} width={20} height={16} rx={4} fill="#171719" stroke={on ? "#f2f2f0" : "#34343a"} />
                    <text textAnchor="middle" y={3.5} fontSize={10} className="fill-fg tnum" fontWeight={600}>
                      {e.count}
                    </text>
                  </g>
                </g>
              );
            })}
            {nodes.map((n) => {
              const p = pos[n.id];
              if (!p) return null;
              const below = p.y > cy;
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`}>
                  <circle r={20} fill="#111113" stroke={n.color} strokeWidth={2} />
                  <text textAnchor="middle" y={4} fontSize={11.5} fontWeight={600} className="fill-fg">
                    {n.initials}
                  </text>
                  <text textAnchor="middle" y={below ? 36 : -28} fontSize={11.5} className="fill-fg-2">
                    {n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
        {selected ? (
          <div className="space-y-2">
            <p className="text-[12.5px] text-fg">
              {name(selected.from)} <span className="text-fg-3">{KINDS.find((k) => k.id === selected.kind)?.label.toLowerCase()}</span> {name(selected.to)}
            </p>
            <p className="eyebrow">{selected.count} ocorrência(s) · contexto</p>
            <ul className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
              {selected.segmentIds.map((id) => (
                <li key={id} className="border-l border-border-strong pl-2 text-[12px] text-fg-2">
                  <span className="font-mono text-[10.5px] text-fg-3">{segmentText[id]?.time}</span>
                  <p className="line-clamp-3">“{segmentText[id]?.text}”</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-2 text-[12px] text-fg-3">
            <p className="text-fg-2">Selecione uma seta para ver as falas que a compõem.</p>
            <p>A seta indica direção (quem → quem). A espessura indica o número de ocorrências. O mapa não interpreta se a interação foi positiva ou negativa.</p>
          </div>
        )}
      </div>
    </div>
  );
}
