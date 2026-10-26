import { intelSql } from "@/services/intelligence";
import { countTick } from "@/elections/apuracao/worker";
import { takeLease } from "@/elections/apuracao/onDemand";
import { TseCountProvider } from "@/elections/apuracao/provider";
import { UF_IBGE } from "@/elections/reference";

/**
 * Completa a apuração OFICIAL por município (Presidente) das UFs ainda incompletas, dentro de ~4 min por chamada.
 * Idempotente (mesma gravação do worker) e protegida por concessão no banco: chamadas paralelas não duplicam trabalho.
 */
export const maxDuration = 300;

export async function GET(_: Request, { params }: { params: Promise<{ year: string; round: string }> }) {
  const p = await params;
  const year = Number(p.year), round = Number(p.round);
  if (!Number.isInteger(year) || (round !== 1 && round !== 2)) return Response.json({ error: "parâmetros inválidos" }, { status: 400 });
  const sql = await intelSql();
  if (!sql) return Response.json({ error: "banco indisponível" }, { status: 503 });
  if (!(await takeLease(sql, year, round * 1000 + 999, 240))) return Response.json({ skipped: "coleta em andamento" });
  const coverage = async () =>
    (await sql`select t.uf, count(*)::int as total, count(s.territory_id)::int as got
      from territory t left join (select distinct territory_id from count_snapshot where year = ${year} and round = ${round} and office_id = 1) s on s.territory_id = t.id
      where t.level = 'municipio' and t.uf <> 'ZZ' group by t.uf`) as { uf: string; total: number; got: number }[];
  const t0 = Date.now();
  const done: string[] = [];
  const provider = new TseCountProvider();
  const todo = (await coverage()).filter((c) => c.got < c.total && UF_IBGE[c.uf]).sort((a, b) => a.total - a.got - (b.total - b.got));
  for (const c of todo) {
    if (Date.now() - t0 > 200_000) break;
    await countTick(sql, provider, { year, round: round as 1 | 2, offices: [1], ufs: [c.uf], municipalities: true, concurrency: 20 });
    done.push(c.uf);
  }
  const after = await coverage();
  return Response.json({ done, got: after.reduce((a, c) => a + c.got, 0), total: after.reduce((a, c) => a + c.total, 0) });
}
