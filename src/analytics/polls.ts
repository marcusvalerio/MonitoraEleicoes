import type { Sql } from "@/persistence/db";
import type { FilterSpec } from "@/domain/filters";
import { effectiveUfs } from "@/domain/filters";
import { REGIONS } from "@/elections/reference";

/**
 * PESQUISAS REGISTRADAS (TSE · PesqEle). Fatos do registro — nunca percentuais (a fonte não os publica).
 * Abrangência: "BR" = nacional; UF = estadual. Filtros chegam ao SQL; paginação por cursor (release_date|protocol).
 */
type Row = Record<string, unknown>;
const d = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

export interface PollRow {
  protocol: string;
  uf: string;
  ueName: string | null;
  offices: string | null;
  officeIds: number[];
  company: string;
  companyCnpj: string | null;
  fieldStart: string | null;
  fieldEnd: string | null;
  releaseDate: string | null;
  registeredAt: string | null;
  sampleSize: number | null;
  costBrl: number | null;
  ownPoll: boolean | null;
  contractors: { kind: string; name: string | null }[];
  resultsStatus: string;
}

function where(f: FilterSpec, extra: { company?: string | null }, start = 1) {
  const c: string[] = ["p.year = $" + start];
  const p: unknown[] = [f.year];
  const add = (frag: string, v: unknown) => {
    p.push(v);
    c.push(frag.replaceAll("$?", `$${start + p.length - 1}`));
  };
  const ufs = effectiveUfs(f, REGIONS);
  if (ufs.length) add("p.uf = any($?::text[])", ufs);
  if (f.offices.length) add("p.office_ids && $?::smallint[]", f.offices);
  if (extra.company) add("(p.company_name ilike $? or p.company_trade_name ilike $?)", `%${extra.company}%`);
  if (f.period.preset === "custom" && f.period.from && f.period.to) {
    add("p.release_date >= $?::date", f.period.from.slice(0, 10));
    add("p.release_date <= $?::date", f.period.to.slice(0, 10));
  }
  return { sql: c.join(" and "), params: p };
}

export async function listPolls(sql: Sql, f: FilterSpec, o: { company?: string | null; cursor?: string | null; limit?: number } = {}) {
  const w = where(f, { company: o.company });
  const limit = Math.min(100, o.limit ?? 30);
  const [cd, cp] = (o.cursor ?? "").split("|");
  const params = [...w.params, cd || null, cp || null, limit + 1];
  const n = w.params.length;
  const rows = (await sql.query(
    `select p.*, coalesce((select json_agg(json_build_object('kind', c.kind, 'name', c.name) order by c.contractor_code) from poll_contractor c where c.protocol = p.protocol), '[]') as contractors
     from poll p where ${w.sql}
       and ($${n + 1}::date is null or (coalesce(p.release_date, '1900-01-01'), p.protocol) < ($${n + 1}::date, $${n + 2}::text))
     order by coalesce(p.release_date, '1900-01-01') desc, p.protocol desc limit $${n + 3}`,
    params,
  )) as Row[];
  const items: PollRow[] = rows.slice(0, limit).map((r) => ({
    protocol: r.protocol as string,
    uf: r.uf as string,
    ueName: (r.ue_name as string) ?? null,
    offices: (r.offices_raw as string) ?? null,
    officeIds: (r.office_ids as number[]) ?? [],
    company: ((r.company_trade_name as string) || (r.company_name as string)) ?? "",
    companyCnpj: (r.company_cnpj as string) ?? null,
    fieldStart: d(r.field_start),
    fieldEnd: d(r.field_end),
    releaseDate: d(r.release_date),
    registeredAt: r.registered_at ? new Date(r.registered_at as string).toISOString() : null,
    sampleSize: r.sample_size === null ? null : Number(r.sample_size),
    costBrl: r.cost_brl === null ? null : Number(r.cost_brl),
    ownPoll: (r.own_poll as boolean) ?? null,
    contractors: (r.contractors as { kind: string; name: string | null }[]) ?? [],
    resultsStatus: r.results_status as string,
  }));
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? `${last.releaseDate ?? "1900-01-01"}|${last.protocol}` : null };
}

/** Resumo do recorte: total, por instituto (top), por semana de divulgação e abrangência. */
export async function pollsSummary(sql: Sql, f: FilterSpec, o: { company?: string | null } = {}) {
  const w = where(f, { company: o.company });
  const [tot] = (await sql.query(`select count(*)::int as n, count(distinct coalesce(p.company_cnpj, p.company_name))::int as companies, count(*) filter (where p.uf = 'BR')::int as national, max(p.release_date) as last_release, sum(p.sample_size)::bigint as interviews from poll p where ${w.sql}`, w.params)) as Row[];
  const byCompany = (await sql.query(`select coalesce(nullif(p.company_trade_name, ''), p.company_name) as company, count(*)::int as n from poll p where ${w.sql} group by 1 order by n desc, 1 limit 12`, w.params)) as { company: string; n: number }[];
  const byWeek = (await sql.query(`select date_trunc('week', p.release_date)::date as week, count(*)::int as n from poll p where ${w.sql} and p.release_date is not null group by 1 order by 1`, w.params)) as { week: string; n: number }[];
  const [imp] = (await sql`select max(finished_at) as at from import_batch where kind = 'polls' and status = 'completed' and year = ${f.year}`) as Row[];
  return {
    total: tot.n as number,
    companies: tot.companies as number,
    national: tot.national as number,
    interviews: tot.interviews === null ? null : Number(tot.interviews),
    lastRelease: d(tot.last_release),
    importedAt: imp?.at ? new Date(imp.at as string).toISOString() : null,
    byCompany,
    byWeek: byWeek.map((r) => ({ week: d(r.week)!, n: r.n })),
  };
}

export async function pollDetail(sql: Sql, protocol: string) {
  const [p] = (await sql`select p.*, sr.source_url from poll p left join source_record sr on sr.id = p.source_record_id where p.protocol = ${protocol}`) as Row[];
  if (!p) return null;
  const contractors = (await sql`select kind, name, amount_paid, is_payer, funding_origin from poll_contractor where protocol = ${protocol} order by contractor_code`) as Row[];
  return { poll: p, contractors };
}
