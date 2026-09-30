import type {
  Candidate,
  DataMode,
  Debate,
  DebateBlock,
  DebateEvent,
  ElectoralResult,
  FactCheckStatus,
  ImportBatch,
  Party,
  SocialMetric,
  SocialPlatform,
  SocialPlatformId,
  SocialPost,
  Source,
  SpeechClassification,
  TranscriptSegment,
} from "@/domain/types";
import type { GeoBoundarySet, GeoLevelId as GeoLevel, GeoMetric } from "@/geo/types";

/**
 * Contratos de providers. O domínio e a UI dependem SOMENTE destas interfaces.
 * Implementações reais (TSE, X, YouTube…) rodam exclusivamente no servidor.
 */

export interface ProviderHealth {
  status: "ok" | "degraded" | "unavailable";
  checkedAt: string;
  message?: string;
}

export interface TranscriptWindow {
  segments: TranscriptSegment[];
  classifications: SpeechClassification[];
  /** Offset (s) do dado mais recente disponível. */
  cursor: number;
  complete: boolean;
  /** Fala em andamento no instante `to` (ainda sem transcrição completa). */
  inProgress: { speakerId: string; startOffset: number; blockId: string } | null;
}

export interface TranscriptProvider {
  readonly id: string;
  readonly mode: DataMode;
  listDebates(): Promise<Debate[]>;
  getDebate(id: string): Promise<Debate | null>;
  getBlocks(debateId: string): Promise<DebateBlock[]>;
  /** Janela de transcrição (server-side filtering) — suporta ingestão incremental ao vivo. */
  getTranscript(debateId: string, range?: { from?: number; to?: number }): Promise<TranscriptWindow>;
  getEvents(debateId: string, range?: { from?: number; to?: number }): Promise<DebateEvent[]>;
  health(): Promise<ProviderHealth>;
}

export interface SocialSearchQuery {
  debateId: string;
  platforms?: SocialPlatformId[];
  from?: number;
  to?: number;
  candidateId?: string;
  limit?: number;
}

export interface SocialSearchResult {
  posts: SocialPost[];
  total: number;
  platform: SocialPlatformId | "all";
  /** Limitações informadas pelo provider (rate limit, amostragem…). */
  caveats: string[];
}

export interface SocialProvider {
  readonly id: string;
  readonly mode: DataMode;
  platforms(): SocialPlatform[];
  search(q: SocialSearchQuery): Promise<SocialSearchResult>;
  metrics(q: SocialSearchQuery & { bucketSize: number }): Promise<SocialMetric[]>;
  health(): Promise<ProviderHealth>;
}

export interface ResultQuery {
  year: number;
  round: 1 | 2;
  officeId: string;
  level: import("@/domain/types").GeoLevel;
  parentKey?: string;
}

export interface TSEProvider {
  readonly id: string;
  readonly mode: DataMode;
  candidates(year: number): Promise<Candidate[]>;
  parties(year: number): Promise<Party[]>;
  results(q: ResultQuery): Promise<ElectoralResult[]>;
  importBatches(): Promise<ImportBatch[]>;
  health(): Promise<ProviderHealth>;
}

export interface GeoProvider {
  readonly id: string;
  readonly mode: DataMode;
  /** Fração das publicações com localização inferível. */
  readonly geolocatedShare: number;
  /** Contornos para um nível; `null` quando não há geometria (UI usa grade). */
  boundaries(level: GeoLevel): Promise<GeoBoundarySet | null>;
  /** Métricas na granularidade mais fina disponível, até `to`. */
  metrics(debateId: string, range?: { to?: number }): Promise<GeoMetric[]>;
}

export interface FactCheckProvider {
  readonly id: string;
  status(segmentId: string): Promise<{ status: FactCheckStatus; url: string | null } | null>;
}

export interface SourceRegistry {
  list(): Promise<Source[]>;
  get(id: string): Promise<Source | null>;
}
