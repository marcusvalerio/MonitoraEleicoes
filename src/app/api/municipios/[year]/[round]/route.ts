import { after } from "next/server";
import { intelSql } from "@/services/intelligence";
import { normName } from "@/geo/names";
import { municipalLeaders } from "@/analytics/municipios";
import { refreshUfMunicipalitiesIfStale } from "@/elections/apuracao/onDemand";

/**
 * Líder oficial em cada município (Presidente) para o mapa do Brasil: 2º turno = apuração por município do TSE;
 * 1º turno = votação por seção somada (Dados Abertos). Chave "UF|NOME" igual à da malha do IBGE.
 */
export const maxDuration = 60;

export async function GET(_: Request, { params }: { params: Promise<{ year: string; round: string }> }) {
  const p = await params;
  const year = Number(p.year), round = Number(p.round);
  if (!Number.isInteger(year) || (round !== 1 && round !== 2)) return Response.json({ error: "parâmetros inválidos" }, { status: 400 });
  const sql = await intelSql();
  if (!sql) return Response.json({ error: "banco indisponível" }, { status: 503 });
  const r = await municipalLeaders(sql, { year, round });
  // Completa aos poucos a coleta oficial por município do turno (uma UF por visita, com concessão no banco).
  if (r.source === "apuracao" && r.missingUf) after(() => refreshUfMunicipalitiesIfStale(sql, year, round as 1 | 2, r.missingUf!));
  const m = Object.fromEntries(r.rows.map((x) => [`${x.uf}|${normName(x.name)}`, [x.leader, x.leaderPct, x.second, x.secondPct, x.valid]]));
  return Response.json({ source: r.source, coverage: r.rows.length, m }, { headers: { "cache-control": r.source === "secao" ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=60, stale-while-revalidate=300" } });
}
