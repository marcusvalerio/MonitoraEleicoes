import "server-only";
import { getRepository } from "@/repository";
import { TOPIC_LABEL } from "@/domain/labels";
import { TOPICS } from "@/domain/types";

export type SearchKind = "pagina" | "candidato" | "debate" | "tema" | "evento" | "fala" | "fonte" | "localidade";
export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PAGES: SearchHit[] = [
  { kind: "pagina", id: "overview", title: "Overview", href: "/overview" },
  { kind: "pagina", id: "debates", title: "Debates", href: "/debates" },
  { kind: "pagina", id: "social", title: "Repercussão", href: "/social" },
  { kind: "pagina", id: "eleicoes", title: "Eleições", subtitle: "Histórico oficial (TSE) e apuração 2026", href: "/eleicoes" },
  { kind: "pagina", id: "sources", title: "Fontes", href: "/sources" },
  { kind: "pagina", id: "methodology", title: "Metodologia", href: "/methodology" },
];

/** Busca global (server-side). Em produção: índice full-text no Postgres (tsvector) + semântica (P2). */
export async function search(q: string, limit = 24): Promise<SearchHit[]> {
  const term = norm(q.trim());
  const repo = await getRepository();
  const debates = await repo.listDebates();
  const cands = await repo.getCandidates();
  const sources = await repo.getSources();
  if (!term) return [...PAGES, ...cands.map((c) => ({ kind: "candidato" as const, id: c.id, title: c.name, href: `/debates/${debates[0]?.id}/analytics#candidato-${c.id}` }))].slice(0, limit);

  const hits: SearchHit[] = [];
  const match = (s: string) => norm(s).includes(term);
  hits.push(...PAGES.filter((x) => match(x.title)));
  for (const c of cands) if (match(c.name)) hits.push({ kind: "candidato", id: c.id, title: c.name, subtitle: "Candidato", href: `/debates/${debates[0].id}/analytics#candidato-${c.id}` });
  for (const d of debates) if (match(`${d.title} ${d.broadcaster}`)) hits.push({ kind: "debate", id: d.id, title: d.title, subtitle: d.broadcaster, href: `/debates/${d.id}` });
  for (const t of TOPICS) if (match(TOPIC_LABEL[t])) hits.push({ kind: "tema", id: t, title: TOPIC_LABEL[t], subtitle: "Tema", href: `/debates/${debates[0].id}/analytics?tema=${t}#temas` });
  for (const s of sources) if (match(`${s.name} ${s.provider}`)) hits.push({ kind: "fonte", id: s.id, title: s.name, subtitle: s.provider, href: `/sources#${s.id}` });

  for (const d of debates) {
    const events = await repo.getEvents(d.id);
    for (const e of events) if (match(`${e.title} ${e.description}`)) hits.push({ kind: "evento", id: e.id, title: `${e.code} · ${e.title}`, subtitle: d.title, href: `/debates/${d.id}/live?seg=${e.segmentIds[0] ?? ""}` });
    const { segments } = await repo.getTranscript(d.id);
    const byId = new Map(cands.map((c) => [c.id, c.name]));
    for (const s of segments) if (term.length >= 3 && match(s.text)) hits.push({ kind: "fala", id: s.id, title: s.text.length > 90 ? s.text.slice(0, 88) + "…" : s.text, subtitle: byId.get(s.speakerId) ?? "Moderação", href: `/debates/${d.id}/live?seg=${s.id}` });
  }
  return hits.slice(0, limit);
}
