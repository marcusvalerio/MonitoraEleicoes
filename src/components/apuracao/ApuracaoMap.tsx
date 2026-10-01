"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MapCanvas, type MapEntity } from "@/components/map/MapCanvas";
import { SEQ } from "@/components/map/scales";
import type { GeoAggregate, GeoBoundarySet } from "@/geo/types";
import { fmtInt } from "@/lib/format";

export interface UfCount {
  uf: string;
  state: string;
  stateLabel: string;
  /** % de seções totalizadas publicado (null ⇒ não publicado). */
  countedPct: number | null;
  leader: { id: string; name: string; party: string | null; votes: number; pct: number | null } | null;
}

/** Faixas de progresso (a partir do % oficial de seções): nada é estimado. */
function bucket(u: UfCount): { v: number; label: string } | null {
  if (u.state === "totalizada") return { v: 5, label: "Encerrada" };
  if (u.countedPct === null || u.countedPct <= 0) return null;
  if (u.countedPct < 25) return { v: 1, label: "Recebendo dados" };
  if (u.countedPct < 75) return { v: 2, label: "Parcial" };
  return { v: 3, label: "Avançada" };
}
const LEGEND = [
  { label: "Não iniciada", color: "#1a1a1d" },
  { label: "Recebendo dados", color: SEQ[1] },
  { label: "Parcial", color: SEQ[2] },
  { label: "Avançada", color: SEQ[3] },
  { label: "Encerrada", color: SEQ[4] },
];

/** Mapa da apuração (MapCanvas existente): camada de PROGRESSO ou de MAIS VOTADO; clique abre o detalhe da UF. */
export function ApuracaoMap({ boundaries, rows, entities }: { boundaries: GeoBoundarySet | null; rows: UfCount[]; entities: MapEntity[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [layer, setLayer] = useState<"progresso" | "lider">("progresso");
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const byKey = new Map(rows.map((r) => [`UF:${r.uf}`, r]));
  const selected = params.get("uf") ? `UF:${params.get("uf")}` : null;
  const agg: GeoAggregate[] = rows.flatMap((r) => {
    const b = bucket(r);
    if (layer === "progresso" && !b) return [];
    if (layer === "lider" && !r.leader) return [];
    return [{ key: `UF:${r.uf}`, name: r.uf, shortName: r.uf, level: "uf", posts: 1, topicPosts: b?.v ?? 0, shareOfParent: 0, mentionsByCandidate: {}, predominantCandidateId: r.leader?.id ?? null, predominantShare: (r.leader?.pct ?? 0) / 100, topTopic: null, topTopicShare: 0, trend: { kind: "not_applicable" } as GeoAggregate["trend"], hasChildren: false }];
  });
  const describe = (_: GeoAggregate | undefined, key: string) => {
    const r = byKey.get(key);
    if (!r) return key.replace("UF:", "");
    const pct = r.countedPct === null ? "seções: dado indisponível" : `${r.countedPct.toFixed(2).replace(".", ",")}% das seções`;
    const lead = r.leader ? ` · à frente: ${r.leader.name}${r.leader.party ? ` (${r.leader.party})` : ""}, ${fmtInt(r.leader.votes)} votos${r.leader.pct !== null ? ` (${r.leader.pct.toFixed(2).replace(".", ",")}%)` : ""}` : "";
    return `${r.uf}: ${r.stateLabel} · ${pct}${lead}`;
  };
  const open = (key: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("uf", key.replace("UF:", ""));
    router.push(`?${q.toString()}#estado`, { scroll: false });
  };
  return (
    <figure className="relative" data-testid="apuracao-map" aria-label="Mapa da apuração presidencial por UF">
      <div className="mb-2 flex items-center gap-1 text-[12px]" role="radiogroup" aria-label="Camada do mapa">
        {[["progresso", "Progresso da apuração"], ["lider", "Mais votado"]].map(([id, l]) => (
          <button key={id} type="button" role="radio" aria-checked={layer === id} onClick={() => setLayer(id as typeof layer)} className={`h-7 rounded-[4px] px-2.5 transition-colors ${layer === id ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg-2"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="origin-center motion-safe:animate-[map-in_700ms_cubic-bezier(.2,.7,.2,1)_both]">
        <MapCanvas boundaries={boundaries} rows={agg} layer={layer === "progresso" ? "volume" : "candidato"} entities={entities} selectedKey={selected} height={520} describe={describe} onHover={(key, pos) => setHover(key && pos ? { key, ...pos } : null)} onActivate={(key) => open(key)} />
      </div>
      {hover && (
        <div className="pointer-events-none absolute z-10 max-w-72 rounded-[var(--radius-sm)] border border-border bg-surface/95 px-2.5 py-2 text-[12px] shadow-xl backdrop-blur" style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 14 }} data-testid="apuracao-map-tooltip">
          {describe(undefined, hover.key)}
          <span className="mt-1 block text-[10.5px] text-fg-3">DADO OFICIAL · TSE · clique para detalhar</span>
        </div>
      )}
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-2">
        {layer === "progresso"
          ? LEGEND.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px] ring-1 ring-border" style={{ background: l.color }} aria-hidden />
                {l.label}
              </span>
            ))
          : entities.filter((e) => rows.some((r) => r.leader?.id === e.id)).map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: e.color }} aria-hidden />
                {e.name}
              </span>
            ))}
        <span className="text-fg-3">{layer === "progresso" ? "· faixas pelo % oficial de seções totalizadas" : "· intensidade = participação nos votos válidos da UF"}</span>
      </figcaption>
    </figure>
  );
}
