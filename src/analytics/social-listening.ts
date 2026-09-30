import type { Sql } from "@/persistence/db";
import type { FilterSpec } from "@/domain/filters";
import { effectiveUfs, periodWindow } from "@/domain/filters";
import { REGIONS, normalizeName } from "@/elections/reference";

/**
 * ANALYTICS DE SOCIAL LISTENING — agregações no banco sobre as FONTES CONECTADAS.
 *   volume = conteúdos · menções = vínculos conteúdo×entidade · engagement = só métricas fornecidas pela plataforma
 *   sentimento do conteúdo ≠ sentimento em relação à entidade · apoio só com evidência explícita.
 * "Não coletado" ≠ 0: cada número vem com a cobertura de coleta do período (janelas por fonte).
 * Variação vs período anterior só quando o período anterior também foi coletado (senão null).
 */
type Row = Record<string, unknown>;

/** Condições SQL comuns (registro `s`, análise `a`) + parâmetros. */
function where(f: FilterSpec, from: string, to: string, startIndex = 1) {
  const p: unknown[] = [];
  const c: string[] = [];
  const add = (sqlFrag: string, v: unknown) => {
    p.push(v);
    c.push(sqlFrag.replaceAll("$?", `$${startIndex + p.length - 1}`));
  };
  add("s.published_at >= $?::timestamptz", from);
  add("s.published_at < $?::timestamptz", to);
  if (f.platforms.length) add("s.platform = any($?::text[])", f.platforms);
  if (f.contentTypes.length) add("s.content_type = any($?::text[])", f.contentTypes);
  if (f.sentiments.length) add("a.content_sentiment = any($?::text[])", f.sentiments);
  if (f.topics.length) add("a.topic = any($?::text[])", f.topics);
  const ufs = effectiveUfs(f, REGIONS);
  if (ufs.length) add("a.geo_uf = any($?::text[])", ufs);
  if (f.candidacyIds.length) add("exists (select 1 from social_record_entity e where e.record_id = s.id and e.entity_type = 'candidacy' and e.entity_id = any($?::text[]))", f.candidacyIds.map(String));
  if (f.parties.length)
    add(
      "exists (select 1 from social_record_entity e left join candidacy c on e.entity_type = 'candidacy' and c.id::text = e.entity_id where e.record_id = s.id and (e.entity_type = 'party' and e.entity_id = any($?::text[]) or c.party_acronym = any($" + (startIndex + p.length) + "::text[])))",
      f.parties,
    );
  if (f.offices.length) add("exists (select 1 from social_record_entity e join candidacy c on c.id::text = e.entity_id where e.record_id = s.id and e.entity_type = 'candidacy' and c.office_id = any($?::int[]))", f.offices);
  return { sql: c.join(" and "), params: p };
}
const BASE = "from social_record s left join social_analysis a on a.record_id = s.id and a.content_hash = s.content_hash";

export interface Coverage {
  platform: string;
  name: string;
  accessStatus: string;
  enabled: boolean;
  /** Janelas do período: coletadas/parciais × falhas/sem acesso. */
  collectedWindows: number;
  failedWindows: number;
  blockedWindows: number;
  lastCollectedAt: string | null;
  lastError: string | null;
  /** "collected" | "partial" | "not_collected" | "unavailable" — estado do período para esta fonte. */
  periodStatus: "collected" | "partial" | "not_collected" | "unavailable";
}

