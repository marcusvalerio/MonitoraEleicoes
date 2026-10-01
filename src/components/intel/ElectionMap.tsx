"use client";

import { useState } from "react";
import { MapCanvas, type MapEntity } from "@/components/map/MapCanvas";
import type { GeoAggregate, GeoBoundarySet } from "@/geo/types";
import { fmtInt, fmtPct } from "@/lib/format";

export interface ElectionMapRow {
  uf: string;
  /** Candidatura mais votada (null = sem votos apurados/publicados ⇒ território sem cor). */
  leader: { id: string; name: string; party: string | null; votes: number; share: number | null } | null;
  /** Texto do estado quando não há líder (ex.: "Não iniciada", "Não coletada"). */
  note?: string;
}

/**
 * Camada eleitoral sobre o MapCanvas existente: cor = candidatura mais votada (identidade fixa);
 * intensidade = participação nos votos da UF. Sem votos ⇒ território neutro + estado explícito (nunca "0").
 */
export function ElectionMap({ boundaries, rows, entities, title }: { boundaries: GeoBoundarySet | null; rows: ElectionMapRow[]; entities: MapEntity[]; title: string }) {
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const agg: GeoAggregate[] = rows
    .filter((r) => r.leader)
    .map((r) => ({
      key: `UF:${r.uf}`,
      name: r.uf,
      shortName: r.uf,
      level: "uf",
      posts: 1,
      topicPosts: r.leader!.votes,
      shareOfParent: 0,
      mentionsByCandidate: {},
      predominantCandidateId: r.leader!.id,
      predominantShare: r.leader!.share ?? 0,
      topTopic: null,
      topTopicShare: 0,
      trend: { kind: "not_applicable" } as GeoAggregate["trend"],
      hasChildren: false,
    }));
  const byKey = new Map(rows.map((r) => [`UF:${r.uf}`, r]));
  const describe = (_: GeoAggregate | undefined, key: string) => {
    const r = byKey.get(key);
    if (!r?.leader) return `${key.replace("UF:", "")}: ${r?.note ?? "sem dados"}`;
    return `${r.uf}: ${r.leader.name}${r.leader.party ? ` (${r.leader.party})` : ""}, ${fmtInt(r.leader.votes)} votos${r.leader.share !== null ? `, ${fmtPct(r.leader.share, 1)}` : ""}`;
  };
  const used = entities.filter((e) => rows.some((r) => r.leader?.id === e.id));
  const h = hover ?? (sel ? { key: sel, x: 0, y: 0 } : null);
  return (
    <figure className="relative" data-testid="election-map" aria-label={title}>
      <MapCanvas
        boundaries={boundaries}
        rows={agg}
        layer="candidato"
        entities={entities}
        selectedKey={sel}
        height={420}
        describe={describe}
        onHover={(key, pos) => setHover(key && pos ? { key, ...pos } : null)}
        onActivate={(key) => setSel((s) => (s === key ? null : key))}
      />
      {h && (
        <div className="pointer-events-none absolute z-10 max-w-60 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5 text-[12px] shadow-lg" style={hover ? { left: hover.x + 12, top: hover.y + 12 } : { right: 8, top: 8 }} data-testid="election-map-tooltip">
          {describe(undefined, h.key)}
        </div>
      )}
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-2">
        {used.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: e.color }} aria-hidden />
            {e.name}
            {e.partyAcronym ? <span className="text-fg-3">{e.partyAcronym}</span> : null}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-fg-3">
          <span className="size-2 rounded-full bg-[#1a1a1d] ring-1 ring-border" aria-hidden />
          sem votos apurados / não coletado
        </span>
        <span className="text-fg-3">· intensidade = participação nos votos da UF</span>
      </figcaption>
    </figure>
  );
}
