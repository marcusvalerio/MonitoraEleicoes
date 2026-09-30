import type { TopicId } from "@/domain/types";
import type { GeoMetric } from "@/geo/types";
import { GEO_REGIONS, LEAF_REGIONS, getRegion } from "@/geo/reference";
import { createRng } from "./rng";
import { getDemoDataset } from "./generate";
import { DEMO_CANDIDATES } from "./entities";

/**
 * DEMO — repercussão geolocalizada fictícia.
 * Apenas uma fração das publicações tem localização inferível (GEOLOCATED_SHARE).
 * Afinidades regionais são aleatórias (semente fixa) e não refletem a realidade.
 */
export const GEOLOCATED_SHARE = 0.38;
export const GEO_BUCKET = 300;

let cache: GeoMetric[] | null = null;

export function getDemoGeoMetrics(): GeoMetric[] {
  if (cache) return cache;
  const rng = createRng(7070);
  const ds = getDemoDataset();
  const regionKeys = GEO_REGIONS.filter((r) => r.level === "regiao").map((r) => r.key);
  const ufOf = (leafKey: string) => getRegion(leafKey)!.parentKey!;
  const regionOf = (leafKey: string) => getRegion(ufOf(leafKey))!.parentKey!;

  // afinidades fictícias
  const candAff: Record<string, Record<string, number>> = Object.fromEntries(DEMO_CANDIDATES.map((c) => [c.id, Object.fromEntries(regionKeys.map((r) => [r, 0.6 + rng.next() * 1.1]))]));
  const topicPool: TopicId[] = ["economia", "seguranca", "saude", "educacao", "emprego", "corrupcao", "impostos", "meio_ambiente", "infraestrutura", "previdencia", "tecnologia", "assistencia_social"];
  const topicAff: Record<string, Record<string, number>> = Object.fromEntries(regionKeys.map((r) => [r, Object.fromEntries(topicPool.map((t) => [t, 0.5 + rng.next()]))]));
  const leafNoise = Object.fromEntries(LEAF_REGIONS.map((l) => [l.key, 0.8 + rng.next() * 0.4]));

  // volume nacional e tema do debate por janela
  const end = ds.segments.at(-1)!.endOffset;
  const nB = Math.ceil(end / GEO_BUCKET) + 1;
  const national = new Array(nB).fill(0);
  const mentionsNat: Record<string, number>[] = Array.from({ length: nB }, () => ({}));
  for (const m of ds.metrics) {
    const b = Math.floor(m.bucketStart / GEO_BUCKET);
    if (b >= nB) continue;
    national[b] += m.posts;
    for (const [k, v] of Object.entries(m.mentionsByCandidate)) mentionsNat[b][k] = (mentionsNat[b][k] ?? 0) + v;
  }
  const clsById = new Map(ds.classifications.map((c) => [c.segmentId, c]));
  const topicAt = (t: number): TopicId => {
    const seg = [...ds.segments].reverse().find((s) => s.startOffset <= t + GEO_BUCKET && clsById.get(s.id)?.topic !== "outros");
    return seg ? clsById.get(seg.id)!.topic : "outros";
  };

  // foco regional de cada janela: alterna aleatoriamente, reforçando alguma região
  const focus: string[] = Array.from({ length: nB }, () => rng.pick(regionKeys));

  const out: GeoMetric[] = [];
  for (let b = 0; b < nB; b++) {
    if (!national[b]) continue;
    const geoTotal = national[b] * GEOLOCATED_SHARE;
    const debateTopic = topicAt(b * GEO_BUCKET);
    const weights = LEAF_REGIONS.map((l) => l.weight * leafNoise[l.key] * (regionOf(l.key) === focus[b] ? 1.35 : 1) * (0.9 + rng.next() * 0.2));
    const wSum = weights.reduce((a, x) => a + x, 0);
    LEAF_REGIONS.forEach((leaf, i) => {
      const posts = Math.round((geoTotal * weights[i]) / wSum);
      if (!posts) return;
      const reg = regionOf(leaf.key);
      const cw = DEMO_CANDIDATES.map((c) => (mentionsNat[b][c.id] ?? 1) * candAff[c.id][reg] * (0.9 + rng.next() * 0.2));
      const cwSum = cw.reduce((a, x) => a + x, 0);
      const mentionsByCandidate = Object.fromEntries(DEMO_CANDIDATES.map((c, j) => [c.id, Math.round((posts * 0.55 * cw[j]) / cwSum)]));
      const byTopic: Partial<Record<TopicId, number>> = {};
      const main = debateTopic === "outros" ? rng.pick(topicPool) : debateTopic;
      const mainShare = 0.4 + 0.2 * (topicAff[reg][main] ?? 1) / 1.5;
      byTopic[main] = Math.round(posts * mainShare);
      const others = [...topicPool].filter((t) => t !== main).sort((x, y) => topicAff[reg][y] - topicAff[reg][x]).slice(0, 2);
      byTopic[others[0]] = Math.round(posts * 0.18);
      byTopic[others[1]] = Math.round(posts * 0.1);
      byTopic.outros = Math.max(0, posts - (byTopic[main]! + byTopic[others[0]]! + byTopic[others[1]]!));
      out.push({ regionKey: leaf.key, bucketStart: b * GEO_BUCKET, bucketSize: GEO_BUCKET, posts, mentionsByCandidate, byTopic, location: { precision: "municipality", source: "profile", confidence: "medium" }, provenance: { nature: "collected", sourceId: "src-demo-geo", mode: "demo" } });
    });
  }
  cache = out;
  return out;
}
