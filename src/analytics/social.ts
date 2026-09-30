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
