import type { Sql } from "@/persistence/db";
import { BR, EXTERIOR, UF_IBGE } from "@/elections/reference";

/**
 * Apuração por território para o mapa 3D e o comparativo 1º × 2º turno. Somente DADO OFICIAL (count_snapshot do
 * worker do TSE). Ausência ≠ zero: território sem retrato volta como `null`, nunca como 0 voto.
 */
export interface TerritoryCandidate {
  sq: string;
  name: string;
  party: string | null;
  number: number | null;
  votes: number;
  /** % dos votos válidos publicado pelo TSE (null ⇒ não publicado). */
  pct: number | null;
}
export interface TerritoryResult {
  /** UF ("SP"), "ZZ" (exterior) ou código TSE do município. */
  key: string;
  territoryId: number;
  name: string;
  uf: string | null;
  phase: string;
  countedPct: number | null;
  validVotes: number | null;
  collectedAt: string;
  candidates: TerritoryCandidate[];
}

type Row = Record<string, unknown>;
const num = (v: unknown, s: unknown) => (s === "value" && v !== null && v !== undefined ? Number(v) : null);

async function latestBy(sql: Sql, q: { year: number; round: number; officeId: number }, where: "uf" | { uf: string }): Promise<TerritoryResult[]> {
  const ufFilter = where === "uf" ? null : where.uf;
  const rows = (await sql.query(
    `with latest as (
       select distinct on (s.territory_id) s.id, s.territory_id, s.phase, s.collected_at, s.counted_pct, s.counted_pct_status, s.valid_votes, s.valid_votes_status
       from count_snapshot s join territory t on t.id = s.territory_id
       where s.year = $1 and s.round = $2 and s.office_id = $3
         and (($4::text is null and t.level = 'uf') or ($4::text is not null and t.level = 'municipio' and t.uf = $4))
       order by s.territory_id, s.source_generated_at desc, s.id desc)
     select l.*, t.uf, t.name, t.tse_code,
       coalesce(json_agg(json_build_object('sq', cc.sq_candidato::text, 'name', cc.ballot_name, 'party', cc.party_acronym, 'number', cc.ballot_number, 'votes', cc.votes, 'pct', cc.pct, 'pct_status', cc.pct_status)
         order by cc.votes desc) filter (where cc.sq_candidato is not null), '[]') as cands
     from latest l join territory t on t.id = l.territory_id
     left join count_candidate cc on cc.snapshot_id = l.id and cc.votes_status = 'value'
       and (cc.vote_destination is null or cc.vote_destination = 'Válido')
     group by l.id, l.territory_id, l.phase, l.collected_at, l.counted_pct, l.counted_pct_status, l.valid_votes, l.valid_votes_status, t.uf, t.name, t.tse_code`,
    [q.year, q.round, q.officeId, ufFilter],
  )) as Row[];
  return rows.map((r) => ({
    key: ufFilter ? String(r.tse_code) : String(r.uf),
    territoryId: Number(r.territory_id),
    name: String(r.name),
    uf: (r.uf as string) ?? null,
    phase: String(r.phase),
    countedPct: num(r.counted_pct, r.counted_pct_status),
    validVotes: num(r.valid_votes, r.valid_votes_status),
    collectedAt: new Date(r.collected_at as string).toISOString(),
    candidates: (r.cands as Row[]).map((c) => ({ sq: String(c.sq), name: String(c.name), party: (c.party as string) ?? null, number: c.number === null ? null : Number(c.number), votes: Number(c.votes), pct: num(c.pct, c.pct_status) })),
  }));
}

/** UFs + Exterior (território 99, TSE "ZZ") — Presidente ou outro cargo, um turno. */
export const resultsByUf = (sql: Sql, q: { year: number; round: number; officeId: number }) => latestBy(sql, q, "uf");
/** Municípios de uma UF (ou cidades do exterior com uf = "ZZ"). */
export const resultsByMunicipality = (sql: Sql, q: { year: number; round: number; officeId: number; uf: string }) => latestBy(sql, q, { uf: q.uf });

/** Turnos com retrato coletado no ano (para o seletor 1º/2º turno). */
export async function roundsWithData(sql: Sql, year: number, officeId = 1): Promise<number[]> {
  const rows = (await sql`select distinct round from count_snapshot where year = ${year} and office_id = ${officeId} and territory_id = ${BR} order by round`) as { round: number }[];
  return rows.map((r) => Number(r.round));
}

export interface RoundComparisonRow {
  key: string;
  name: string;
  /** Votos e % por candidato finalista no 1º e no 2º turno (null ⇒ sem retrato oficial naquele turno). */
  first: Record<string, { votes: number; pct: number | null } | null>;
  second: Record<string, { votes: number; pct: number | null } | null>;
}
export interface RoundComparison {
  finalists: TerritoryCandidate[];
  rows: RoundComparisonRow[];
}

/**
 * Comparativo 1º × 2º turno SOMENTE dos candidatos presentes no 2º turno (identificados pelo nº de urna, estável
 * entre turnos). Nenhuma transferência de votos é inferida — só os números oficiais lado a lado.
 */
export function compareRounds(first: TerritoryResult[], second: TerritoryResult[], secondBr: TerritoryResult | null): RoundComparison | null {
  const finalists = (secondBr?.candidates ?? []).slice(0, 2);
  if (finalists.length < 2) return null;
  const nums = finalists.map((f) => f.number);
  const pick = (r: TerritoryResult | undefined) =>
    Object.fromEntries(
      finalists.map((f, i) => {
        const c = r?.candidates.find((x) => x.number !== null && x.number === nums[i]);
        return [f.sq, c ? { votes: c.votes, pct: c.pct } : null];
      }),
    );
  const firstBy = new Map(first.map((r) => [r.key, r]));
  const secondBy = new Map(second.map((r) => [r.key, r]));
  const keys = [...Object.keys(UF_IBGE), "ZZ"].filter((k) => firstBy.has(k) || secondBy.has(k));
  return {
    finalists,
    rows: keys.map((k) => ({ key: k, name: (secondBy.get(k) ?? firstBy.get(k))!.name, first: pick(firstBy.get(k)), second: pick(secondBy.get(k)) })),
  };
}

export const isExterior = (r: Pick<TerritoryResult, "territoryId">) => r.territoryId === EXTERIOR;
