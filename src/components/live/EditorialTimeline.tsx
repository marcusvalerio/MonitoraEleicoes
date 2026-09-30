"use client";

import { useState } from "react";
import type { EditorialItem } from "@/domain/editorial";
import { EDITORIAL_EVENT_LABEL } from "@/domain/editorial";
import { TOPIC_LABEL } from "@/domain/labels";
import { fmtTime } from "@/lib/live-format";

/**
 * Marcadores da cobertura editorial numa linha do tempo (horário informado pela fonte).
 * Posts sem horário não são posicionados (contados à parte). Clique abre o registro completo.
 */
export function EditorialTimeline({ items, names, from, to, height = 44 }: { items: EditorialItem[]; names: Record<string, string>; from?: string; to?: string; height?: number }) {
  const name = (id: string) => names[id] ?? "Candidato não identificado";
  const timed = items.filter((x) => x.update.publishedAt && !x.update.removedAt).sort((a, b) => a.update.publishedAt!.localeCompare(b.update.publishedAt!));
  const [open, setOpen] = useState<string | null>(null);
  if (!timed.length) return <p className="text-[12px] text-fg-3" data-testid="editorial-timeline-empty">Sem eventos editoriais com horário.</p>;
  const t0 = Date.parse(from ?? timed[0].update.publishedAt!);
  const t1 = Math.max(Date.parse(to ?? timed[timed.length - 1].update.publishedAt!), t0 + 60_000);
  const x = (iso: string) => 8 + ((Date.parse(iso) - t0) / (t1 - t0)) * 984;
  const sel = timed.find((i) => i.update.id === open) ?? null;
  const untimed = items.filter((i) => !i.update.publishedAt && !i.update.removedAt).length;
  return (
    <div data-testid="editorial-timeline">
      <svg viewBox={`0 0 1000 ${height}`} className="w-full" role="img" aria-label="Eventos editoriais ao longo do debate">
        <line x1="8" x2="992" y1={height / 2} y2={height / 2} stroke="currentColor" className="text-border-strong" />
        {timed.map((i) => (
          <g key={i.update.id} className="cursor-pointer" onClick={() => setOpen(open === i.update.id ? null : i.update.id)}>
            <title>{`${fmtTime(i.update.publishedAt)} · ${i.analysis ? EDITORIAL_EVENT_LABEL[i.analysis.eventType] : "—"}`}</title>
            <circle cx={x(i.update.publishedAt!)} cy={height / 2} r={open === i.update.id ? 7 : 5} className="fill-info" data-testid="editorial-marker" />
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-fg-3 tnum">
        <span>{fmtTime(new Date(t0).toISOString())}</span>
        {untimed > 0 && <span>{untimed} sem horário (não posicionados)</span>}
        <span>{fmtTime(new Date(t1).toISOString())}</span>
      </div>
      {sel && (
        <div className="mt-2 rounded-[var(--radius-sm)] border border-border bg-bg p-3 text-[12.5px]" data-testid="editorial-marker-detail">
          <p className="text-fg-3">
            {fmtTime(sel.update.publishedAt)} · {sel.analysis ? EDITORIAL_EVENT_LABEL[sel.analysis.eventType] : "—"} · {sel.analysis && sel.analysis.topic !== "unknown" ? TOPIC_LABEL[sel.analysis.topic] : "tema não identificado"}
          </p>
          <p className="text-fg-3">
            {sel.analysis?.actorCandidateId ? name(sel.analysis.actorCandidateId) : "Candidato não identificado"}
            {sel.analysis?.targetCandidateId ? ` → ${name(sel.analysis.targetCandidateId)}` : ""}
          </p>
          <p className="mt-1 text-fg">“{sel.update.text}”</p>
          <p className="mt-1 text-fg-3">
            Fonte: g1 · cobertura editorial{" "}
            {sel.update.url && (
              <a href={sel.update.url} target="_blank" rel="noreferrer" className="text-info hover:underline">
                abrir original
              </a>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
