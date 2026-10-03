import type { Sql } from "@/persistence/db";

/**
 * HOME — destaques recentes por TIPO DE EVIDÊNCIA (nunca misturados): dado oficial (TSE), cobertura (g1),
 * pesquisas registradas (TSE) e conversação (redes). Só o que foi coletado; datasets de teste excluídos.
 */
export interface Highlight {
  kind: "tse" | "g1" | "pesquisa" | "redes";
  at: string | null;
  title: string;
  detail: string | null;
  href: string | null;
}

export async function homeCounts(sql: Sql, year: number) {
  const [r] = (await sql`select
      (select count(*)::int from candidacy where year = ${year}) as candidacies,
      (select count(*)::int from party_registration where year = ${year}) as parties,
      (select count(*)::int from poll where year = ${year}) as polls,
      (select count(*)::int from social_source where enabled and access_status in ('active', 'configured')) as social_sources,
      (select count(*)::int from territory where level = 'municipio') as municipalities`) as Record<string, number>[];
  return r;
}

export async function highlights(sql: Sql, limit = 8): Promise<Highlight[]> {
  const [snap, g1, polls, social] = await Promise.all([
    sql`select s.collected_at, s.source_generated_at, s.phase, o.name as office, t.name as territory, s.counted_pct, s.counted_pct_status
        from count_snapshot s join office o on o.id = s.office_id join territory t on t.id = s.territory_id
        where s.territory_id = 0 or s.office_id <> 1 order by s.source_generated_at desc, s.id desc limit 1`,
    sql`select e.headline, e.original_text, e.published_at, e.collected_at, e.url, e.debate_id from editorial_event e join dataset d on d.id = e.dataset_id
        where d.kind not in ('demo', 'fixture') and e.removed_at is null order by coalesce(e.published_at, e.collected_at) desc limit 3`,
    sql`select protocol, uf, coalesce(nullif(company_trade_name, ''), company_name) as company, offices_raw, release_date, registered_at from poll
        order by registered_at desc nulls last limit 3`,
    sql`select s.platform, s.title, s.text, s.published_at, s.permalink from social_record s join source_record sr on sr.id = s.source_record_id join dataset d on d.id = sr.dataset_id
        where d.kind not in ('demo', 'fixture') order by s.published_at desc nulls last limit 2`,
  ]);
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const out: Highlight[] = [];
  for (const s of snap as Record<string, unknown>[])
    out.push({
      kind: "tse",
      at: iso(s.collected_at),
      title: `Apuração · ${s.office} · ${s.territory}: ${s.phase === "not_started" ? "totalização não iniciada" : s.phase === "final" ? "totalizada" : "em apuração"}`,
      detail: s.counted_pct_status === "value" && s.phase !== "not_started" ? `${Number(s.counted_pct).toFixed(2).replace(".", ",")}% das seções totalizadas` : `arquivo oficial gerado em ${new Date(s.source_generated_at as string).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      href: "/eleicoes?ano=2026",
    });
  for (const e of g1 as Record<string, unknown>[]) out.push({ kind: "g1", at: iso(e.published_at ?? e.collected_at), title: (e.headline as string) || String(e.original_text).slice(0, 120), detail: "Cobertura editorial", href: `/ao-vivo/${e.debate_id}` });
  for (const p of polls as Record<string, unknown>[]) out.push({ kind: "pesquisa", at: iso(p.registered_at), title: `${p.company} registrou pesquisa ${p.uf === "BR" ? "nacional" : `em ${p.uf}`}`, detail: `${p.offices_raw ?? ""} · protocolo ${p.protocol} · sem percentuais na fonte`, href: "/pesquisas" });
  for (const s of social as Record<string, unknown>[]) out.push({ kind: "redes", at: iso(s.published_at), title: String((s.title as string) || (s.text as string) || "").slice(0, 120), detail: `Publicação coletada · ${s.platform}`, href: (s.permalink as string) ?? "/monitoramento" });
  return out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, limit);
}
