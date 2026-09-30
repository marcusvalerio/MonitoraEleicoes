import type { Sql } from "@/persistence/db";

/**
 * DEBATE × SOCIAL — associação TEMPORAL apenas: volume de conteúdos nas fontes conectadas antes, durante e depois
 * do debate (janelas de mesma duração). Nunca afirma causa ("associado temporalmente ao evento").
 * Janela sem coleta registrada ⇒ count null ("não coletado"), nunca 0.
 */
export type Phase = "antes" | "durante" | "depois";
export interface PhaseStat {
  phase: Phase;
  from: string;
  to: string;
  collected: boolean;
  count: number | null;
  byCandidacy: { candidacyId: number; name: string; mentions: number }[];
}
export interface DebateSocial {
  debateId: string;
  statement: string;
  phases: PhaseStat[];
}

export const TEMPORAL_NOTE = "Associado temporalmente ao evento — não indica causa.";

export async function debateSocial(sql: Sql, debateId: string, nowMs = Date.now()): Promise<DebateSocial | null> {
  const [d] = (await sql`select starts_at, ends_at from debate where id = ${debateId}`) as { starts_at: string; ends_at: string | null }[];
  if (!d) return null;
  const start = Date.parse(d.starts_at);
  const end = d.ends_at ? Date.parse(d.ends_at) : Math.min(nowMs, start + 3 * 3600_000);
  const dur = Math.max(end - start, 60_000);
  const spans: [Phase, number, number][] = [
    ["antes", start - dur, start],
    ["durante", start, end],
    ["depois", end, Math.min(end + dur, Math.max(nowMs, end))],
  ];
  const phases: PhaseStat[] = [];
  for (const [phase, a, b] of spans) {
    const from = new Date(a).toISOString();
    const to = new Date(b).toISOString();
    const [cov] = (await sql`select count(*)::int as n from social_collection_window
      where status in ('collected', 'partial') and window_start < ${to} and window_end > ${from}`) as { n: number }[];
    const collected = b > a && cov.n > 0;
    if (!collected) {
      phases.push({ phase, from, to, collected, count: null, byCandidacy: [] });
      continue;
    }
    const [c] = (await sql`select count(*)::int as n from social_record where published_at >= ${from} and published_at < ${to}`) as { n: number }[];
    const by = (await sql`select e.entity_id, coalesce(c.ballot_name, c.name, e.entity_id) as name, count(distinct s.id)::int as n
      from social_record s join social_record_entity e on e.record_id = s.id and e.entity_type = 'candidacy' left join candidacy c on c.id::text = e.entity_id
      where s.published_at >= ${from} and s.published_at < ${to} group by 1, 2 order by n desc limit 10`) as { entity_id: string; name: string; n: number }[];
    phases.push({ phase, from, to, collected, count: c.n, byCandidacy: by.map((r) => ({ candidacyId: Number(r.entity_id), name: r.name, mentions: r.n })) });
  }
  return { debateId, statement: TEMPORAL_NOTE, phases };
}