export async function coverage(sql: Sql, f: FilterSpec, nowMs = Date.now()): Promise<Coverage[]> {
  const { from, to } = periodWindow(f.period, nowMs);
  const rows = (await sql.query(
    `select s.id, s.name, s.access_status, s.enabled, s.last_error,
       count(w.*) filter (where w.status in ('collected', 'partial'))::int as ok,
       count(w.*) filter (where w.status = 'partial')::int as partial,
       count(w.*) filter (where w.status in ('failed', 'rate_limited'))::int as failed,
       count(w.*) filter (where w.status in ('unsupported', 'requires_authorization'))::int as blocked,
       max(w.window_end) filter (where w.status in ('collected', 'partial')) as last_ok
     from social_source s left join social_collection_window w on w.source_id = s.id and w.window_end > $1 and w.window_start < $2
     group by s.id order by (s.access_status = 'active') desc, s.id`,
    [from, to],
  )) as Row[];
  return rows
    .filter((r) => !f.platforms.length || f.platforms.includes(r.id as string))
    .map((r) => ({
      platform: r.id as string,
      name: r.name as string,
      accessStatus: r.access_status as string,
      enabled: r.enabled as boolean,
      collectedWindows: r.ok as number,
      failedWindows: r.failed as number,
      blockedWindows: r.blocked as number,
      lastCollectedAt: r.last_ok ? new Date(r.last_ok as string).toISOString() : null,
      lastError: (r.last_error as string) ?? null,
      periodStatus: (r.ok as number) > 0 ? ((r.partial as number) > 0 || (r.failed as number) > 0 ? "partial" : "collected") : ["active", "configured", "error"].includes(r.access_status as string) ? "not_collected" : "unavailable",
    }));
}

async function count(sql: Sql, f: FilterSpec, from: string, to: string) {
  const w = where(f, from, to);
  const [r] = (await sql.query(
    `select count(*)::int as contents,
       count(*) filter (where s.content_type in ('comment', 'reply'))::int as comments,
       count(*) filter (where s.content_type in ('video', 'live', 'post', 'news'))::int as posts,
       (select count(*)::int from social_record_entity e where e.record_id = any(array_agg(s.id))) as mentions,
       (select count(distinct e.entity_id)::int from social_record_entity e where e.entity_type = 'candidacy' and e.record_id = any(array_agg(s.id))) as candidates,
       count(distinct s.platform)::int as platforms,
       sum((s.metrics->>'likes')::bigint) as likes, count(*) filter (where s.metrics ? 'likes')::int as likes_n,
       sum((s.metrics->>'views')::bigint) as views, count(*) filter (where s.metrics ? 'views')::int as views_n
     ${BASE} where ${w.sql}`,
    w.params,
  )) as Row[];
  return r;
}

export async function kpis(sql: Sql, f: FilterSpec, nowMs = Date.now()) {
  const { from, to } = periodWindow(f.period, nowMs);
  const span = Date.parse(to) - Date.parse(from);
  const prevFrom = new Date(Date.parse(from) - span).toISOString();
  const [cur, prev, cov] = await Promise.all([count(sql, f, from, to), count(sql, f, prevFrom, from), coverage(sql, f, nowMs)]);
  const collected = cov.some((c) => c.periodStatus === "collected" || c.periodStatus === "partial");
  // o período anterior só é comparável se houve janela coletada nele
  const [pw] = (await sql`select count(*)::int as n from social_collection_window where status in ('collected', 'partial') and window_end > ${prevFrom} and window_start < ${from}`) as { n: number }[];
  const n = (k: string) => (collected ? Number(cur[k] ?? 0) : null);
  const change = (k: string) => (collected && pw.n > 0 && Number(prev[k]) > 0 ? (Number(cur[k]) - Number(prev[k])) / Number(prev[k]) : null);
  return {
    window: { from, to },
    collected,
    contents: n("contents"),
    contentsChange: change("contents"),
    comments: n("comments"),
    posts: n("posts"),
    mentions: n("mentions"),
    candidatesMentioned: n("candidates"),
    platformsWithData: n("platforms"),
    platformsConnected: cov.filter((c) => c.accessStatus === "active" || c.accessStatus === "configured").length,
    engagement: { likes: cur.likes_n ? Number(cur.likes) : null, likesFrom: Number(cur.likes_n ?? 0), views: cur.views_n ? Number(cur.views) : null, viewsFrom: Number(cur.views_n ?? 0) },
    coverage: cov,
  };
}

