import type { SocialMetric, SpeechClassification, TopicId, TranscriptSegment } from "@/domain/types";
import { isTimed } from "@/domain/types";

export interface TopicMomentum {
  topic: TopicId;
  /** Publicações sobre o tema na janela recente. */
  recent: number;
  /** Variação vs. janela anterior; null quando não há base suficiente. */
  change: number | null;
  direction: "up" | "down" | "flat" | "none";
  series: number[];
  lastSpokenAt: number | null;
  segments: number;
}

/**
 * "Assuntos em movimento": volume de publicações por tema e tendência recente.
 * Descreve a conversa; não indica importância ou mérito do tema.
 */
export function topicMomentum(
  metrics: SocialMetric[],
  segments: TranscriptSegment[],
  cls: SpeechClassification[],
  at: number,
  opts: { window?: number; bucket?: number; flatBand?: number } = {},
): TopicMomentum[] {
  const w = opts.window ?? 900;
  const bucket = opts.bucket ?? 300;
  const flat = opts.flatBand ?? 0.05;
  const n = Math.max(1, Math.ceil(at / bucket));
  const acc = new Map<TopicId, { recent: number; prev: number; series: number[] }>();
  for (const m of metrics) {
    const e = m.bucketStart + m.bucketSize;
    if (e > at) continue;
    for (const [t, v] of Object.entries(m.byTopic) as [TopicId, number][]) {
      if (t === "outros" || !v) continue;
      const a = acc.get(t) ?? { recent: 0, prev: 0, series: new Array(n).fill(0) };
      if (m.bucketStart >= at - w) a.recent += v;
      else if (m.bucketStart >= at - 2 * w) a.prev += v;
      const i = Math.floor(m.bucketStart / bucket);
      if (i < n) a.series[i] += v;
      acc.set(t, a);
    }
  }
  const byId = new Map(cls.map((c) => [c.segmentId, c]));
  const spoken = new Map<TopicId, { last: number; n: number }>();
  for (const s of segments.filter(isTimed)) {
    const c = byId.get(s.id);
    if (!c || c.topic === "outros" || s.endOffset > at) continue;
    const x = spoken.get(c.topic) ?? { last: 0, n: 0 };
    x.last = Math.max(x.last, s.startOffset);
    x.n++;
    spoken.set(c.topic, x);
  }
  return [...acc.entries()]
    .map(([topic, a]) => {
      const change = a.prev >= 30 ? (a.recent - a.prev) / a.prev : null;
      const direction: TopicMomentum["direction"] = change === null ? (a.recent ? "up" : "none") : Math.abs(change) < flat ? "flat" : change > 0 ? "up" : "down";
      return { topic, recent: a.recent, change, direction, series: a.series, lastSpokenAt: spoken.get(topic)?.last ?? null, segments: spoken.get(topic)?.n ?? 0 };
    })
    .sort((x, y) => y.recent - x.recent || (y.lastSpokenAt ?? 0) - (x.lastSpokenAt ?? 0));
}
