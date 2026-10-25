import type { Sql } from "@/persistence/db";

/**
 * Explorador territorial — Brasil › UF › município › zona › local de votação (escola). Somente DADO OFICIAL do TSE
 * (votação por seção somada por local; zona e município são somas dos locais). Votos de números fora da lista
 * oficial de candidaturas válidas (ex.: candidatura com votos anulados) e 95/96 não entram nos válidos.
 */
export type VoteMap = Record<string, number>;
export interface AreaResult {
  key: string;
  name: string;
  uf: string | null;
  places: number;
  sections: number;
  votes: VoteMap;
}
export interface PlaceResult extends AreaResult {
  municipality: number;
  zone: number;
  place: number;
  address: string | null;
  neighborhood: string | null;
  lat: number | null;
  lon: number | null;
  electorate: number | null;
}

type Row = Record<string, unknown>;
const toVotes = (j: unknown): VoteMap => Object.fromEntries(Object.entries((j ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)]));

/** Soma de votos por grupo, agregada no banco em etapas (local ⇒ grupo), sem varredura correlacionada. */
async function grouped(sql: Sql, q: { year: number; round: number; uf?: string; municipality?: number; zone?: number }, groupBy: "uf" | "municipality" | "zone") {
  const key = groupBy === "uf" ? "p.uf" : groupBy === "municipality" ? "r.municipality_tse::text" : "r.zone::text";
  const rows = (await sql.query(
    `with sel as (
       select ${key} as k, p.uf, r.sections, r.votes
       from place_result r join polling_place p using (year, municipality_tse, zone, place)
       where r.year = $1 and r.round = $2 and r.office_id = 1
         and ($3::text is null or p.uf = $3) and ($4::int is null or r.municipality_tse = $4) and ($5::int is null or r.zone = $5)),
     meta as (select k, max(uf) as uf, count(*)::int as places, sum(sections)::int as sections from sel group by k),
     tot as (select k, e.key as vk, sum(e.value::bigint) as t from sel, jsonb_each_text(sel.votes) e group by k, e.key),
     vj as (select k, jsonb_object_agg(vk, t) as votes from tot group by k)
     select meta.*, vj.votes from meta join vj using (k) order by k`,
    [q.year, q.round, q.uf ?? null, q.municipality ?? null, q.zone ?? null],
  )) as Row[];
  const names = groupBy === "municipality" && rows.length
    ? new Map(((await sql.query("select tse_code::text as k, name from territory where level = 'municipio' and tse_code = any($1::int[])", [rows.map((r) => Number(r.k))])) as Row[]).map((r) => [String(r.k), String(r.name)]))
    : null;
  return rows.map((r) => {
    const k = String(r.k);
    return { key: k, name: groupBy === "zone" ? `Zona ${k}` : (names?.get(k) ?? k), uf: (r.uf as string) ?? null, places: Number(r.places), sections: Number(r.sections), votes: toVotes(r.votes) };
  });
}

export const resultsByUfPlaces = (sql: Sql, q: { year: number; round: number }) => grouped(sql, q, "uf");
export const municipalitiesOf = (sql: Sql, q: { year: number; round: number; uf: string }) => grouped(sql, q, "municipality");
export const zonesOf = (sql: Sql, q: { year: number; round: number; municipality: number }) => grouped(sql, q, "zone");

export async function placesOf(sql: Sql, q: { year: number; round: number; municipality: number; zone?: number | null; place?: number | null }): Promise<PlaceResult[]> {
  const rows = (await sql.query(
    `select r.municipality_tse, r.zone, r.place, r.sections, r.votes, p.name, p.uf, p.address, p.neighborhood, p.lat, p.lon, p.electorate
     from place_result r join polling_place p using (year, municipality_tse, zone, place)
     where r.year = $1 and r.round = $2 and r.office_id = 1 and r.municipality_tse = $3 and ($4::int is null or r.zone = $4) and ($5::int is null or r.place = $5)
     order by r.zone, p.name`,
    [q.year, q.round, q.municipality, q.zone ?? null, q.place ?? null],
  )) as Row[];
  return rows.map((r) => ({
    key: `${r.zone}-${r.place}`,
    name: String(r.name),
    uf: (r.uf as string) ?? null,
    places: 1,
    sections: Number(r.sections),
    votes: toVotes(r.votes),
    municipality: Number(r.municipality_tse),
    zone: Number(r.zone),
    place: Number(r.place),
    address: (r.address as string) ?? null,
    neighborhood: (r.neighborhood as string) ?? null,
    lat: r.lat === null ? null : Number(r.lat),
    lon: r.lon === null ? null : Number(r.lon),
    electorate: r.electorate === null ? null : Number(r.electorate),
  }));
}

export async function municipalityName(sql: Sql, tse: number) {
  const [r] = (await sql`select name, uf from territory where id = ${100000 + tse}`) as { name: string; uf: string }[];
  return r ?? null;
}

/** Turnos com votação por local publicada (dados abertos saem depois da totalização). */
export async function placeRounds(sql: Sql, year: number) {
  const rows = (await sql`select distinct round from place_result where year = ${year} and office_id = 1 order by 1`) as { round: number }[];
  return rows.map((r) => Number(r.round));
}

/** Válidos = soma dos números da lista oficial (95 branco, 96 nulo e números anulados ficam fora). */
export function validOf(votes: VoteMap, numbers: Set<string>) {
  let v = 0;
  for (const [k, n] of Object.entries(votes)) if (numbers.has(k)) v += n;
  return v;
}
