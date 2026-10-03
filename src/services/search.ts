import "server-only";
import { getRepository } from "@/repository";
import { TOPIC_LABEL } from "@/domain/labels";
import { TOPICS } from "@/domain/types";
import { intelSql } from "./intelligence";
import { searchPeople } from "@/analytics/elections";
import { UF_NAME } from "@/elections/reference";

export type SearchKind = "pagina" | "candidato" | "partido" | "eleicao" | "debate" | "tema" | "evento" | "fala" | "fonte" | "localidade";
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
  { kind: "pagina", id: "social", title: "Repercussão", href: "/social" },
  { kind: "pagina", id: "apuracao", title: "Apuração 2026", subtitle: "Resultado oficial (TSE) em tempo real", href: "/apuracao" },
  { kind: "pagina", id: "eleicoes", title: "Eleições", subtitle: "Histórico oficial (TSE) e apuração 2026", href: "/eleicoes" },
  { kind: "pagina", id: "pesquisas", title: "Pesquisas", subtitle: "Pesquisas registradas no TSE", href: "/pesquisas" },
  { kind: "pagina", id: "comparar", title: "Comparar", subtitle: "Ciclos, partidos e trajetórias", href: "/comparar" },
  { kind: "pagina", id: "monitoramento", title: "Redes", subtitle: "Monitoramento das fontes conectadas", href: "/monitoramento" },
  { kind: "pagina", id: "sources", title: "Fontes", href: "/sources" },
  { kind: "pagina", id: "methodology", title: "Metodologia", href: "/methodology" },
];

/**
 * Base eleitoral oficial (TSE): pessoas (vínculo de identidade), partidos, eleições, UFs e municípios.
 * Sem banco/schema ⇒ nada (nunca resultados inventados).
 */
async function electoral(term: string, raw: string): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  for (const [uf, name] of Object.entries(UF_NAME)) if (norm(name).includes(term) || uf.toLowerCase() === term) out.push({ kind: "localidade", id: `uf-${uf}`, title: name, subtitle: `Estado · ${uf}`, href: `/eleicoes?uf=${uf}` });
  for (const y of [2026, 2022, 2018, 2014]) if (String(y).startsWith(term) || (term.length >= 4 && `eleicoes ${y}`.includes(term))) out.push({ kind: "eleicao", id: `e-${y}`, title: `Eleições ${y}`, subtitle: y === 2026 ? "Candidaturas e apuração" : "Resultados oficiais", href: `/eleicoes?ano=${y}` });
  const sql = await intelSql();
  if (!sql || term.length < 2) return out;
  const [people, parties, munis] = await Promise.all([
    term.length >= 3 ? searchPeople(sql, raw, 8) : Promise.resolve([]),
    sql`select acronym, (array_agg(name order by year desc))[1] as name, max(year) as last from party_registration
        where lower(acronym) = ${term} or translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') like ${`%${term}%`} group by acronym order by max(year) desc limit 6` as unknown as Promise<{ acronym: string; name: string; last: number }[]>,
    term.length >= 3
      ? (sql`select id, name, uf from territory where level = 'municipio' and translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') like ${`${term}%`} order by name limit 6` as unknown as Promise<{ id: number; name: string; uf: string }[]>)
      : Promise.resolve([]),
  ]);
  for (const p of people) out.push({ kind: "candidato", id: `p-${p.personId}`, title: p.ballotName, subtitle: `${p.party ?? "—"} · ${p.years.join(", ")}`, href: `/candidatos/${p.personId}` });
  for (const p of parties) out.push({ kind: "partido", id: `pt-${p.acronym}`, title: p.acronym, subtitle: p.name, href: `/partido/${encodeURIComponent(p.acronym)}` });
  for (const m of munis) out.push({ kind: "localidade", id: `m-${m.id}`, title: `${m.name} (${m.uf})`, subtitle: "Município", href: `/eleicoes?uf=${m.uf}&municipio=${m.id}` });
  return out;
}

/** Busca global (server-side): páginas, base eleitoral oficial e conteúdo dos debates. */
export async function search(q: string, limit = 24): Promise<SearchHit[]> {
  const term = norm(q.trim());
  const repo = await getRepository();
  // Debates fora do produto (ocultos): a busca não indexa debates, temas, eventos nem falas.
  const debates: Awaited<ReturnType<typeof repo.listDebates>> = [];
  const cands = await repo.getCandidates();
  const sources = await repo.getSources();
  if (!term) return PAGES.slice(0, limit);

  const hits: SearchHit[] = [];
  const match = (s: string) => norm(s).includes(term);
  hits.push(...PAGES.filter((x) => match(x.title)));
  hits.push(...(await electoral(term, q.trim()).catch(() => [])));
  const first = debates[0]?.id;
  if (first) for (const c of cands) if (match(c.name)) hits.push({ kind: "candidato", id: c.id, title: c.name, subtitle: "Participante de debate", href: `/debates/${first}/analytics#candidato-${c.id}` });
  for (const d of debates) if (match(`${d.title} ${d.broadcaster}`)) hits.push({ kind: "debate", id: d.id, title: d.title, subtitle: d.broadcaster, href: `/debates/${d.id}` });
  if (first) for (const t of TOPICS) if (match(TOPIC_LABEL[t])) hits.push({ kind: "tema", id: t, title: TOPIC_LABEL[t], subtitle: "Tema", href: `/debates/${first}/analytics?tema=${t}#temas` });
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
