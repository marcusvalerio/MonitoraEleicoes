import "server-only";
import { getRepository } from "@/repository";
import { getCurrentDebate, getDebateSnapshot } from "./debates";
import { getMapBootstrap } from "./geo";
import { topicMomentum } from "@/analytics/momentum";
import { platformSeries, volumeChange } from "@/analytics/social";
import { describeSegment } from "@/analytics/narrative";

/** Dados da central de comando (Overview), calculados no servidor. */
export async function getOverview() {
  const debate = await getCurrentDebate();
  if (!debate) return null;
  const s = await getDebateSnapshot(debate.id);
  if (!s) return null;
  const metrics = await (await getRepository()).getSocialMetrics(debate.id, { to: s.offset });
  const MODERATOR_ID = s.moderatorId;
  const name = (id: string) => s.participants.find((p) => p.id === id)?.name ?? "Moderação";

  const lastSeg = [...s.segments].reverse().find((x) => x.speakerId !== MODERATOR_ID) ?? null;
  const lastCls = lastSeg ? (s.classifications.find((c) => c.segmentId === lastSeg.id) ?? null) : null;
  const recentPlatforms = [...new Set(metrics.filter((m) => m.bucketStart >= s.offset - 300 && m.posts > 0).sort((a, b) => b.posts - a.posts).map((m) => m.platform))].slice(0, 2);
  const platformName = (id: string) => s.social.platforms.find((p) => p.id === id)?.name ?? id;
  const related = lastSeg && lastCls ? [...new Set([lastSeg.speakerId, ...(lastCls.targetId ? [lastCls.targetId] : []), ...lastCls.mentions])].filter((id) => id !== MODERATOR_ID) : [];

  const now =
    lastSeg && lastCls
      ? {
          segmentId: lastSeg.id,
          at: lastSeg.startOffset,
          topic: lastCls.topic,
          subtopic: lastCls.subtopic,
          headline: describeSegment(lastSeg, lastCls, name),
          quote: lastSeg.text,
          volumeChange: volumeChange(metrics, s.offset, 300),
          sources: [...recentPlatforms.map(platformName), "Transcrição"],
          related: related.map((id) => ({ id, name: name(id), color: s.participants.find((p) => p.id === id)?.swatch ?? "#68686e" })),
        }
      : null;

  const pSeries = platformSeries(metrics, 300, s.offset);
  const editorial = await (await getRepository()).getEditorial(debate.id);
  const map = await getMapBootstrap(debate.id, { snapshot: s });

  return {
    s,
    now,
    momentum: topicMomentum(metrics, s.segments, s.classifications, s.offset).filter((m) => m.recent > 0).slice(0, 6),
    allTopics: topicMomentum(metrics, s.segments, s.classifications, s.offset),
    platforms: s.social.byPlatform.map((p) => ({ ...p, name: platformName(p.platform), series: pSeries[p.platform] ?? [] })),
    map,
    editorial,
    editorialNames: Object.fromEntries(s.participants.map((p) => [p.id, p.name])),
  };
}
