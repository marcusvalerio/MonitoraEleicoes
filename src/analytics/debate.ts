import type { Candidate, SpeechClassification, SpeechType, TopicId, TranscriptSegment } from "@/domain/types";
import { isTimed } from "@/domain/types";

const dur = (s: TranscriptSegment) => (isTimed(s) ? s.endOffset - s.startOffset : 0);
export const wordCount = (t: string) => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length;
import { SPEECH_GROUPS, speechGroupOf, type SpeechGroupId } from "@/domain/labels";

/** Agregações puras sobre o debate. Sem juízo de desempenho. */

export interface TopicStat {
  topic: TopicId;
  segments: number;
  /** Soma das durações conhecidas (segmentos sem tempo não contam). */
  seconds: number;
  words: number;
  share: number;
}

export function topicStats(segments: TranscriptSegment[], cls: SpeechClassification[], opts?: { excludeModerator?: string }): TopicStat[] {
  const byId = new Map(cls.map((c) => [c.segmentId, c]));
  const acc = new Map<TopicId, { segments: number; seconds: number; words: number }>();
  let total = 0;
  for (const s of segments) {
    if (opts?.excludeModerator && s.speakerId === opts.excludeModerator) continue;
    const c = byId.get(s.id);
    if (!c || c.topic === "outros") continue;
    const a = acc.get(c.topic) ?? { segments: 0, seconds: 0, words: 0 };
    a.segments++;
    a.seconds += dur(s);
    a.words += wordCount(s.text);
    acc.set(c.topic, a);
    total++;
  }
  return [...acc.entries()]
    .map(([topic, v]) => ({ topic, ...v, share: total ? v.segments / total : 0 }))
    .sort((a, b) => b.segments - a.segments || b.seconds - a.seconds);
}

export interface CandidateActivity {
  candidateId: string;
  /** null quando nenhum segmento do candidato tem tempo conhecido (não é zero). */
  speakingSeconds: number | null;
  /** Segmentos sem tempo conhecido (tempo de fala parcial se > 0). */
  untimedSegments: number;
  words: number;
  interventions: number;
  questionsAsked: number;
  questionsReceived: number;
  answers: number;
  mentionsMade: number;
  mentionsReceived: number;
}

export function candidateActivity(candidates: Candidate[], segments: TranscriptSegment[], cls: SpeechClassification[]): CandidateActivity[] {
  const byId = new Map(cls.map((c) => [c.segmentId, c]));
  return candidates.map((cand) => {
    const own = segments.filter((s) => s.speakerId === cand.id);
    const types = own.map((s) => byId.get(s.id)?.speechType);
    return {
      candidateId: cand.id,
      speakingSeconds: own.some(isTimed) ? own.reduce((a, s) => a + dur(s), 0) : null,
      untimedSegments: own.filter((s) => !isTimed(s)).length,
      words: own.reduce((a, s) => a + wordCount(s.text), 0),
      interventions: own.length,
      questionsAsked: types.filter((t) => t === "pergunta").length,
      questionsReceived: segments.filter((s) => s.addressedToId === cand.id && byId.get(s.id)?.speechType === "pergunta").length,
      answers: types.filter((t) => t === "resposta" || t === "proposta" || t === "promessa" || t === "defesa").length,
      mentionsMade: own.reduce((a, s) => a + (byId.get(s.id)?.mentions.length ?? 0), 0),
      mentionsReceived: segments.filter((s) => byId.get(s.id)?.mentions.includes(cand.id)).length,
    };
  });
}

export type Composition = Record<SpeechGroupId, number>;

export function emptyComposition(): Composition {
  return Object.fromEntries(SPEECH_GROUPS.map((g) => [g.id, 0])) as Composition;
}

export function speechComposition(speakerIds: string[], segments: TranscriptSegment[], cls: SpeechClassification[]): Record<string, Composition> {
  const byId = new Map(cls.map((c) => [c.segmentId, c]));
  const out: Record<string, Composition> = Object.fromEntries(speakerIds.map((id) => [id, emptyComposition()]));
  for (const s of segments) {
    const c = byId.get(s.id);
    if (!c || !out[s.speakerId]) continue;
    out[s.speakerId][speechGroupOf(c.speechType)]++;
  }
  return out;
}