/** Funil com os dados reais do período. */
export async function funnel(sql: Sql, f: FilterSpec, nowMs = Date.now()) {
  const { from, to } = periodWindow(f.period, nowMs);
  const w = where(f, from, to);
  const [r] = (await sql.query(
    `select count(*)::int as collected,
       count(*) filter (where a.relevant)::int as relevant,
       count(*) filter (where exists (select 1 from social_record_entity e where e.record_id = s.id and e.entity_type = 'candidacy'))::int as with_candidates,
       count(a.record_id)::int as classified,
       count(*) filter (where a.content_sentiment is not null and a.content_sentiment <> 'incerto')::int as with_sentiment,
       count(*) filter (where a.topic is not null and a.topic <> 'unknown')::int as with_topic
     ${BASE} where ${w.sql}`,
    w.params,
  )) as Row[];
  return [
    { key: "collected", label: "Conteúdos coletados", count: r.collected as number },
    { key: "relevant", label: "Conteúdos relevantes", count: r.relevant as number },
    { key: "with_candidates", label: "Com candidatos", count: r.with_candidates as number },
    { key: "classified", label: "Classificados", count: r.classified as number },
    { key: "with_sentiment", label: "Com sentimento definido", count: r.with_sentiment as number },
    { key: "with_topic", label: "Com tema", count: r.with_topic as number },
  ];
}

export type SeriesDim = "total" | "platform" | "candidate" | "party" | "topic";
export type Bucket = "hour" | "day" | "week" | "month";

/** Série temporal por dimensão (horário da publicação na plataforma). */
export async function series(sql: Sql, f: FilterSpec, bucket: Bucket, dim: SeriesDim, nowMs = Date.now()) {
  const { from, to } = periodWindow(f.period, nowMs);
  const w = where(f, from, to);
  const key =
    dim === "platform" ? "s.platform" : dim === "topic" ? "coalesce(a.topic, 'unknown')" : dim === "total" ? "'total'" : dim === "party" ? "coalesce(c.party_acronym, e.entity_id)" : "e.entity_id";
  const join = dim === "candidate" ? "join social_record_entity e on e.record_id = s.id and e.entity_type = 'candidacy'" : dim === "party" ? "join social_record_entity e on e.record_id = s.id left join candidacy c on e.entity_type = 'candidacy' and c.id::text = e.entity_id" : "";
  const rows = (await sql.query(
    `select date_trunc('${bucket}', s.published_at at time zone 'America/Sao_Paulo') as t, ${key} as k, count(distinct s.id)::int as n
     ${BASE} ${join} where ${w.sql} group by 1, 2 order by 1`,
    w.params,
  )) as Row[];
  return rows.map((r) => ({ t: new Date(r.t as string).toISOString(), key: String(r.k), count: r.n as number }));
}

/** Tabela analítica de candidatos (métricas observadas; sem pontuação, sem "melhor/pior"). */
export async function candidateTable(sql: Sql, f: FilterSpec, nowMs = Date.now()) {
  const { from, to } = periodWindow(f.period, nowMs);
  const span = Date.parse(to) - Date.parse(from);
  const prevFrom = new Date(Date.parse(from) - span).toISOString();
  const w = where({ ...f, candidacyIds: [] }, from, to, 3);
  const rows = (await sql.query(
    `with cur as (
       select e.entity_id, count(distinct s.id)::int as mentions,
         count(*) filter (where e.entity_sentiment = 'positivo')::int as pos, count(*) filter (where e.entity_sentiment = 'negativo')::int as neg,
         count(*) filter (where e.entity_sentiment in ('incerto', 'neutro', 'misto'))::int as other,
         count(*) filter (where e.mention_type = 'apoio_explicito')::int as support, count(*) filter (where e.mention_type = 'critica_explicita')::int as critique,
         sum((s.metrics->>'likes')::bigint) as likes, count(*) filter (where s.metrics ? 'likes')::int as likes_n,
         (array_agg(a.topic order by a.topic) filter (where a.topic is not null and a.topic <> 'unknown')) as topics
       ${BASE} join social_record_entity e on e.record_id = s.id and e.entity_type = 'candidacy'
       where ${w.sql} group by e.entity_id),
     prev as (
       select e.entity_id, count(distinct s.id)::int as mentions from social_record s join social_record_entity e on e.record_id = s.id and e.entity_type = 'candidacy'
       where s.published_at >= $1 and s.published_at < $2 group by e.entity_id)
     select cur.*, prev.mentions as prev_mentions, c.name, c.ballot_name, c.party_acronym, c.office_id, c.year
     from cur left join prev on prev.entity_id = cur.entity_id left join candidacy c on c.id::text = cur.entity_id
     order by cur.mentions desc limit 50`,
    [prevFrom, from, ...w.params],
  )) as Row[];
  const topTopics = (xs: string[] | null) => {
    const m = new Map<string, number>();
    for (const x of xs ?? []) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  };
  return rows.map((r) => ({
    candidacyId: Number(r.entity_id),
    name: (r.ballot_name as string) ?? (r.name as string) ?? `candidatura ${r.entity_id}`,
    party: (r.party_acronym as string) ?? null,
    mentions: r.mentions as number,
    change: r.prev_mentions ? ((r.mentions as number) - (r.prev_mentions as number)) / (r.prev_mentions as number) : null,
    sentiment: { positivo: r.pos as number, negativo: r.neg as number, indefinido: r.other as number },
    explicitSupport: r.support as number,
    explicitCritique: r.critique as number,
    likes: (r.likes_n as number) ? Number(r.likes) : null,
    topics: topTopics(r.topics as string[] | null),
  }));
}

