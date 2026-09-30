import type { SocialMetric, SocialPlatformId } from "@/domain/types";

export function volumeSeries(metrics: SocialMetric[], upTo?: number) {
  const m = new Map<number, number>();
  for (const x of metrics) {
    if (upTo !== undefined && x.bucketStart > upTo) continue;
    m.set(x.bucketStart, (m.get(x.bucketStart) ?? 0) + x.posts);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

export function volumeByPlatform(metrics: SocialMetric[], upTo?: number): { platform: SocialPlatformId; posts: number }[] {
  const m = new Map<SocialPlatformId, number>();
  for (const x of metrics) {
    if (upTo !== undefined && x.bucketStart > upTo) continue;
    m.set(x.platform, (m.get(x.platform) ?? 0) + x.posts);
  }
  return [...m.entries()].map(([platform, posts]) => ({ platform, posts })).sort((a, b) => b.posts - a.posts);
}

export function mentionsByCandidate(metrics: SocialMetric[], upTo?: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of metrics) {
    if (upTo !== undefined && x.bucketStart > upTo) continue;
    for (const [k, v] of Object.entries(x.mentionsByCandidate)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** Série por plataforma em janelas maiores (para sparklines). */
export function platformSeries(metrics: SocialMetric[], bucket: number, upTo?: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const end = upTo ?? Math.max(0, ...metrics.map((m) => m.bucketStart + m.bucketSize));
  const n = Math.max(1, Math.ceil(end / bucket));
  for (const m of metrics) {
    if (m.bucketStart + m.bucketSize > end) continue;
    const arr = (out[m.platform] ??= new Array(n).fill(0));
    const i = Math.floor(m.bucketStart / bucket);
    if (i < n) arr[i] += m.posts;
  }
  return out;
}

/** Variação percentual do volume total: últimos `w` segundos vs. os `w` anteriores. */
export function volumeChange(metrics: SocialMetric[], at: number, w = 300): number | null {
  let recent = 0;
  let prev = 0;
  for (const m of metrics) {
    const e = m.bucketStart + m.bucketSize;
    if (m.bucketStart >= at - w && e <= at) recent += m.posts;
    else if (m.bucketStart >= at - 2 * w && e <= at - w) prev += m.posts;
  }
  return prev ? (recent - prev) / prev : null;
}
