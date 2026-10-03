import type { Sql } from "@/persistence/db";
import type { TerritoryLevel } from "./model";

/**
 * Resultado OFICIAL observado (somente leitura do que o pipeline TSE já gravou em result_candidacy — nenhuma
 * segunda apuração). Escopo por território: Brasil = tudo; UF = linhas da UF; município = o próprio município.
 * Participação = votos ÷ soma dos votos nominais do cargo no mesmo escopo (mesma regra do restante do Monitora).
 */
export type ObservedState = "value" | "not_available" | "no_match" | "not_linked" | "source_unavailable";

export interface CandidacyRef {
  id: number;
  year: number;
  officeId: number;
  office: string;
  ballotName: string;
  party: string | null;
  uf: string | null;
  personId: number | null;
  datasetKind: string | null;
}

export interface Observed {
  territoryId: number;
  state: ObservedState;
  votes: number | null;
  total: number | null;
  share: number | null;
}

export async function candidacyRef(sql: Sql, candidacyId: number): Promise<CandidacyRef | null> {
  const r = (await sql`
    select c.id, c.year, c.office_id, o.name as office, c.ballot_name, c.party_acronym, t.uf, l.person_id, d.kind as dataset_kind
    from candidacy c join office o on o.id = c.office_id join territory t on t.id = c.territory_id
    left join identity_link l on l.candidacy_id = c.id and l.status in ('resolved', 'manual')
    left join source_record sr on sr.id = c.source_record_id left join dataset d on d.id = sr.dataset_id
    where c.id = ${candidacyId}`) as Record<string, unknown>[];
  const x = r[0];
  if (!x) return null;
  return { id: x.id as number, year: Number(x.year), officeId: Number(x.office_id), office: x.office as string, ballotName: x.ballot_name as string, party: (x.party_acronym as string) ?? null, uf: (x.uf as string) ?? null, personId: (x.person_id as number) ?? null, datasetKind: (x.dataset_kind as string) ?? null };
}

/** Outras candidaturas OFICIAIS da mesma pessoa (identidade resolvida) — bases possíveis de comparação temporal. */
export async function otherCandidacies(sql: Sql, personId: number, exceptId: number) {
  return (await sql`
    select c.id, c.year, o.name as office, c.ballot_name from identity_link l join candidacy c on c.id = l.candidacy_id join office o on o.id = c.office_id
    where l.person_id = ${personId} and l.status in ('resolved', 'manual') and c.id <> ${exceptId} order by c.year desc`) as { id: number; year: number; office: string; ballot_name: string }[];
}

/** Votos observados da candidatura em cada território (round 1 por padrão). */
export async function observedFor(sql: Sql, c: CandidacyRef, territories: { id: number; level: TerritoryLevel; uf: string | null }[], round = 1): Promise<Observed[]> {
  if (!territories.length) return [];
  const any = (await sql`select 1 from result_candidacy where year = ${c.year} and round = ${round} and office_id = ${c.officeId} limit 1`) as unknown[];
  if (!any.length) return territories.map((t) => ({ territoryId: t.id, state: "not_available", votes: null, total: null, share: null }));
  const rows = (await sql.query(
    `with scope as (select * from unnest($1::int[], $2::text[], $3::text[]) as s(id, level, uf)),
     agg as (
       select s.id, sum(r.votes) filter (where r.candidacy_id = $4)::bigint as votes, sum(r.votes)::bigint as total,
              count(*) filter (where r.candidacy_id = $4) as mine
       from scope s join result_candidacy r on r.year = $5 and r.round = $6 and r.office_id = $7 and r.votes_status = 'value'
       join territory t on t.id = r.territory_id
       where s.level = 'pais' or (s.level = 'uf' and t.uf = s.uf) or (s.level = 'municipio' and t.id = s.id)
       group by s.id)
     select * from agg`,
    [territories.map((t) => t.id), territories.map((t) => t.level), territories.map((t) => t.uf), c.id, c.year, round, c.officeId],
  )) as { id: number; votes: string | null; total: string | null; mine: string }[];
  const by = new Map(rows.map((r) => [Number(r.id), r]));
  return territories.map((t) => {
    const r = by.get(t.id);
    if (!r || Number(r.mine) === 0) return { territoryId: t.id, state: "no_match", votes: null, total: null, share: null };
    const votes = Number(r.votes);
    const total = r.total === null ? null : Number(r.total);
    return { territoryId: t.id, state: "value", votes, total, share: total ? votes / total : null };
  });
}

/** Arquivo oficial usado pelo importador de resultados (proveniência exibida com o selo DADO OFICIAL · TSE). */
export async function resultsSource(sql: Sql, year: number) {
  const r = (await sql`select source_url, finished_at from import_batch where year = ${year} and kind = 'results' and status = 'completed' order by finished_at desc nulls last limit 1`) as { source_url: string; finished_at: string | null }[];
  return r[0] ?? null;
}
