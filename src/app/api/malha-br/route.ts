import { UF_IBGE } from "@/elections/reference";
import { normName } from "@/geo/names";

/**
 * Malha OFICIAL de todos os municípios do Brasil (IBGE · malhas v3, qualidade mínima) projetada em SVG.
 * Resposta: { viewBox, m: [[chave "UF|NOME", d], ...] }. Cache de 1 dia.
 */
export const revalidate = 86400;
export const maxDuration = 60;

type Ring = number[][];
type Geom = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
const UF_BY_CODE = Object.fromEntries(Object.entries(UF_IBGE).map(([uf, c]) => [String(c), uf]));

export async function GET() {
  const opt = { next: { revalidate }, signal: AbortSignal.timeout(40_000) } as RequestInit;
  const [malha, nomes] = await Promise.all([
    fetch("https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio", opt).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado", opt).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (!malha?.features || !Array.isArray(nomes)) return Response.json({ error: "malha do IBGE indisponível" }, { status: 503 });
  const nameOf = new Map((nomes as Record<string, unknown>[]).map((m) => [String(m["municipio-id"]), String(m["municipio-nome"])]));
  const minX = -74.1, maxX = -28.8, minY = -33.8, maxY = 5.3;
  const k = Math.cos((14 * Math.PI) / 180);
  const W = 1000;
  const s = W / ((maxX - minX) * k);
  const H = Math.round((maxY - minY) * s);
  const m: [string, string][] = [];
  for (const f of malha.features as { properties: { codarea: string }; geometry: Geom }[]) {
    const code = f.properties.codarea;
    const uf = UF_BY_CODE[code.slice(0, 2)];
    const nome = nameOf.get(code);
    if (!uf || !nome) continue;
    const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
    let d = "";
    for (const r of rings) {
      let last = "";
      const pts: string[] = [];
      for (const [x, y] of r) {
        const p = `${((x - minX) * k * s).toFixed(1)},${((maxY - y) * s).toFixed(1)}`;
        if (p !== last) pts.push(p);
        last = p;
      }
      if (pts.length > 2) d += `M${pts.join("L")}Z`;
    }
    m.push([`${uf}|${normName(nome)}`, d]);
  }
  return Response.json({ viewBox: `0 0 ${W} ${H}`, m }, { headers: { "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800", "x-source": "IBGE · malhas v3 e localidades v1" } });
}
