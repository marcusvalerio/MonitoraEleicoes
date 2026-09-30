import "server-only";
import { getProviders } from "@/providers/registry";
import { topicStats, candidateActivity, speechComposition, topicTimeline, topicHeatmap, interactionEdges } from "@/analytics/debate";
import { volumeSeries, volumeByPlatform, mentionsByCandidate } from "@/analytics/social";
import { demoReplayOffset } from "@/lib/demo-clock";
import { MODERATOR_ID } from "@/data/demo/entities";
import type { Debate, TopicId } from "@/domain/types";

/** Camada de serviço: orquestra providers + analytics para as páginas (server components). */

export async function listDebates() {
  return getProviders().transcript.listDebates();
}

export async function getDebate(id: string) {
  return getProviders().transcript.getDebate(id);
}

export async function getCurrentDebate(): Promise<Debate | null> {
  const all = await listDebates();
  return all.find((d) => d.status === "live") ?? all[0] ?? null;
}

export function debateDuration(d: Debate) {
  return (Date.parse(d.endsAt) - Date.parse(d.startsAt)) / 1000;
}

/** Instante atual do debate (s). Em demo, é o relógio de replay. */
export async function currentOffset(d: Debate, fullEnd?: number): Promise<number> {
  const p = getProviders();
  if (d.status === "ended") return Infinity;
  if (p.mode === "demo") {
    const end = fullEnd ?? (await p.transcript.getTranscript(d.id)).cursor;
    return demoReplayOffset(Date.now(), end);
  }
  return Math.max(0, (Date.now() - Date.parse(d.startsAt)) / 1000);
}

export async function getParticipants(d: Debate) {
  const all = await getProviders().tse.candidates(d.electionYear);
  const parties = await getProviders().tse.parties(d.electionYear);
  return d.participantIds
    .map((id) => all.find((c) => c.id === id))
    .filter((c) => !!c)
    .map((c) => ({ ...c, party: parties.find((p) => p.id === c.partyId) ?? null }));
}

export type Participant = Awaited<ReturnType<typeof getParticipants>>[number];

/** Snapshot completo até `upTo` — usado por Overview, Live (estado inicial) e Analytics. */
export async function getDebateSnapshot(debateId: string, upTo?: number) {
  const p = getProviders();
  const debate = await p.transcript.getDebate(debateId);
  if (!debate) return null;
  const full = await p.transcript.getTranscript(debateId);
  const totalEnd = full.cursor;
  const at = upTo ?? (await currentOffset(debate, totalEnd));
  const offset = Math.min(at, totalEnd);
  const win = await p.transcript.getTranscript(debateId, { to: offset });
  const [events, blocks, participants, metrics, sources] = await Promise.all([
    p.transcript.getEvents(debateId, { to: offset }),
    p.transcript.getBlocks(debateId),
    getParticipants(debate),
    p.social.metrics({ debateId, bucketSize: 60, to: offset }),
    p.sources.list(),
  ]);
  const { segments, classifications } = win;
  const cids = participants.map((c) => c.id);
  const topics = topicStats(segments, classifications, { excludeModerator: MODERATOR_ID });
  // Somente temas já ocorridos — nunca expor dados posteriores ao instante atual.
  const heatTopics = topics.map((t) => t.topic) as TopicId[];

  return {
    mode: p.mode,
    debate,
    offset,
    totalEnd,
    isLive: debate.status === "live" && offset < totalEnd,
    inProgress: win.inProgress,
    blocks,
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
      platforms: p.social.platforms(),
    },
    sources: sources.filter((s) => debate.sourceIds.includes(s.id) || s.id.startsWith("src-demo-social-")),
  };
}

export type DebateSnapshot = NonNullable<Awaited<ReturnType<typeof getDebateSnapshot>>>;
