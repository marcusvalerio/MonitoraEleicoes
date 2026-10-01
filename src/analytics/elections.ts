import type { Sql } from "@/persistence/db";
import type { FilterSpec } from "@/domain/filters";
import { effectiveUfs } from "@/domain/filters";
import { MAJORITARIAN, OFFICES, REGIONS, normalizeName } from "@/elections/reference";

/**
 * ANALYTICS ELEITORAIS — agregações no banco sobre dados OFICIAIS do TSE (result_candidacy, candidacy).
 * Percentual = votos nominais válidos do candidato ÷ soma dos votos nominais válidos dos candidatos do MESMO cargo
 * no MESMO recorte (calculado antes de filtros de partido/nome). Recorte que mistura disputas distintas
 * (ex.: Governador somado em várias UFs) ⇒ percentual e colocação "não se aplicam" (null), nunca inventados.
 * Ciclo sem resultados publicados ⇒ status do ciclo, sem linhas (ausência ≠ 0).
 */
type Row = Record<string, unknown>;

export interface ElectionSummary {
  year: number;
  name: string;
  status: string;
  importedAt: string | null;
  candidacies: number;
  resultRows: number;
}

export async function electionsSummary(sql: Sql): Promise<ElectionSummary[]> {
  const rows = (await sql`select e.year, e.name, e.status, e.imported_at,
      (select count(*)::int from candidacy c where c.year = e.year) as candidacies,
      (select count(*)::int from result_candidacy r where r.year = e.year) as result_rows
    from election e order by e.year desc`) as Row[];
  return rows.map((r) => ({ year: r.year as number, name: r.name as string, status: r.status as string, importedAt: r.imported_at ? new Date(r.imported_at as string).toISOString() : null, candidacies: r.candidacies as number, resultRows: r.result_rows as number }));
}

/** Condição de território para linhas de resultado (município ou UF): usa a coluna `uf` do território. */
function territoryScope(f: FilterSpec) {
  const ufs = effectiveUfs(f, REGIONS);
  return { ufs, municipality: f.municipality ?? null };
}

export interface ResultRow {
  candidacyId: number;
  personId: number | null;
  identityStatus: string | null;
  name: string;
  ballotName: string;
  party: string | null;
  officeId: number;
  territoryId: number;
  uf: string | null;
  votes: number;
  /** null = não se aplica (recorte mistura disputas) */
  pct: number | null;
  rank: number | null;
  status: string | null;
}

export interface ResultsTable {
  year: number;
  round: 1 | 2;
  officeId: number;
  electionStatus: string;
  scope: { ufs: string[]; municipality: number | null };
  /** "value" | "not_available" (ciclo sem resultados) | "not_applicable" (percentual sem sentido no recorte) */
  pctStatus: "value" | "not_applicable";
  rows: ResultRow[];
  totalNominalVotes: number | null;
  note: string | null;
}