/** Menções por UF — somente conteúdos com UF MENCIONADA explicitamente; o restante é "localização desconhecida". */
export async function byUf(sql: Sql, f: FilterSpec, nowMs = Date.now()) {
  const { from, to } = periodWindow(f.period, nowMs);
  const w = where({ ...f, ufs: [], regions: [] }, from, to);
  const rows = (await sql.query(`select a.geo_uf as uf, count(*)::int as n ${BASE} where ${w.sql} group by 1`, w.params)) as Row[];
  return { byUf: rows.filter((r) => r.uf).map((r) => ({ uf: r.uf as string, count: r.n as number })), unknown: rows.filter((r) => !r.uf).reduce((a, r) => a + (r.n as number), 0), note: "UF mencionada no conteúdo (assunto), não localização do autor. Sem evidência explícita ⇒ desconhecida." };
}

/** Feed paginado por cursor (published_at desc, id). */
export async function feed(sql: Sql, f: FilterSpec, cursor: string | null, limit = 30, nowMs = Date.now()) {
  const { from, to } = periodWindow(f.period, nowMs);
  const w = where(f, from, to);
  const [cAt, cId] = cursor ? cursor.split("|") : [null, null];
  const rows = (await sql.query(
    `select s.id, s.platform, s.content_type, s.title, s.text, s.published_at, s.permalink, s.metrics, s.author_display_name, s.parent_id, a.content_sentiment, a.topic, a.geo_uf, a.geo_evidence,
       (select json_agg(json_build_object('type', e.entity_type, 'id', e.entity_id, 'mention', e.mention_type, 'sentiment', e.entity_sentiment, 'evidence', e.evidence)) from social_record_entity e where e.record_id = s.id) as entities
     ${BASE} where ${w.sql} and ($${w.params.length + 1}::timestamptz is null or (s.published_at, s.id) < ($${w.params.length + 1}::timestamptz, $${w.params.length + 2}::text))
     order by s.published_at desc, s.id desc limit ${Math.min(100, limit)}`,
    [...w.params, cAt, cId],
  )) as Row[];
  const last = rows.at(-1);
  return { items: rows, nextCursor: rows.length === limit && last ? `${new Date(last.published_at as string).toISOString()}|${last.id}` : null };
}

/** Busca livre: conteúdos + candidaturas + partidos + temas + debates. */
export async function globalSearch(sql: Sql, q: string, f: FilterSpec, nowMs = Date.now()) {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return { contents: [], candidacies: [], parties: [], debates: [] };
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const { from, to } = periodWindow(f.period, nowMs);
  const [contents, candidacies, parties, debates] = await Promise.all([
    sql.query(`select s.id, s.platform, s.content_type, s.text, s.published_at, s.permalink from social_record s where s.text ilike $1 and s.published_at >= $2 and s.published_at < $3 order by s.published_at desc limit 20`, [like, from, to]),
    sql.query(`select c.id, c.year, c.ballot_name, c.party_acronym, c.office_id, l.person_id from candidacy c left join identity_link l on l.candidacy_id = c.id where c.normalized_name like $1 order by c.year desc, c.office_id limit 20`, [`%${normalizeName(term)}%`]),
    sql.query(`select distinct acronym, name from party_registration where acronym ilike $1 or name ilike $1 limit 10`, [like]),
    sql.query(`select id, title, starts_at from debate where title ilike $1 order by starts_at desc limit 10`, [like]),
  ]);
  return { contents, candidacies, parties, debates };
}
