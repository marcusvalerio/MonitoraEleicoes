"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { CONTENT_TYPES, ELECTION_YEARS, PERIODS, PLATFORM_IDS, SENTIMENTS, UFS, toSearchParams, type FilterSpec } from "@/domain/filters";
import { TOPIC_LABEL } from "@/domain/labels";
import { TOPICS } from "@/domain/types";

const PERIOD_LABEL: Record<string, string> = { today: "Hoje", "24h": "Últimas 24h", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", custom: "Personalizado" };
const OFFICE_LABEL: Record<number, string> = { 1: "Presidente", 3: "Governador", 5: "Senador", 6: "Deputado Federal", 7: "Deputado Estadual", 8: "Deputado Distrital" };
const REGION_LABEL: Record<number, string> = { 1: "Norte", 2: "Nordeste", 3: "Sudeste", 4: "Sul", 5: "Centro-Oeste" };
const PLATFORM_LABEL: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", x: "X", tiktok: "TikTok", reddit: "Reddit", bluesky: "Bluesky", news: "Notícias" };
const TYPE_LABEL: Record<string, string> = { post: "Post", comment: "Comentário", reply: "Resposta", news: "Notícia", video: "Vídeo", live: "Live" };
const SENT_LABEL: Record<string, string> = { positivo: "Positivo", negativo: "Negativo", neutro: "Neutro", misto: "Misto", incerto: "Incerto" };

export type FilterField = "year" | "round" | "office" | "region" | "uf" | "party" | "q" | "period" | "platform" | "type" | "sentiment" | "topic";

const control = "h-8 rounded-[var(--radius-sm)] border border-border bg-bg px-2 text-[12.5px] text-fg";

/** Barra de filtros global: estado na URL (compartilhável), combinável, aplicada no servidor. */
export function FilterBar({ filter, fields }: { filter: FilterSpec; fields: FilterField[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState(filter);
  const apply = (next: FilterSpec) => {
    setF(next);
    router.push(`${pathname}?${toSearchParams(next).toString()}`);
  };
  const has = (x: FilterField) => fields.includes(x);
  const active = [f.offices.length, f.regions.length, f.ufs.length, f.parties.length, f.platforms.length, f.contentTypes.length, f.sentiments.length, f.topics.length, f.candidateQuery ? 1 : 0].reduce((a, b) => a + b, 0);
  return (
    <form
      role="search"
      aria-label="Filtros"
      className="sticky top-12 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-border bg-bg/90 px-4 py-2 backdrop-blur md:-mx-6 md:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        apply(f);
      }}
      data-testid="filter-bar"
    >
      {has("year") && (
        <select aria-label="Eleição" className={control} value={f.year} onChange={(e) => apply({ ...f, year: Number(e.target.value) as FilterSpec["year"] })}>
          {ELECTION_YEARS.map((y) => (
            <option key={y} value={y}>
              Eleição {y}
            </option>
          ))}
        </select>
      )}
      {has("round") && (
        <select aria-label="Turno" className={control} value={f.round ?? 1} onChange={(e) => apply({ ...f, round: Number(e.target.value) as 1 | 2 })}>
          <option value={1}>1º turno</option>
          <option value={2}>2º turno</option>
        </select>
      )}
      {has("office") && (
        <select aria-label="Cargo" className={control} value={f.offices[0] ?? ""} onChange={(e) => apply({ ...f, offices: e.target.value ? [Number(e.target.value)] : [] })}>
          <option value="">Todos os cargos</option>
          {Object.entries(OFFICE_LABEL).map(([id, l]) => (
            <option key={id} value={id}>
              {l}
            </option>
          ))}
        </select>
      )}
      {has("region") && <Multi label="Região" values={f.regions.map(String)} options={Object.entries(REGION_LABEL).map(([v, l]) => ({ v, l }))} onChange={(v) => apply({ ...f, regions: v.map(Number) })} />}
      {has("uf") && <Multi label="Estado" values={f.ufs} options={UFS.map((u) => ({ v: u, l: u }))} onChange={(v) => apply({ ...f, ufs: v })} />}
      {has("period") && (
        <select aria-label="Período" className={control} value={f.period.preset} onChange={(e) => e.target.value !== "custom" && apply({ ...f, period: { preset: e.target.value as FilterSpec["period"]["preset"] } })}>
          {PERIODS.filter((p) => p !== "custom" || f.period.preset === "custom").map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABEL[p]}
            </option>
          ))}
        </select>
      )}
      {has("platform") && <Multi label="Plataforma" values={f.platforms} options={PLATFORM_IDS.map((p) => ({ v: p, l: PLATFORM_LABEL[p] }))} onChange={(v) => apply({ ...f, platforms: v })} />}
      {has("type") && <Multi label="Tipo" values={f.contentTypes} options={CONTENT_TYPES.map((p) => ({ v: p, l: TYPE_LABEL[p] }))} onChange={(v) => apply({ ...f, contentTypes: v })} />}
      {has("sentiment") && <Multi label="Sentimento" values={f.sentiments} options={SENTIMENTS.map((p) => ({ v: p, l: SENT_LABEL[p] }))} onChange={(v) => apply({ ...f, sentiments: v })} />}
      {has("topic") && <Multi label="Tema" values={f.topics} options={TOPICS.map((t) => ({ v: t, l: TOPIC_LABEL[t] }))} onChange={(v) => apply({ ...f, topics: v })} />}
      {has("party") && <input aria-label="Partido (sigla)" placeholder="Partido (sigla)" className={`${control} w-32 uppercase`} value={f.parties.join(",")} onChange={(e) => setF({ ...f, parties: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) })} onBlur={() => apply(f)} />}
      {has("q") && (
        <label className="relative">
          <Search size={13} className="pointer-events-none absolute top-2.5 left-2 text-fg-3" aria-hidden />
          <input aria-label="Buscar candidato" placeholder="Candidato…" className={`${control} w-44 pl-7`} value={f.candidateQuery ?? ""} onChange={(e) => setF({ ...f, candidateQuery: e.target.value || undefined })} />
        </label>
      )}
      {active > 0 && (
        <button type="button" className="ml-auto inline-flex h-8 items-center gap-1 text-[12px] text-fg-3 hover:text-fg" onClick={() => apply({ ...f, offices: [], regions: [], ufs: [], parties: [], platforms: [], contentTypes: [], sentiments: [], topics: [], candidacyIds: [], candidateQuery: undefined })} data-testid="filter-clear">
          <X size={12} aria-hidden /> Limpar ({active})
        </button>
      )}
      <button type="submit" className="sr-only">
        Aplicar
      </button>
    </form>
  );
}

function Multi({ label, values, options, onChange }: { label: string; values: string[]; options: { v: string; l: string }[]; onChange: (v: string[]) => void }): ReactNode {
  return (
    <details className="relative" data-testid={`filter-${label}`}>
      <summary className={`${control} inline-flex cursor-pointer list-none items-center gap-1`}>
        {label}
        {values.length > 0 && <span className="rounded bg-elevated px-1 text-[11px] tnum text-fg">{values.length}</span>}
        <ChevronDown size={12} aria-hidden />
      </summary>
      <div className="absolute z-30 mt-1 max-h-72 w-52 overflow-auto rounded-[var(--radius-sm)] border border-border bg-surface p-2 shadow-lg">
        {options.map((o) => (
          <label key={o.v} className="flex items-center gap-2 px-1 py-1 text-[12.5px] text-fg-2 hover:text-fg">
            <input type="checkbox" checked={values.includes(o.v)} onChange={(e) => onChange(e.target.checked ? [...values, o.v] : values.filter((x) => x !== o.v))} />
            {o.l}
          </label>
        ))}
      </div>
    </details>
  );
}