export function countBy<T extends string>(items: T[]): Record<T, number> {
  return items.reduce((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {} as Record<T, number>);
}

export function typeCounts(cls: SpeechClassification[]): Partial<Record<SpeechType, number>> {
  return countBy(cls.map((c) => c.speechType));
}

/** Matriz tema × janela de tempo (segundos de fala), para heatmap. */
export function topicHeatmap(segments: TranscriptSegment[], cls: SpeechClassification[], windowSize: number, topics: TopicId[]) {
  const byId = new Map(cls.map((c) => [c.segmentId, c]));
  const timed = segments.filter(isTimed);
  const end = timed.reduce((m, s) => Math.max(m, s.endOffset), 0);
  const nWin = Math.max(1, Math.ceil(end / windowSize));
  const grid: number[][] = topics.map(() => new Array(nWin).fill(0));
  for (const s of timed) {
    const c = byId.get(s.id);
    if (!c) continue;
    const row = topics.indexOf(c.topic);
    if (row < 0) continue;
    // distribui a duração do segmento pelas janelas que ele cobre
    for (let w = Math.floor(s.startOffset / windowSize); w <= Math.floor((s.endOffset - 1) / windowSize) && w < nWin; w++) {
      const a = Math.max(s.startOffset, w * windowSize);
      const b = Math.min(s.endOffset, (w + 1) * windowSize);
      grid[row][w] += Math.max(0, b - a);
    }
  }
  return { grid, windows: nWin, windowSize };
}

/** Sequência de temas ao longo do debate (colapsa falas consecutivas do mesmo tema). */
export function topicTimeline(segments: TranscriptSegment[], cls: SpeechClassification[]) {
  const byId = new Map(cls.map((c) => [c.segmentId, c]));
  const out: { topic: TopicId; start: number; end: number; segments: number }[] = [];
  for (const s of segments.filter(isTimed)) {
    const c = byId.get(s.id);
    if (!c || c.topic === "outros") continue;
    const last = out[out.length - 1];
    if (last && last.topic === c.topic && s.startOffset - last.end < 30) {
      last.end = s.endOffset;
      last.segments++;
    } else out.push({ topic: c.topic, start: s.startOffset, end: s.endOffset, segments: 1 });
  }
  return out;
}

/** Arestas de interação (quem menciona/pergunta/responde a quem). Não valoradas. */
export interface InteractionEdge {
  from: string;
  to: string;
  kind: "menciona" | "pergunta" | "responde";
  count: number;
  segmentIds: string[];
}

export function interactionEdges(segments: TranscriptSegment[], cls: SpeechClassification[], candidateIds: string[]): InteractionEdge[] {
  const byId = new Map(cls.map((c) => [c.segmentId, c]));
  const edges = new Map<string, InteractionEdge>();
  const add = (from: string, to: string, kind: InteractionEdge["kind"], seg: string) => {
    if (!candidateIds.includes(from) || !candidateIds.includes(to) || from === to) return;
    const k = `${from}|${to}|${kind}`;
    const e = edges.get(k) ?? { from, to, kind, count: 0, segmentIds: [] };
    e.count++;
    e.segmentIds.push(seg);
    edges.set(k, e);
  };
  for (const s of segments) {
    const c = byId.get(s.id);
    if (!c) continue;
    for (const m of c.mentions) add(s.speakerId, m, "menciona", s.id);
    if (c.speechType === "pergunta" && s.addressedToId) add(s.speakerId, s.addressedToId, "pergunta", s.id);
    else if (s.addressedToId && ["resposta", "proposta", "promessa", "defesa"].includes(c.speechType)) add(s.speakerId, s.addressedToId, "responde", s.id);
  }
  return [...edges.values()];
}


/** Distribuição da fala por candidato: temas, tipos e tons (contagens; não é desempenho). */
export function candidateSpeechDistribution(candidateIds: string[], segments: TranscriptSegment[], cls: SpeechClassification[]) {
  const byId = new Map(cls.map((c) => [c.segmentId, c]));
  return candidateIds.map((id) => {
    const own = segments.filter((s) => s.speakerId === id);
    const topics: Partial<Record<TopicId, number>> = {};
    const types: Partial<Record<SpeechType, number>> = {};
    const tones: Record<string, number> = {};
    for (const s of own) {
      const c = byId.get(s.id);
      if (!c) continue;
      topics[c.topic] = (topics[c.topic] ?? 0) + 1;
      types[c.speechType] = (types[c.speechType] ?? 0) + 1;
      tones[c.tone] = (tones[c.tone] ?? 0) + 1;
    }
    return { candidateId: id, segments: own.length, words: own.reduce((a, s) => a + wordCount(s.text), 0), topics, types, tones };
  });
}
