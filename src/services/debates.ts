import "server-only";
import { getRepository } from "@/repository";
import { topicStats, candidateActivity, speechComposition, topicTimeline, topicHeatmap, interactionEdges } from "@/analytics/debate";
import { volumeSeries, volumeByPlatform, mentionsByCandidate } from "@/analytics/social";
import { currentOffset as clockOffset } from "@/lib/clock";
import type { Debate, TopicId } from "@/domain/types";

/** Camada de serviço: orquestra repositório + analytics para as páginas (server components). */

export async function listDebates() {
  return (await getRepository()).listDebates();
}

export async function getDebate(id: string) {
  return (await getRepository()).getDebate(id);
}

export async function getCurrentDebate(): Promise<Debate | null> {
  const all = await listDebates();
  return all.find((d) => d.status === "live") ?? all[0] ?? null;
}

/** Instante atual do debate (s), segundo o relógio do perfil de dados. */
export async function currentOffset(d: Debate): Promise<number> {
  const repo = await getRepository();
  if (d.status === "ended") return Infinity;
  return clockOffset(repo.clock, Date.now(), d.startsAt, repo.transcriptEnd(d.id));
}

export async function getParticipants(d: Debate) {
  const repo = await getRepository();
  const cands = repo.getCandidates();
  const parties = repo.getParties();
  return d.participantIds
    .map((id) => cands.find((c) => c.id === id))
    .filter((c) => !!c)
    .map((c) => ({ ...c, party: parties.find((p) => p.id === c.partyId) ?? null }));
}

export type Participant = Awaited<ReturnType<typeof getParticipants>>[number];

/** Snapshot completo até `upTo` — usado por Overview, Live (estado inicial) e Analytics. */
export async function getDebateSnapshot(debateId: string, upTo?: number) {
  const repo = await getRepository();
  const debate = repo.getDebate(debateId);
  if (!debate) return null;
  const totalEnd = repo.transcriptEnd(debateId) || (Date.parse(debate.endsAt) - Date.parse(debate.startsAt)) / 1000;
  const at = upTo ?? (await currentOffset(debate));
  const offset = Math.min(at, totalEnd);
  const win = repo.getTranscript(debateId, { to: offset });
  const events = repo.getEvents(debateId, { to: offset });
  const participants = await getParticipants(debate);
  const metrics = repo.getSocialMetrics(debateId, { to: offset });
  const { segments, classifications } = win;
  const cids = participants.map((c) => c.id);
  const moderator = repo.moderatorId();
  const topics = topicStats(segments, classifications, { excludeModerator: moderator });
  const heatTopics = topics.map((t) => t.topic) as TopicId[];

  return {
    mode: repo.mode,
    clock: repo.clock,
    moderatorId: moderator,
    debate,
    offset,
    totalEnd,
    isLive: debate.status === "live" && offset < totalEnd,
    inProgress: win.inProgress,
    blocks: repo.getBlocks(debateId),
    participants,
    segments,
    classifications,
    events,
    topics,
    activity: candidateActivity(participants, segments, classifications),
    composition: speechComposition(cids, segments, classifications),
    timeline: topicTimeline(segments, classifications),
    heatmap: { ...topicHeatmap(segments, classifications, 600, heatTopics), topics: heatTopics },
    interactions: interactionEdges(segments, classifications, cids),
    social: {
      series: volumeSeries(metrics),
      byPlatform: volumeByPlatform(metrics),
      mentions: mentionsByCandidate(metrics),
      total: metrics.reduce((a, m) => a + m.posts, 0),
      platforms: repo.platforms(),
    },
    sources: repo.getSources().filter((s) => debate.sourceIds.includes(s.id) || s.providerKind === "social" || s.providerKind === "ai"),
  };
}

export type DebateSnapshot = NonNullable<Awaited<ReturnType<typeof getDebateSnapshot>>>;
