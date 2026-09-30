import brazil from "@svg-maps/brazil";
import type { GeoBoundarySet, GeoLevelId } from "@/geo/types";
import { GEO_REGIONS } from "@/geo/reference";
import type { GeoProvider } from "../contracts";
import { DEFAULT_RETRY } from "../resilience";

/**
 * SvgGeoProvider — contornos de UFs em SVG simplificado (~64 KB).
 * Futuras implementações (TopoJsonGeoProvider, MapLibre vector tiles) seguem o mesmo contrato.
 */
export class SvgGeoProvider implements GeoProvider {
  readonly info = {
    id: "svg-geo",
    name: "Contornos SVG das UFs",
    kind: "geo" as const,
    mode: "live" as const,
    capabilities: { levels: ["regiao", "uf"] as GeoLevelId[], format: "svg-path" as const },
    config: { requiredEnv: [], configured: true },
    rateLimit: { requestsPerWindow: null, windowSeconds: null },
    retry: DEFAULT_RETRY,
    sourceId: "src-geo-boundaries",
  };
  async health() {
    return { status: "connected" as const, checkedAt: new Date().toISOString() };
  }
  async boundaries(level: GeoLevelId): Promise<GeoBoundarySet | null> {
    if (!this.info.capabilities.levels.includes(level)) return null; // sem geometria municipal
    const ufToRegion = new Map(GEO_REGIONS.filter((r) => r.level === "uf").map((r) => [r.shortName.toLowerCase(), r.parentKey!]));
    return {
      level,
      viewBox: brazil.viewBox,
      attribution: "Contornos: @svg-maps/brazil (CC BY 4.0), simplificados.",
      boundaries: brazil.locations.map((l) => ({ key: level === "uf" ? `UF:${l.id.toUpperCase()}` : ufToRegion.get(l.id)!, path: l.path })),
    };
  }
}
