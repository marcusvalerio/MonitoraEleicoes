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