/** Tabela de resultados de um cargo no recorte do filtro (ordenada por votos). */
export async function resultsTable(sql: Sql, f: FilterSpec, limit = 50): Promise<ResultsTable> {
  const office = f.offices[0] ?? 1;
  const round = f.round ?? 1;
  const { ufs, municipality } = territoryScope(f);
  const [e] = (await sql`select status from election where year = ${f.year}`) as { status: string }[];
  const status = e?.status ?? "not_imported";
  const ufScoped = OFFICES.find((o) => o.id === office)?.scope === "UF";
  // Um único pleito: presidente (qualquer recorte) ou cargo estadual restrito a uma UF/município.
  const single = !ufScoped || ufs.length === 1 || municipality !== null;
  const base = { year: f.year, round: round as 1 | 2, officeId: office, electionStatus: status, scope: { ufs, municipality } };
  if (status === "candidacies_only" || status === "scheduled" || status === "not_imported")
    return { ...base, pctStatus: "not_applicable", rows: [], totalNominalVotes: null, note: status === "candidacies_only" ? "Resultados ainda não publicados pelo TSE para este ciclo." : "Resultados deste ciclo ainda não importados." };
  const q = f.candidateQuery ? `%${normalizeName(f.candidateQuery)}%` : null;
  const rows = (await sql.query(
    `with agg as (
       select r.candidacy_id, sum(r.votes)::bigint as votes
       from result_candidacy r join territory t on t.id = r.territory_id
       where r.year = $1 and r.round = $2 and r.office_id = $3 and r.votes_status = 'value'
         and ($4::text[] = '{}' or t.uf = any($4::text[]))
         and ($5::int is null or t.id = $5)
       group by r.candidacy_id),
     tot as (select sum(votes)::bigint as total from agg)
     select c.id, c.name, c.ballot_name, c.party_acronym, c.office_id, c.territory_id, tt.uf, a.votes, tot.total,
            case when $2 = 2 then c.status_round2 else c.status_round1 end as status,
            l.person_id, l.status as identity_status,
            rank() over (order by a.votes desc) as rnk
     from agg a cross join tot join candidacy c on c.id = a.candidacy_id join territory tt on tt.id = c.territory_id
     left join identity_link l on l.candidacy_id = c.id
     where ($6::text[] = '{}' or c.party_acronym = any($6::text[]))
       and ($7::text is null or c.normalized_name like $7 or upper(c.ballot_name) like $7)
       and ($8::int[] = '{}' or c.id = any($8::int[]))
     order by a.votes desc limit $9`,
    [f.year, round, office, ufs, municipality, f.parties, q, f.candidacyIds, limit],
  )) as Row[];
  const total = rows[0] ? Number(rows[0].total) : null;
  return {
    ...base,
    pctStatus: single ? "value" : "not_applicable",
    totalNominalVotes: single ? total : null,
    note: single ? null : "Recorte com várias disputas estaduais: percentual e colocação não se aplicam (selecione uma UF).",
    rows: rows.map((r) => ({
      candidacyId: r.id as number,
      personId: (r.person_id as number) ?? null,
      identityStatus: (r.identity_status as string) ?? null,
      name: r.name as string,
      ballotName: r.ballot_name as string,
      party: (r.party_acronym as string) ?? null,
      officeId: r.office_id as number,
      territoryId: r.territory_id as number,
      uf: (r.uf as string) ?? null,
      votes: Number(r.votes),
      pct: single && total ? Number(r.votes) / total : null,
      rank: single ? Number(r.rnk) : null,
      status: (r.status as string) ?? null,
    })),
  };
}

/** Votos por partido e ciclo (mesmo cargo e recorte) — comparação histórica 2014×2018×2022; 2026 com status. */
export async function partyHistory(sql: Sql, f: FilterSpec, parties: string[]) {
  const office = f.offices[0] ?? 1;
  const { ufs, municipality } = territoryScope(f);
  const rows = (await sql.query(
    `select r.year, c.party_acronym as party, sum(r.votes)::bigint as votes
     from result_candidacy r join candidacy c on c.id = r.candidacy_id join territory t on t.id = r.territory_id
     where r.round = 1 and r.office_id = $1 and r.votes_status = 'value' and c.party_acronym = any($2::text[])
       and ($3::text[] = '{}' or t.uf = any($3::text[])) and ($4::int is null or t.id = $4)
     group by 1, 2`,
    [office, parties, ufs, municipality],
  )) as Row[];
  const elections = await electionsSummary(sql);
  return elections.map((e) => ({
    year: e.year,
    status: e.status,
    parties: parties.map((p) => {
      const r = rows.find((x) => x.year === e.year && x.party === p);
      return { party: p, votes: r ? Number(r.votes) : null, votesStatus: r ? "value" : e.status === "results_official" ? "not_available" : "not_collected" };
    }),
  }));
}

export interface PersonHistoryItem {
  candidacyId: number;
  year: number;
  officeId: number;
  office: string;
  territory: string;
  uf: string | null;
  party: string | null;
  ballotName: string;
  statusRound1: string | null;
  statusRound2: string | null;
  votesRound1: number | null;
  identity: { status: string; method: string; confidence: string };
}

