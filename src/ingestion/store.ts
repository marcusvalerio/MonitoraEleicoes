import type {
  Candidate,
  CandidateMention,
  Debate,
  DebateBlock,
  MediaArticle,
  Party,
  PartyMention,
  SocialMetric,
  SocialPost,
  SpeechClassification,
  TopicMention,
  TranscriptSegment,
} from "@/domain/types";
import type { PartyVisualIdentity } from "@/domain/identity";
import type { SourceRecord } from "@/domain/provenance";
import type { GeoMetric } from "@/geo/types";

export interface IngestionIssue {
  externalId: string;
  code: string;
  message: string;
  field: string | null;
}

/** Relatório por provider: quantos registros chegaram, quantos viraram domínio, quantos foram rejeitados. */
export interface IngestionReport {
  providerId: string;
  sourceId: string;
  kind: string;
  status: "ok" | "partial" | "failed" | "skipped";
  fetched: number;
  normalized: number;
  rejected: number;
  issues: IngestionIssue[];
  startedAt: string;
  finishedAt: string;
  message?: string;
}

/**
 * Armazenamento normalizado em memória (substituível por PostgreSQL — ver db/schema.sql).
 * Contém SOMENTE entidades de domínio + registros de origem; nenhum formato de provider.
 */
export class DataStore {
  sourceRecords = new Map<string, SourceRecord>();
  parties = new Map<string, Party>();
  candidates = new Map<string, Candidate>();
  identities: PartyVisualIdentity[] = [];
  debates = new Map<string, Debate>();
  blocks = new Map<string, DebateBlock[]>();
  segments = new Map<string, TranscriptSegment[]>();
  classifications = new Map<string, SpeechClassification>();
  socialMetrics = new Map<string, SocialMetric[]>();
  socialPosts = new Map<string, SocialPost[]>();
  candidateMentions: CandidateMention[] = [];
  partyMentions: PartyMention[] = [];
  topicMentions: TopicMention[] = [];
  geoMetrics = new Map<string, GeoMetric[]>();
  articles: MediaArticle[] = [];
  reports: IngestionReport[] = [];
  /** Payload bruto de TODO registro recebido (aceito ou rejeitado), por id interno. */
  raws = new Map<string, { raw: import("@/providers/contracts").RawRecord; sourceId: string; hash: string; reportIndex: number; accepted: boolean }>();
  /** TODAS as rejeições (o relatório guarda só as primeiras para exibição). */
  rejections: { reportIndex: number; recordId: string | null; externalId: string; code: string; field: string | null; message: string }[] = [];
  /** Cursor de retomada por fluxo (ingestão incremental). */
  cursors = new Map<string, string | null>();
  /** Cobertura editorial: fatos da fonte, interpretação versionada e o que cada coleta viu (detecção de remoção). */
  editorial: import("@/domain/editorial").EditorialUpdate[] = [];
  editorialAnalyses = new Map<string, import("@/domain/editorial").EditorialAnalysis>();
  editorialSnapshots: { debateId: string; providerId: string; snapshot: import("@/providers/contracts").EditorialSnapshot }[] = [];
  ingestedAt = new Date().toISOString();

  push<K>(map: Map<K, unknown[]>, key: K, v: unknown) {
    const arr = map.get(key) ?? [];
    arr.push(v);
    map.set(key, arr);
  }
}
