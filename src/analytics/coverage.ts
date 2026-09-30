import type { SocialMetric } from "@/domain/types";
import type { ConfidenceLevel } from "@/domain/quality";
import type { GeoMetric } from "@/geo/types";
import type { LocationPrecision } from "@/domain/types";

/** Cobertura geográfica: quanto do total analisado tem localização utilizável. */
export interface GeoCoverage {
  totalRecords: number;
  geolocatedRecords: number;
  /** null quando não há registros (não é 0%). */
  coveragePercentage: number | null;
  period: { from: number; to: number };
  providers: string[];
  platforms: string[];
  byPrecision: Partial<Record<LocationPrecision, number>>;
  byConfidence: Partial<Record<ConfidenceLevel, number>>;
}

const inWin = (start: number, size: number, from: number, to: number) => start >= from && start + size <= to;

export function geoCoverage(social: SocialMetric[], geo: GeoMetric[], o: { from: number; to: number; providers: string[] }): GeoCoverage {
  const s = social.filter((m) => inWin(m.bucketStart, m.bucketSize, o.from, o.to));
  const g = geo.filter((m) => inWin(m.bucketStart, m.bucketSize, o.from, o.to));
  const total = s.reduce((a, m) => a + m.posts, 0);
  const geoTotal = g.reduce((a, m) => a + m.posts, 0);
  const byPrecision: GeoCoverage["byPrecision"] = {};
  const byConfidence: GeoCoverage["byConfidence"] = {};
  for (const m of g) {
    byPrecision[m.location.precision] = (byPrecision[m.location.precision] ?? 0) + m.posts;
    byConfidence[m.location.confidence] = (byConfidence[m.location.confidence] ?? 0) + m.posts;
  }
  return {
    totalRecords: total,
    geolocatedRecords: geoTotal,
    coveragePercentage: total ? geoTotal / total : null,
    period: { from: o.from, to: o.to },
    providers: o.providers,
    platforms: [...new Set(s.map((m) => m.platform))],
    byPrecision,
    byConfidence,
  };
}