/** Histórico de uma pessoa: SOMENTE candidaturas com vínculo resolvido/manual (nunca por nome). */
export async function personHistory(sql: Sql, personId: number): Promise<PersonHistoryItem[]> {
  const rows = (await sql`select c.id, c.year, c.office_id, o.name as office, t.name as territory, t.uf, c.party_acronym, c.ballot_name, c.status_round1, c.status_round2,
      l.status, l.method, l.confidence,
      (select sum(r.votes)::bigint from result_candidacy r where r.candidacy_id = c.id and r.round = 1 and r.votes_status = 'value') as votes
    from identity_link l join candidacy c on c.id = l.candidacy_id join office o on o.id = c.office_id join territory t on t.id = c.territory_id
    where l.person_id = ${personId} and l.status in ('resolved', 'manual') order by c.year desc`) as Row[];
  return rows.map((r) => ({
    candidacyId: r.id as number,
    year: r.year as number,
    officeId: r.office_id as number,
    office: r.office as string,
    territory: r.territory as string,
    uf: (r.uf as string) ?? null,
    party: (r.party_acronym as string) ?? null,
    ballotName: r.ballot_name as string,
    statusRound1: (r.status_round1 as string) ?? null,
    statusRound2: (r.status_round2 as string) ?? null,
    votesRound1: r.votes === null || r.votes === undefined ? null : Number(r.votes),
    identity: { status: r.status as string, method: r.method as string, confidence: r.confidence as string },
  }));
}

/** Busca de candidaturas por nome (normalizado) com filtros de ciclo/cargo/UF/partido. */
export async function searchCandidacies(sql: Sql, f: FilterSpec, limit = 20) {
  const q = `%${normalizeName(f.candidateQuery ?? "")}%`;
  const ufs = effectiveUfs(f, REGIONS);
  return (await sql.query(
    `select c.id, c.year, c.name, c.ballot_name, c.party_acronym, c.office_id, t.uf, l.person_id, l.status as identity_status
     from candidacy c join territory t on t.id = c.territory_id left join identity_link l on l.candidacy_id = c.id
     where (c.normalized_name like $1 or upper(c.ballot_name) like $1) and c.year = $2
       and ($3::int[] = '{}' or c.office_id = any($3::int[])) and ($4::text[] = '{}' or t.uf = any($4::text[]) or t.uf is null)
       and ($5::text[] = '{}' or c.party_acronym = any($5::text[]))
     order by c.office_id, c.name limit $6`,
    [q, f.year, f.offices, ufs, f.parties, limit],
  )) as Row[];
}

/** Resultado por território filho (mapa): para presidente por UF; para cargo estadual por município da UF. */
export async function resultsByTerritory(sql: Sql, f: FilterSpec, candidacyId: number) {
  const office = f.offices[0] ?? 1;
  const round = f.round ?? 1;
  const level = MAJORITARIAN.has(office) ? "uf" : "uf";
  return (await sql.query(
    `with per as (
       select t.uf, sum(r.votes)::bigint as votes from result_candidacy r join territory t on t.id = r.territory_id
       where r.year = $1 and r.round = $2 and r.candidacy_id = $3 and r.votes_status = 'value' group by t.uf),
     tot as (
       select t.uf, sum(r.votes)::bigint as total from result_candidacy r join territory t on t.id = r.territory_id
       where r.year = $1 and r.round = $2 and r.office_id = $4 and r.votes_status = 'value' group by t.uf)
     select per.uf, per.votes, tot.total, per.votes::float / nullif(tot.total, 0) as pct, $5::text as level
     from per join tot on tot.uf = per.uf order by per.uf`,
    [f.year, round, candidacyId, office, level],
  )) as Row[];
}

/**
 * Candidatura mais votada por UF (camada eleitoral do mapa): soma dos agregados oficiais da UF
 * (majoritários são guardados por município, proporcionais por UF — ambos têm `territory.uf`).
 * Percentual = votos ÷ soma dos votos nominais do cargo na UF. UF sem linhas ⇒ ausente (nunca 0).
 */
