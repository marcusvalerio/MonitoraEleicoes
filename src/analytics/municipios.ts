import type { Sql } from "@/persistence/db";
import { BR } from "@/elections/reference";

/**
 * Líder e vice-líder OFICIAIS por município (Presidente). Ausência ≠ zero: município sem dado não aparece.
 * - 2º turno: último retrato da apuração por município (arquivos de divulgação do TSE), coletado aos poucos.
 * - 1º turno: votação por seção somada (Dados Abertos do TSE), só números da lista oficial de candidaturas.
 */
export interface MunLeader {
  uf: string;
  name: string;
  leader: number;
  leaderPct: number;
  second: number | null;
  secondPct: number | null;
  valid: number;
  tse: number;
}
type Row = Record<string, unknown>;

export async function municipalLeaders(sql: Sql, q: { year: number; round: number }): Promise<{ source: "apuracao" | "secao"; rows: MunLeader[]; missingUf: string | null }> {
  if (q.round === 2) {
    const rows = (await sql`with latest as (
        select distinct on (s.territory_id) s.id, s.territory_id, s.valid_votes, s.valid_votes_status
        from count_snapshot s join territory t on t.id = s.territory_id and t.level = 'municipio'
        where s.year = ${q.year} and s.round = ${q.round} and s.office_id = 1
        order by s.territory_id, s.source_generated_at desc, s.id desc),
      ranked as (
        select l.territory_id, l.valid_votes, cc.ballot_number, cc.votes, row_number() over (partition by l.territory_id order by cc.votes desc) as rk
        from latest l join count_candidate cc on cc.snapshot_id = l.id
        where l.valid_votes_status = 'value' and cc.votes_status = 'value' and cc.ballot_number is not null
          and (cc.vote_destination is null or cc.vote_destination = 'Válido'))
      select t.uf, t.name, t.tse_code, r1.valid_votes as valid, r1.ballot_number as leader, r1.votes as lv, r2.ballot_number as second, r2.votes as sv
      from ranked r1 join territory t on t.id = r1.territory_id
      left join ranked r2 on r2.territory_id = r1.territory_id and r2.rk = 2
      where r1.rk = 1 and r1.votes > 0 and r1.valid_votes > 0`) as Row[];
    const cov = (await sql`select t.uf, count(*)::int as total, count(s.territory_id)::int as got
      from territory t left join (select distinct territory_id from count_snapshot where year = ${q.year} and round = ${q.round} and office_id = 1) s on s.territory_id = t.id
      where t.level = 'municipio' and t.uf <> 'ZZ' group by t.uf order by (count(*) - count(s.territory_id)) desc`) as Row[];
    const miss = cov.find((c) => Number(c.got) < Number(c.total));
    return { source: "apuracao", rows: rows.map((r) => toLeader(r, Number(r.valid))), missingUf: miss ? String(miss.uf) : null };
  }
  const rows = (await sql`with nums as (
      select distinct cc.ballot_number::text as n from count_snapshot s join count_candidate cc on cc.snapshot_id = s.id
      where s.year = ${q.year} and s.round = ${q.round} and s.office_id = 1 and s.territory_id = ${BR} and cc.ballot_number is not null),
    tot as (
      select r.municipality_tse as m, e.key as n, sum(e.value::bigint) as v
      from place_result r, jsonb_each_text(r.votes) e
      where r.year = ${q.year} and r.round = ${q.round} and r.office_id = 1 and e.key in (select n from nums)
      group by 1, 2),
    ranked as (select m, n, v, sum(v) over (partition by m) as valid, row_number() over (partition by m order by v desc) as rk from tot)
    select t.uf, t.name, t.tse_code, r1.valid, r1.n as leader, r1.v as lv, r2.n as second, r2.v as sv
    from ranked r1 join territory t on t.level = 'municipio' and t.tse_code = r1.m
    left join ranked r2 on r2.m = r1.m and r2.rk = 2
    where r1.rk = 1 and r1.valid > 0`) as Row[];
  return { source: "secao", rows: rows.map((r) => toLeader(r, Number(r.valid))), missingUf: null };
}

function toLeader(r: Row, valid: number): MunLeader {
  const pct = (v: unknown) => Math.round((Number(v) / valid) * 10000) / 100;
  return { uf: String(r.uf), name: String(r.name), leader: Number(r.leader), leaderPct: pct(r.lv), second: r.second === null ? null : Number(r.second), secondPct: r.sv === null ? null : pct(r.sv), valid, tse: Number(r.tse_code) };
}
