import type { Candidate, Party, SocialMetric, SocialPlatformId, TopicId } from "@/domain/types";

/** Granularidades suportadas: 1, 5, 15, 30 min ou o debate inteiro. */
export type Granularity = 60 | 300 | 900 | 1800 | "debate";
export const GRANULARITIES: Granularity[] = [60, 300, 900, 1800, "debate"];

export function parseGranularity(v: string | null | undefined): Granularity {
  if (v === "debate") return "debate";
  const n = Number(v);
  return ([60, 300, 900, 1800] as number[]).includes(n) ? (n as Granularity) : 60;
}

export interface Bucket<T> {
  start: number;
  size: number;
  value: T;
}

/** Reagrupa métricas (qualquer granularidade de origem ≤ destino) em janelas maiores. */
export function rebucket<T>(metrics: SocialMetric[], g: Granularity, init: () => T, add: (acc: T, m: SocialMetric) => void, end?: number): Bucket<T>[] {
  const last = end ?? Math.max(0, ...metrics.map((m) => m.bucketStart + m.bucketSize));
  const size = g === "debate" ? Math.max(1, last) : g;
  const n = Math.max(1, Math.ceil(last / size));
  const out: Bucket<T>[] = Array.from({ length: n }, (_, i) => ({ start: i * size, size, value: init() }));
  for (const m of metrics) {
    const i = Math.floor(m.bucketStart / size);
    if (i >= 0 && i < n) add(out[i].value, m);
  }
  return out;
}

/** ConversationVolume — publicações por janela. */
export const conversationVolume = (metrics: SocialMetric[], g: Granularity, end?: number) =>
  rebucket(metrics, g, () => ({ posts: 0 }), (a, m) => void (a.posts += m.posts), end).map((b) => ({ start: b.start, size: b.size, posts: b.value.posts }));

/** TopicTrend — publicações por tema por janela. */
export const topicTrend = (metrics: SocialMetric[], g: Granularity, end?: number) =>
  rebucket(metrics, g, () => ({}) as Partial<Record<TopicId, number>>, (a, m) => {
    for (const [t, v] of Object.entries(m.byTopic) as [TopicId, number][]) a[t] = (a[t] ?? 0) + v;
  }, end);

/** PlatformDistribution — participação de cada plataforma no período. */
export function platformDistribution(metrics: SocialMetric[]) {
  const acc = new Map<SocialPlatformId, number>();
  for (const m of metrics) acc.set(m.platform, (acc.get(m.platform) ?? 0) + m.posts);
  const total = [...acc.values()].reduce((a, b) => a + b, 0);
  return [...acc.entries()].map(([platform, posts]) => ({ platform, posts, share: total ? posts / total : null })).sort((a, b) => b.posts - a.posts);
}

/** CandidateMentions — menções nominais por candidato (contagem; não é ranking). */
export function candidateMentions(metrics: SocialMetric[], candidates: Candidate[]) {
  const acc: Record<string, number> = {};
  for (const m of metrics) for (const [k, v] of Object.entries(m.mentionsByCandidate)) acc[k] = (acc[k] ?? 0) + v;
  return candidates.map((c) => ({ candidateId: c.id, mentions: acc[c.id] ?? 0 }));
}

/**
 * PartyMentions — menções atribuídas a partidos VIA candidato citado.
 * Método explícito; não inclui menções diretas à sigla (não coletadas por estes providers).
 */
export function partyMentions(metrics: SocialMetric[], candidates: Candidate[], parties: Party[]) {
  const byCand = candidateMentions(metrics, candidates);
  const partyOf = new Map(candidates.map((c) => [c.id, c.partyId]));
  const acc: Record<string, number> = {};
  for (const c of byCand) {
    const p = partyOf.get(c.candidateId);
    if (p) acc[p] = (acc[p] ?? 0) + c.mentions;
  }
  return parties.map((p) => ({ partyId: p.id, mentions: acc[p.id] ?? 0, method: "via_candidate" as const }));
}
