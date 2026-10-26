import { UF_IBGE } from "@/elections/reference";
import { normName } from "@/geo/names";

/**
 * Malha municipal OFICIAL do IBGE (API de malhas v3, qualidade mínima) já projetada em SVG para o mapa da UF.
 * Resposta: { viewBox, municipios: [{ ibge, nome, key, d }] } — `key` = nome normalizado (casa com o nome do TSE).
 * Cache de 1 dia (a malha não muda durante a apuração).
 */
export const revalidate = 86400;

type Ring = number[][];
type Geom = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
interface Feature {
  properties: { codarea: string };
  geometry: Geom;
}

export async function GET(_: Request, { params }: { params: Promise<{ uf: string }> }) {
  const uf = (await params).uf.toUpperCase();
  const code = UF_IBGE[uf];
  if (!code) return Response.json({ error: "UF inválida" }, { status: 400 });
  const opt = { next: { revalidate }, signal: AbortSignal.timeout(15_000) } as RequestInit;
  const [malha, nomes] = await Promise.all([
    fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${code}?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio`, opt).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${code}/municipios`, opt).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (!malha?.features || !Array.isArray(nomes)) return Response.json({ error: "malha do IBGE indisponível" }, { status: 503 });
  const nameOf = new Map((nomes as { id: number; nome: string }[]).map((m) => [String(m.id), m.nome]));
  const feats = malha.features as Feature[];
  // Projeção equiretangular corrigida pela latitude média; y invertido para SVG.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const rings = (g: Geom): Ring[] => (g.type === "Polygon" ? g.coordinates : g.coordinates.flat());
  for (const f of feats) for (const r of rings(f.geometry)) for (const [x, y] of r) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const W = 1000;
  const s = W / ((maxX - minX) * k);
  const H = Math.round((maxY - minY) * s);
  const pt = (x: number, y: number) => `${((x - minX) * k * s).toFixed(1)},${((maxY - y) * s).toFixed(1)}`;
  const municipios = feats.map((f) => {
    const ibge = f.properties.codarea;
    const nome = nameOf.get(ibge) ?? ibge;
    const d = rings(f.geometry).map((r) => `M${r.map(([x, y]) => pt(x, y)).join("L")}Z`).join("");
    return { ibge, nome, key: normName(nome), d };
  });
  return Response.json({ viewBox: `0 0 ${W} ${H}`, municipios }, { headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800", "x-source": "IBGE · API de malhas v3 e localidades v1" } });
}
