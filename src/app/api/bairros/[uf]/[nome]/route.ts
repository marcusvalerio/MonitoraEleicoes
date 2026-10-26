import { intelSql } from "@/services/intelligence";
import { normName } from "@/geo/names";

/** Bairros oficiais (IBGE · Censo 2022) de um município: { bairros: [{ cd, name, rings }] }. Vazio se o IBGE não delimita bairros ali. */
export async function GET(_: Request, { params }: { params: Promise<{ uf: string; nome: string }> }) {
  const p = await params;
  const sql = await intelSql();
  if (!sql) return Response.json({ bairros: [] }, { status: 503 });
  const rows = (await sql`select cd, name, rings from neighborhood where uf = ${p.uf.toUpperCase()} and mun_key = ${normName(decodeURIComponent(p.nome))}`) as { cd: string; name: string; rings: number[][][] }[];
  return Response.json({ bairros: rows }, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
