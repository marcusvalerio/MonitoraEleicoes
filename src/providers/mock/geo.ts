import brazil from "@svg-maps/brazil";
import type { GeoBoundarySet, GeoLevelId, GeoMetric } from "@/geo/types";
import { GEO_REGIONS } from "@/geo/reference";
import { getDemoGeoMetrics, GEOLOCATED_SHARE } from "@/data/demo/geo";
import type { GeoProvider } from "../types";

const ATTRIBUTION = "Contornos: @svg-maps/brazil (CC BY 4.0), simplificados.";

/**
 * GeoProvider com contornos SVG estáticos de UFs (~64 KB) e métricas DEMO.
 * Substituível por TopoJSON/MapLibre sem alterar domínio ou UI.
 */
export class StaticGeoProvider implements GeoProvider {
  readonly id = "static-svg-geo";
  readonly mode = "demo" as const;
  readonly geolocatedShare = GEOLOCATED_SHARE;

  async boundaries(level: GeoLevelId): Promise<GeoBoundarySet | null> {
    if (level !== "uf" && level !== "regiao") return null; // sem geometria municipal no MVP
    const ufToRegion = new Map(GEO_REGIONS.filter((r) => r.level === "uf").map((r) => [r.shortName.toLowerCase(), r.parentKey!]));
    return {
      level,
      viewBox: brazil.viewBox,
      attribution: ATTRIBUTION,
      boundaries: brazil.locations.map((l: { id: string; path: string }) => ({
        key: level === "uf" ? `UF:${l.id.toUpperCase()}` : ufToRegion.get(l.id)!,
        path: l.path,
      })),
    };
  }

  async metrics(debateId: string, range?: { to?: number }): Promise<GeoMetric[]> {
    if (debateId !== "debate-presidencial-2026-1t") return [];
    const to = range?.to ?? Infinity;
    return getDemoGeoMetrics().filter((m) => m.bucketStart + m.bucketSize <= to);
  }
}
