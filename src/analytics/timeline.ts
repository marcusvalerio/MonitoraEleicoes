import type { SpeechClassification, TopicId, TranscriptSegment, TimingPrecision } from "@/domain/types";
import { isTimed, MODERATOR_SPEAKER_ID, UNKNOWN_SPEAKER_ID } from "@/domain/types";
import { missing, val, type DataValue } from "@/domain/quality";
import { wordCount } from "./debate";

/**
 * DebateTimeline — volume de FALA ao longo do tempo (palavras e segundos por janela).
 * Só usa segmentos com tempo conhecido; sem nenhum, a série é "not_available".
 */
export type SpeechGranularity = 60 | 300 | 900 | 1800 | "total";

export interface SpeechBucket {
  start: number;
  size: number;
  words: number;
  seconds: number;
  segments: number;
  bySpeaker: Record<string, number>;
}

export function debateTimeline(segments: TranscriptSegment[], g: SpeechGranularity): DataValue<SpeechBucket[]> {
  const timed = segments.filter(isTimed);
  if (!timed.length) return missing("not_available", "a fonte da transcrição não informa horários");
  const end = Math.max(...timed.map((s) => s.endOffset));
  const size = g === "total" ? Math.max(1, end) : g;
  const n = Math.max(1, Math.ceil(end / size));
  const out: SpeechBucket[] = Array.from({ length: n }, (_, i) => ({ start: i * size, size, words: 0, seconds: 0, segments: 0, bySpeaker: {} }));
  for (const s of timed) {
    const i = Math.min(n - 1, Math.floor(s.startOffset / size));
    const w = wordCount(s.text);
    out[i].words += w;
    out[i].seconds += s.endOffset - s.startOffset;
    out[i].segments++;
    out[i].bySpeaker[s.speakerId] = (out[i].bySpeaker[s.speakerId] ?? 0) + w;
  }
  return val(out);
}

/** Resumo da precisão temporal da transcrição (para rótulos e estados de UI). */
export function timingSummary(segments: TranscriptSegment[]) {
  const byPrecision: Partial<Record<TimingPrecision, number>> = {};
  for (const s of segments) {
    const p = s.timing?.precision ?? (isTimed(s) ? "exact" : "unknown");
    byPrecision[p] = (byPrecision[p] ?? 0) + 1;
  }
  const timed = segments.filter(isTimed).length;
  return { total: segments.length, timed, untimed: segments.length - timed, byPrecision, replayable: timed > 0 };
}

/** Relatório de qualidade de uma transcrição ingerida. */
export interface TranscriptQuality {
  received: number;
  normalized: number;
  rejected: number;
  speakersResolved: number;
  speakersUnresolved: number;
  speakerConfidence: Record<string, number>;
  timestampsAvailable: number;
  timestampsMissing: number;
  classificationHigh: number;
  classificationMedium: number;
  classificationLow: number;
  unclassified: number;
  topicsOutros: number;
}

export function transcriptQuality(segments: TranscriptSegment[], cls: SpeechClassification[], report: { fetched: number; normalized: number; rejected: number } | null): TranscriptQuality {
  const byId = new Map(cls.map((c) => [c.segmentId, c]));
  const conf: Record<string, number> = {};
  for (const s of segments) {
    const k = s.speakerConfidence ?? (s.speakerId === UNKNOWN_SPEAKER_ID ? "unknown" : "high");
    conf[k] = (conf[k] ?? 0) + 1;
  }
  const c = segments.map((s) => byId.get(s.id));
  return {
    received: report?.fetched ?? segments.length,
    normalized: report?.normalized ?? segments.length,
    rejected: report?.rejected ?? 0,
    speakersResolved: segments.filter((s) => s.speakerId !== UNKNOWN_SPEAKER_ID).length,
    speakersUnresolved: segments.filter((s) => s.speakerId === UNKNOWN_SPEAKER_ID).length,
    speakerConfidence: conf,
    timestampsAvailable: segments.filter(isTimed).length,
    timestampsMissing: segments.filter((s) => !isTimed(s)).length,
    classificationHigh: c.filter((x) => x?.confidenceLevel === "high").length,
    classificationMedium: c.filter((x) => x?.confidenceLevel === "medium").length,
    classificationLow: c.filter((x) => x?.confidenceLevel === "low" || x?.confidenceLevel === "unknown").length,
    unclassified: c.filter((x) => !x).length,
    topicsOutros: c.filter((x) => x && x.topic === "outros" && segments.find((s) => s.id === x.segmentId)?.speakerId !== MODERATOR_SPEAKER_ID).length,
  };
}

export type { TopicId };
