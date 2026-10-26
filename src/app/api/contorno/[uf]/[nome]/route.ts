import { UF_IBGE } from "@/elections/reference";
import { normName } from "@/geo/names";

/**
 * Contorno OFICIAL de um município (IBGE · API de malhas v3) em lon/lat, para servir de base ao mapa das escolas.
 * Resposta: { rings: [[lon, lat], ...][] }. Cache de 1 dia.
 */
export const revalidate = 86400;

type Ring = number[][];
type Geom = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };

export async function GET(_: Request, { params }: { params: Promise<{ uf: string; nome: string }> }) {
  const p = await params;
  const code = UF_IBGE[p.uf.toUpperCase()];
  if (!code) return Response.json({ error: "UF inválida" }, { status: 400 });
  const opt = { next: { revalidate }, signal: AbortSignal.timeout(15_000) } as RequestInit;
  const nomes = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${code}/municipios`, opt).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const key = normName(decodeURIComponent(p.nome));
  const m = Array.isArray(nomes) ? (nomes as { id: number; nome: string }[]).find((x) => normName(x.nome) === key) : undefined;
  if (!m) return Response.json({ error: "município não encontrado no IBGE" }, { status: 404 });
  const g = await fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${m.id}?formato=application/vnd.geo%2Bjson&qualidade=intermediaria`, opt).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const geom = g?.features?.[0]?.geometry as Geom | undefined;
  if (!geom) return Response.json({ error: "malha do IBGE indisponível" }, { status: 503 });
  const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  return Response.json({ ibge: m.id, rings }, { headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800", "x-source": "IBGE · API de malhas v3" } });
}
