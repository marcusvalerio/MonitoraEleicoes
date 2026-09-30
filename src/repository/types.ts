import type { Candidate, Debate, DebateBlock, DebateEvent, MediaArticle, Party, SocialMetric, SocialPlatform, SocialPost, Source, SpeechClassification, TranscriptSegment } from "@/domain/types";
import type { PartyVisualIdentity } from "@/domain/identity";
import type { SourceRecord } from "@/domain/provenance";
import type { GeoMetric } from "@/geo/types";
import type { GeoCoverage } from "@/analytics/coverage";
import type { TranscriptQuality } from "@/analytics/timeline";
import type { IngestionReport } from "@/ingestion/store";
import type { Page, PageRequest } from "@/providers/contracts";
import type { ClockSpec } from "@/lib/clock";
import type { LiveState } from "@/domain/live";

export type SourceWithIngestion = Source & { ingestion: { fetched: number; normalized: number; rejected: number; status: string } | null };

export interface TranscriptWindow {
  segments: TranscriptSegment[];
  classifications: SpeechClassification[];
  cursor: number;
  complete: boolean;
  inProgress: { speakerId: string; startOffset: number; blockId: string } | null;
}

export interface DataStatus {
  profile: string;
  profileLabel: string;
  mode: "demo" | "live";
  overall: "connected" | "degraded" | "offline" | "not_configured" | "demo";
  replay: boolean;
  providers: { id: string; name: string; kind: string; configured: boolean }[];
  persistence: "memory" | "postgres";
  issues: { failed: number; partial: number; rejected: number };
  ingestedAt: string;
}

/**
 * REPOSITÓRIO DE DOMÍNIO — única porta de leitura de services/API/UI.
 * Implementações: memória (demo/fixture) e PostgreSQL/Neon (live). Services não sabem qual.
 */
export interface Repository {
  readonly mode: "demo" | "live";
  readonly clock: ClockSpec;
  moderatorId(): string;
  platforms(): SocialPlatform[];

  listDebates(): Promise<Debate[]>;
  getDebate(id: string): Promise<Debate | null>;
  getBlocks(debateId: string): Promise<DebateBlock[]>;
  transcriptEnd(debateId: string): Promise<number>;
  getTranscript(debateId: string, range?: { from?: number; to?: number }): Promise<TranscriptWindow>;
  getTranscriptQuality(debateId: string): Promise<TranscriptQuality>;
  getTranscriptPage(debateId: string, page: PageRequest & { to?: number }): Promise<Page<{ segment: TranscriptSegment; analysis: SpeechClassification | null; record: SourceRecord | null }>>;
  getSegment(debateId: string, id: string): Promise<TranscriptSegment | null>;
  getEvents(debateId: string, range?: { to?: number }): Promise<DebateEvent[]>;

  getCandidates(): Promise<Candidate[]>;
  getParties(): Promise<Party[]>;
  getPartyIdentities(): Promise<PartyVisualIdentity[]>;
  getElectoralResults(): Promise<{ status: "not_collected"; rows: never[]; reason: string }>;

  getSocialMetrics(debateId: string, range?: { to?: number }): Promise<SocialMetric[]>;
  getSocialPosts(debateId: string, page: PageRequest & { from?: number; to?: number }): Promise<Page<SocialPost>>;
  getGeoMetrics(debateId: string, range?: { to?: number }): Promise<GeoMetric[]>;
  getGeoCoverage(debateId: string, range?: { from?: number; to?: number }): Promise<GeoCoverage>;
  getArticles(debateId?: string): Promise<MediaArticle[]>;

  getSources(): Promise<SourceWithIngestion[]>;
  getReports(): Promise<IngestionReport[]>;
  getSourceRecord(id: string): Promise<SourceRecord | null>;
  getDataStatus(): Promise<DataStatus>;

  /** Estado ao vivo INCREMENTAL: só segmentos com seq > afterSeq (consulta indexada). afterSeq < 0 = os `limit` mais recentes. */
  getLiveState(debateId: string, afterSeq?: number, limit?: number): Promise<LiveState | null>;
}
