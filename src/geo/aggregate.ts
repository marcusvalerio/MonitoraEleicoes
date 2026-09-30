import type { TopicId } from "@/domain/types";
import { missing, val } from "@/domain/quality";
import type { GeoAggregate, GeoLevelId, GeoMetric } from "./types";
import { childrenOf, descendantsAt, getRegion, isWithin } from "./reference";

/**
 * Agregação geográfica pura. Métricas vêm na granularidade mais fina (município);
 * todos os níveis superiores são somas — garantindo consistência no drill-down.
 */
export interface AggregateOptions {
  parentKey: string;
  childLevel: GeoLevelId;
  from: number;
  to: number;
  topic?: TopicId | null;
  /** Janela (s) para cálculo de tendência: [to - w, to) vs [to - 2w, to - w). */
  trendWindow?: number;
}

interface Acc {
  posts: number;
  topicPosts: number;
  mentions: Record<string, number>;
  topics: Partial<Record<TopicId, number>>;
  recent: number;
  previous: number;
}

const inWin = (m: GeoMetric, from: number, to: number) => m.bucketStart >= from && m.bucketStart + m.bucketSize <= to;

export function aggregateGeo(metrics: GeoMetric[], o: AggregateOptions): GeoAggregate[] {
  const children = o.childLevel === "municipio" || o.childLevel === "uf" || o.childLevel === "regiao" ? descendantsAt(o.parentKey, o.childLevel) : [];
  const w = o.trendWindow ?? 900;
  const accs = new Map<string, Acc>(children.map((c) => [c.key, { posts: 0, topicPosts: 0, mentions: {}, topics: {}, recent: 0, previous: 0 }]));
  // Mapeia cada folha ao filho correspondente uma única vez.
  const leafToChild = new Map<string, string>();
  const childFor = (leaf: string) => {
    if (leafToChild.has(leaf)) return leafToChild.get(leaf)!;
    const c = children.find((ch) => isWithin(leaf, ch.key))?.key ?? "";
    leafToChild.set(leaf, c);
    return c;
  };

  for (const m of metrics) {
    const ck = childFor(m.regionKey);
    if (!ck) continue;
    const a = accs.get(ck)!;
    const tp = o.topic ? (m.byTopic[o.topic] ?? 0) : m.posts;
    if (m.bucketStart >= o.to - w && m.bucketStart + m.bucketSize <= o.to) a.recent += tp;
    else if (m.bucketStart >= o.to - 2 * w && m.bucketStart + m.bucketSize <= o.to - w) a.previous += tp;
    if (!inWin(m, o.from, o.to)) continue;
    a.posts += m.posts;
    a.topicPosts += tp;
    for (const [k, v] of Object.entries(m.mentionsByCandidate)) a.mentions[k] = (a.mentions[k] ?? 0) + v;
    for (const [k, v] of Object.entries(m.byTopic) as [TopicId, number][]) a.topics[k] = (a.topics[k] ?? 0) + v;
  }

  const total = [...accs.values()].reduce((s, a) => s + a.topicPosts, 0);
  return children.map((c) => {
    const a = accs.get(c.key)!;
    const mTotal = Object.values(a.mentions).reduce((s, v) => s + v, 0);
    const [pc, pv] = Object.entries(a.mentions).sort((x, y) => y[1] - x[1])[0] ?? [null, 0];
    const tEntries = (Object.entries(a.topics) as [TopicId, number][]).filter(([t]) => t !== "outros").sort((x, y) => y[1] - x[1]);
    const tTotal = Object.values(a.topics).reduce((s, v) => s + (v ?? 0), 0);
    return {
      key: c.key,
      name: c.name,
      shortName: c.shortName,
      level: c.level,
      posts: a.posts,
      topicPosts: a.topicPosts,
      shareOfParent: total ? a.topicPosts / total : 0,
      mentionsByCandidate: a.mentions,
      predominantCandidateId: mTotal ? pc : null,
      predominantShare: mTotal ? pv / mTotal : 0,
      topTopic: tEntries[0]?.[0] ?? null,
      topTopicShare: tTotal && tEntries[0] ? tEntries[0][1] / tTotal : 0,
      trend: a.previous >= 20 ? val((a.recent - a.previous) / a.previous) : missing("unknown", "base insuficiente (< 20 publicações na janela anterior)"),
      hasChildren: childrenOf(c.key).length > 0,
    };
  });
}

/** Série temporal total (para o controle de tempo do mapa). */
export function geoSeries(metrics: GeoMetric[], within: string, topic?: TopicId | null) {
  const m = new Map<number, number>();
  for (const x of metrics) {
    if (!isWithin(x.regionKey, within)) continue;
    m.set(x.bucketStart, (m.get(x.bucketStart) ?? 0) + (topic ? (x.byTopic[topic] ?? 0) : x.posts));
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

/** Próximo nível de drill-down suportado para dados sociais. */
export function nextLevel(level: GeoLevelId): GeoLevelId | null {
  if (level === "pais") return "uf";
  if (level === "regiao") return "uf";
  if (level === "uf") return "municipio";
  return null;
}

export function levelOf(key: string): GeoLevelId | null {
  return getRegion(key)?.level ?? null;
}
