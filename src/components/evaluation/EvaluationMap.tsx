"use client";
import { useState } from "react";
import { MapCanvas } from "@/components/map/MapCanvas";
import { SEQ } from "@/components/map/scales";
import type { GeoAggregate, GeoBoundarySet } from "@/geo/types";
import { fmtBRL } from "@/evaluation/model";

/** Mapa (MapCanvas existente) do investimento REGISTRADO por UF — municípios somam na sua UF; Brasil não é atribuído. */
export function EvaluationMap({ boundaries, totals }: { boundaries: GeoBoundarySet | null; totals: Record<string, number> }) {
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const rows: GeoAggregate[] = Object.entries(totals).map(([uf, cents]) => ({ key: `UF:${uf}`, name: uf, shortName: uf, level: "uf", posts: 1, topicPosts: Math.round(cents / 100), shareOfParent: 0, mentionsByCandidate: {}, predominantCandidateId: null, predominantShare: 0, topTopic: null, topTopicShare: 0, trend: { kind: "not_applicable" } as GeoAggregate["trend"], hasChildren: false }));
  const describe = (_: GeoAggregate | undefined, key: string) => {
    const uf = key.replace("UF:", "");
    return totals[uf] ? `${uf}: ${fmtBRL(totals[uf])} registrados` : `${uf}: nenhum investimento registrado`;
  };
  return (
    <figure className="relative" data-testid="evaluation-map" aria-label="Investimento registrado por UF">
      <MapCanvas boundaries={boundaries} rows={rows} layer="volume" entities={[]} selectedKey={null} height={360} describe={describe} onHover={(key, pos) => setHover(key && pos ? { key, ...pos } : null)} onActivate={() => {}} />
      {hover && <div className="pointer-events-none absolute z-10 rounded-[8px] border border-border bg-surface/95 px-2.5 py-1.5 text-[12px] shadow-xl" style={{ left: hover.x + 12, top: hover.y + 12 }}>{describe(undefined, hover.key)}</div>}
      <figcaption className="mt-2 flex items-center gap-2 text-[11px] text-fg-3">
        <span>menos</span>
        {SEQ.map((c) => <span key={c} className="h-2 w-5 rounded-[2px]" style={{ background: c }} aria-hidden />)}
        <span>mais</span>
        <span>· UF sem registro em cinza</span>
      </figcaption>
    </figure>
  );
}
