import * as shapefile from "shapefile";
import { intelSql } from "@/services/intelligence";
import { listZip, readZipMember } from "@/elections/tse/zip";
import { UF_IBGE } from "@/elections/reference";
import { normName } from "@/geo/names";
import { simplifyRing } from "@/geo/simplify";

/**
 * Importa os bairros OFICIAIS do IBGE (Censo 2022) de uma UF para a tabela `neighborhood` (idempotente: upsert).
 * Dado público; a vitória por bairro é calculada depois a partir das escolas do TSE.
 */
export const maxDuration = 300;
const SRC = "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/bairros/shp/BR/BR_bairros_CD2022.zip";

export async function GET(_: Request, { params }: { params: Promise<{ uf: string }> }) {
  const uf = (await params).uf.toUpperCase();
  const code = UF_IBGE[uf];
  if (!code) return Response.json({ error: "UF inválida" }, { status: 400 });
  const sql = await intelSql();
  if (!sql) return Response.json({ error: "banco indisponível" }, { status: 503 });
  const zip = Buffer.from(await (await fetch(SRC, { signal: AbortSignal.timeout(120_000) })).arrayBuffer());
  const members = listZip(zip);
  const get = (ext: string) => readZipMember(zip, members.find((m) => m.name.toLowerCase().endsWith(ext))!);
  const src = await shapefile.open(get(".shp"), get(".dbf"), { encoding: "utf-8" });
  const rows: { cd: string; mun: number; key: string; name: string; rings: number[][][] }[] = [];
  for (let r = await src.read(); !r.done; r = await src.read()) {
    const p = r.value.properties as Record<string, string>;
    if (Number(p.CD_UF) !== code || !r.value.geometry) continue;
    const g = r.value.geometry as { type: string; coordinates: number[][][] | number[][][][] };
    const rings = (g.type === "Polygon" ? (g.coordinates as number[][][]) : (g.coordinates as number[][][][]).flat()).map((x) => simplifyRing(x, 0.00025));
    rows.push({ cd: p.CD_BAIRRO, mun: Number(p.CD_MUN), key: normName(p.NM_MUN), name: p.NM_BAIRRO, rings });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const b = rows.slice(i, i + 200);
    await sql.query(
      `insert into neighborhood (cd, mun_ibge, uf, mun_key, name, rings)
       select x.cd, x.mun, $1, x.key, x.name, x.rings from jsonb_to_recordset($2::jsonb) as x(cd text, mun int, key text, name text, rings jsonb)
       on conflict (cd) do update set name = excluded.name, rings = excluded.rings, mun_key = excluded.mun_key`,
      [uf, JSON.stringify(b)],
    );
  }
  return Response.json({ uf, bairros: rows.length });
}