export async function leadersByUf(sql: Sql, f: FilterSpec) {
  const office = f.offices[0] ?? 1;
  const round = f.round ?? 1;
  return (await sql.query(
    `with agg as (
       select t.uf, r.candidacy_id, sum(r.votes)::bigint as votes
       from result_candidacy r join territory t on t.id = r.territory_id and t.uf is not null and t.uf <> 'ZZ'
       where r.year = $1 and r.round = $2 and r.office_id = $3 and r.votes_status = 'value'
       group by t.uf, r.candidacy_id),
     per as (select agg.*, sum(votes) over (partition by uf) as total, row_number() over (partition by uf order by votes desc) as rk from agg)
     select per.uf, per.candidacy_id, c.ballot_name, c.party_acronym, per.votes::bigint as votes, per.total::bigint as total,
            per.votes::float / nullif(per.total, 0) as share
     from per join candidacy c on c.id = per.candidacy_id where per.rk = 1 order by per.uf`,
    [f.year, round, office],
  )) as { uf: string; candidacy_id: number; ballot_name: string; party_acronym: string | null; votes: string; total: string; share: number | null }[];
}

/** Municípios de uma UF (filtro global). */
export async function municipalitiesOf(sql: Sql, uf: string) {
  return (await sql`select id, name from territory where level = 'municipio' and uf = ${uf} order by name`) as { id: number; name: string }[];
}

/** Candidaturas de um ciclo no recorte (ex.: 2026, antes de haver resultados). Ordem alfabética — não é ranking. */
export async function listCandidacies(sql: Sql, f: FilterSpec, limit = 100) {
  const office = f.offices[0] ?? 1;
  const ufs = effectiveUfs(f, REGIONS);
  const q = f.candidateQuery ? `%${normalizeName(f.candidateQuery)}%` : null;
  const rows = (await sql.query(
    `select c.id, c.ballot_name, c.name, c.ballot_number, c.party_acronym, c.situation, t.uf, l.person_id, count(*) over () as total
     from candidacy c join territory t on t.id = c.territory_id left join identity_link l on l.candidacy_id = c.id and l.status in ('resolved', 'manual')
     where c.year = $1 and c.office_id = $2 and ($3::text[] = '{}' or t.uf = any($3::text[]) or c.territory_id = 0)
       and ($4::text[] = '{}' or c.party_acronym = any($4::text[])) and ($5::text is null or c.normalized_name like $5 or upper(c.ballot_name) like $5)
     order by t.uf nulls first, c.ballot_name limit $6`,
    [f.year, office, ufs, f.parties, q, limit],
  )) as Row[];
  return { total: rows[0] ? Number(rows[0].total) : 0, rows: rows.map((r) => ({ candidacyId: r.id as number, ballotName: r.ballot_name as string, name: r.name as string, number: (r.ballot_number as number) ?? null, party: (r.party_acronym as string) ?? null, situation: (r.situation as string) ?? null, uf: (r.uf as string) ?? null, personId: (r.person_id as number) ?? null })) };
}

/**
 * Comparação factual entre ciclos no mesmo recorte (cargo × UF/município): nº de candidaturas, votos nominais
 * apurados e partidos com votos. Ciclo sem resultados ⇒ votos null com status (nunca 0).
 */
export async function compareCycles(sql: Sql, f: FilterSpec) {
  const office = f.offices[0] ?? 1;
  const ufs = effectiveUfs(f, REGIONS);
  const muni = f.municipality ?? null;
  const [cands, votes, elections] = await Promise.all([
    sql.query(
      `select c.year, count(*)::int as n from candidacy c join territory t on t.id = c.territory_id
       where c.office_id = $1 and ($2::text[] = '{}' or t.uf = any($2::text[]) or c.territory_id = 0) group by 1`,
      [office, ufs],
    ) as unknown as Promise<{ year: number; n: number }[]>,
    sql.query(
      `select r.year, sum(r.votes)::bigint as votes, count(distinct c.party_acronym)::int as parties
       from result_candidacy r join territory t on t.id = r.territory_id join candidacy c on c.id = r.candidacy_id
       where r.round = 1 and r.office_id = $1 and r.votes_status = 'value' and ($2::text[] = '{}' or t.uf = any($2::text[])) and ($3::int is null or t.id = $3)
       group by 1`,
      [office, ufs, muni],
    ) as unknown as Promise<{ year: number; votes: string; parties: number }[]>,
    electionsSummary(sql),
  ]);
  return elections.map((e) => {
    const v = votes.find((x) => x.year === e.year);
    return {
      year: e.year,
      status: e.status,
      candidacies: muni ? null : (cands.find((x) => x.year === e.year)?.n ?? 0),
      nominalVotes: v ? Number(v.votes) : null,
      votesStatus: v ? "value" : e.status === "results_official" ? "not_available" : "not_collected",
      partiesWithVotes: v ? v.parties : null,
    };
  });
}

/** Busca de PESSOAS (vínculo resolvido/manual) por nome em todos os ciclos — para o comparador de trajetórias. */
export async function searchPeople(sql: Sql, q: string, limit = 12) {
  const like = `%${normalizeName(q)}%`;
  const rows = (await sql.query(
    `select l.person_id, (array_agg(c.ballot_name order by c.year desc))[1] as ballot_name, (array_agg(c.party_acronym order by c.year desc))[1] as party,
            array_agg(distinct c.year order by c.year) as years
     from candidacy c join identity_link l on l.candidacy_id = c.id and l.status in ('resolved', 'manual')
     where c.normalized_name like $1 or upper(c.ballot_name) like $1
     group by l.person_id order by max(c.year) desc, count(*) desc limit $2`,
    [like, limit],
  )) as Row[];
  return rows.map((r) => ({ personId: Number(r.person_id), ballotName: r.ballot_name as string, party: (r.party as string) ?? null, years: (r.years as number[]) ?? [] }));
}

/** Situação oficial que indica eleito (TSE: "ELEITO", "ELEITO POR QP", "ELEITO POR MÉDIA"). */
const ELECTED = `(coalesce(c.status_round2, c.status_round1) like 'ELEITO%')`;

/**
 * Perfil de PARTIDO por sigla (siglas mudam entre ciclos; comparação literal): registros por ciclo,
 * candidaturas, eleitos (situação oficial) e votos nominais por cargo; distribuição por UF num cargo/ciclo.
 */
export async function partyProfile(sql: Sql, acronym: string) {
  const regs = (await sql`select year, number, name, federation from party_registration where acronym = ${acronym} order by year desc`) as { year: number; number: number; name: string; federation: string | null }[];
  if (!regs.length) return null;
  const byOffice = (await sql.query(
    `with cands as (select c.id, c.year, c.office_id, ${ELECTED} as elected from candidacy c where c.party_acronym = $1),
          votes as (select r.candidacy_id, sum(r.votes)::bigint as v from result_candidacy r where r.round = 1 and r.votes_status = 'value' and r.candidacy_id in (select id from cands) group by 1)
     select k.year, k.office_id, o.name as office, count(*)::int as candidacies, count(*) filter (where k.elected)::int as elected, sum(v.v)::bigint as votes
     from cands k join office o on o.id = k.office_id left join votes v on v.candidacy_id = k.id group by 1, 2, 3 order by 1 desc, 2`,
    [acronym],
  )) as { year: number; office_id: number; office: string; candidacies: number; elected: number; votes: string | null }[];
  const elections = await electionsSummary(sql);
  return {
    acronym,
    registrations: regs,
    elections: elections.map((e) => ({ year: e.year, status: e.status })),
    byOffice: byOffice.map((r) => ({ year: r.year, officeId: r.office_id, office: r.office, candidacies: r.candidacies, elected: r.elected, votes: r.votes === null ? null : Number(r.votes), votesStatus: r.votes !== null ? "value" : elections.find((e) => e.year === r.year)?.status === "results_official" ? "not_available" : "not_collected" })),
  };
}

/** Votos do partido por UF (cargo × ciclo, 1º turno) e participação nos votos nominais do cargo na UF. */
export async function partyByUf(sql: Sql, acronym: string, year: number, officeId: number) {
  return (await sql.query(
    `with tot as (select t.uf, sum(r.votes)::bigint as total from result_candidacy r join territory t on t.id = r.territory_id
                  where r.year = $2 and r.round = 1 and r.office_id = $3 and r.votes_status = 'value' and t.uf is not null and t.uf <> 'ZZ' group by 1),
          par as (select t.uf, sum(r.votes)::bigint as votes from result_candidacy r join territory t on t.id = r.territory_id join candidacy c on c.id = r.candidacy_id
                  where r.year = $2 and r.round = 1 and r.office_id = $3 and r.votes_status = 'value' and c.party_acronym = $1 and t.uf is not null and t.uf <> 'ZZ' group by 1)
     select tot.uf, par.votes, tot.total, par.votes::float / nullif(tot.total, 0) as share from tot left join par on par.uf = tot.uf order by tot.uf`,
    [acronym, year, officeId],
  )) as { uf: string; votes: string | null; total: string; share: number | null }[];
}

/** Candidaturas eleitas do partido num ciclo (situação oficial TSE). */
export async function partyElected(sql: Sql, acronym: string, year: number) {
  return (await sql.query(
    `select c.id, c.ballot_name, c.office_id, o.name as office, t.uf, l.person_id, coalesce(c.status_round2, c.status_round1) as status
     from candidacy c join office o on o.id = c.office_id join territory t on t.id = c.territory_id
     left join identity_link l on l.candidacy_id = c.id and l.status in ('resolved', 'manual')
     where c.party_acronym = $1 and c.year = $2 and ${ELECTED} order by c.office_id, t.uf, c.ballot_name limit 200`,
    [acronym, year],
  )) as { id: number; ballot_name: string; office_id: number; office: string; uf: string | null; person_id: number | null; status: string }[];
}

/**
 * Colocação e percentual de uma candidatura na PRÓPRIA disputa (mesmo ciclo, cargo e circunscrição; 1º turno):
 * votos nominais da candidatura ÷ soma dos votos nominais de todas as candidaturas da disputa. Sem votos ⇒ null.
 */
export async function candidacyStanding(sql: Sql, candidacyId: number) {
  const [r] = (await sql.query(
    `with me as (select year, office_id, territory_id from candidacy where id = $1),
          race as (select c.id, sum(r.votes)::bigint as v from candidacy c join me on c.year = me.year and c.office_id = me.office_id and c.territory_id = me.territory_id
                   join result_candidacy r on r.candidacy_id = c.id and r.round = 1 and r.votes_status = 'value' group by c.id),
          ranked as (select id, v, rank() over (order by v desc) as rk, count(*) over () as n, sum(v) over () as total from race)
     select rk, n, v, total from ranked where id = $1`,
    [candidacyId],
  )) as { rk: string; n: string; v: string; total: string }[];
  return r ? { rank: Number(r.rk), of: Number(r.n), votes: Number(r.v), pct: Number(r.v) / Number(r.total) } : null;
}

/** Votos de uma candidatura por UF (1º turno) e participação nos votos nominais do cargo em cada UF. */
export async function candidacyByUf(sql: Sql, candidacyId: number) {
  return (await sql.query(
    `with me as (select year, office_id from candidacy where id = $1),
          mine as (select t.uf, sum(r.votes)::bigint as votes from result_candidacy r join territory t on t.id = r.territory_id where r.candidacy_id = $1 and r.round = 1 and r.votes_status = 'value' and t.uf <> 'ZZ' group by 1),
          tot as (select t.uf, sum(r.votes)::bigint as total from result_candidacy r join territory t on t.id = r.territory_id join me on r.year = me.year and r.office_id = me.office_id
                  where r.round = 1 and r.votes_status = 'value' and t.uf in (select uf from mine) group by 1)
     select mine.uf, mine.votes, tot.total, mine.votes::float / nullif(tot.total, 0) as share from mine join tot on tot.uf = mine.uf order by mine.votes desc`,
    [candidacyId],
  )) as { uf: string; votes: string; total: string; share: number | null }[];
}
