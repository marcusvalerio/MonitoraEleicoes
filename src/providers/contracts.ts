import type { DataMode, SocialPlatform } from "@/domain/types";
import type { ProviderKind, SourceStatus } from "@/domain/provenance";
import type { GeoBoundarySet, GeoLevelId } from "@/geo/types";
import type { RateLimitInfo, RetryPolicy } from "./resilience";

/**
 * CONTRATOS DE PROVIDER
 *
 * Providers falam o formato da ORIGEM: devolvem registros brutos (RawRecord) paginados.
 * Nunca devolvem entidades de domínio — isso é trabalho da camada de normalização.
 */

// ───────── Comum ─────────

export interface ProviderInfo<C extends object = Record<string, boolean>> {
  id: string;
  name: string;
  kind: ProviderKind;
  /** "demo" = dados fictícios; "live" = dados reais. */
  mode: DataMode;
  /** O que este provider consegue fornecer. Nunca assumir paridade entre providers. */
  capabilities: C;
  config: ProviderConfig;
  rateLimit: RateLimitInfo;
  retry: RetryPolicy;
  /** Fonte lógica (Source.id) à qual os registros pertencem. */
  sourceId: string;
}

export interface ProviderConfig {
  /** Variáveis de ambiente exigidas (apenas nomes; valores ficam no servidor). */
  requiredEnv: string[];
  /** Presentes/ausentes — calculado no registry. */
  configured: boolean;
  baseUrl?: string;
}

/** Registro bruto recebido da origem, antes de qualquer normalização. */
export interface RawRecord<P = unknown> {
  providerId: string;
  /** Esquema do payload (versionado): "demo.social.metric/v1", "fixture.cue/v2"… */
  schema: string;
  externalId: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  collectedAt: string;
  payload: P;
}

export interface PageRequest {
  cursor?: string | null;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface TimeRange {
  /** ISO — inclusivo. */
  from?: string;
  /** ISO — exclusivo. */
  to?: string;
}

export interface ProviderHealth {
  status: SourceStatus;
  checkedAt: string;
  message?: string;
}

interface BaseProvider<C extends object> {
  readonly info: ProviderInfo<C>;
  health(): Promise<ProviderHealth>;
}

// ───────── Transcrição ─────────

export interface TranscriptCapabilities {
  realtime: boolean;
  historical: boolean;
  /** Pode reproduzir o evento como replay (demo/fixture). */
  replay: boolean;
  diarization: boolean;
  blocks: boolean;
}

export interface TranscriptProvider extends BaseProvider<TranscriptCapabilities> {
  /** Metadados dos eventos (debates) disponíveis. */
  listEvents(page?: PageRequest): Promise<Page<RawRecord>>;
  /** Segmentos brutos de um evento, paginados por cursor. */
  fetchSegments(eventExternalId: string, page?: PageRequest): Promise<Page<RawRecord>>;
}

// ───────── Redes sociais ─────────

export interface SocialCapabilities {
  realtime: boolean;
  historical: boolean;
  /** Fornece publicações individuais. */
  posts: boolean;
  /** Fornece contagens agregadas por janela (ex.: endpoints de "counts"). */
  aggregatedCounts: boolean;
  engagement: boolean;
  candidates: boolean;
  topics: boolean;
  /** Localização disponível: nenhuma, agregada por região ou por publicação. */
  geolocation: "none" | "aggregated" | "per_post";
}

export interface SocialQuery {
  eventExternalId: string;
  range?: TimeRange;
  platforms?: string[];
}

export interface SocialProvider extends BaseProvider<SocialCapabilities> {
  platforms(): SocialPlatform[];
  fetchPosts(q: SocialQuery, page?: PageRequest): Promise<Page<RawRecord>>;
  fetchCounts(q: SocialQuery, page?: PageRequest): Promise<Page<RawRecord>>;
  /** Contagens regionais (quando `geolocation !== "none"`). */
  fetchRegionalCounts(q: SocialQuery, page?: PageRequest): Promise<Page<RawRecord>>;
}

// ───────── Eleições (oficial) ─────────

export interface ElectionCapabilities {
  historical: boolean;
  candidates: boolean;
  parties: boolean;
  partyIdentity: boolean;
  results: boolean;
  /** Menor nível territorial disponível nos resultados. */
  resultsGranularity: GeoLevelId | null;
}

export interface ElectionQuery {
  year?: number;
  round?: 1 | 2;
  officeCode?: number;
  territory?: string;
}

export interface ElectionProvider extends BaseProvider<ElectionCapabilities> {
  fetchParties(q: ElectionQuery, page?: PageRequest): Promise<Page<RawRecord>>;
  fetchCandidates(q: ElectionQuery, page?: PageRequest): Promise<Page<RawRecord>>;
  /** Identidade visual (cores) de partidos com vigência. */
  fetchPartyIdentities(q: ElectionQuery, page?: PageRequest): Promise<Page<RawRecord>>;
  fetchResults(q: ElectionQuery, page?: PageRequest): Promise<Page<RawRecord>>;
}

/**
 * Contrato específico para dados oficiais do TSE (Portal de Dados Abertos).
 * Registros esperados (um por seção × cargo × candidato), com campos oficiais:
 * ANO_ELEICAO, NR_TURNO, CD_CARGO, SG_UF, CD_MUNICIPIO, NR_ZONA, NR_SECAO,
 * NR_VOTAVEL, QT_VOTOS, QT_APTOS, QT_COMPARECIMENTO, QT_ABSTENCOES,
 * QT_VOTOS_NOMINAIS, QT_VOTOS_BRANCOS, QT_VOTOS_NULOS.
 */
export interface TSEElectionProvider extends ElectionProvider {
  /** Arquivos oficiais disponíveis (para o pipeline arquivo → validação → normalização). */
  listFiles(q: ElectionQuery): Promise<{ fileName: string; url: string; version: string; checksum: string | null }[]>;
}

// ───────── Imprensa ─────────

export interface MediaCapabilities {
  articles: boolean;
  fullText: boolean;
  realtime: boolean;
}

export interface MediaProvider extends BaseProvider<MediaCapabilities> {
  fetchArticles(q: { eventExternalId?: string; range?: TimeRange }, page?: PageRequest): Promise<Page<RawRecord>>;
}

// ───────── Geografia ─────────

export interface GeoCapabilities {
  levels: GeoLevelId[];
  /** Tecnologia/formato de geometria servido. */
  format: "svg-path" | "topojson" | "geojson" | "vector-tiles";
}

/** Fonte de geometria — independente das métricas e do componente de mapa. */
export interface GeoProvider extends BaseProvider<GeoCapabilities> {
  boundaries(level: GeoLevelId): Promise<GeoBoundarySet | null>;
}

// ───────── IA ─────────

export interface ClassifierCapabilities {
  topics: boolean;
  speechType: boolean;
  tone: boolean;
  entities: boolean;
}

export type AnyProvider = TranscriptProvider | SocialProvider | ElectionProvider | MediaProvider | GeoProvider;

/** Utilitário de paginação em memória (providers demo/fixture). */
export function paginate<T>(all: T[], page?: PageRequest, maxLimit = 500): Page<T> {
  const limit = Math.max(1, Math.min(maxLimit, page?.limit ?? 200));
  const start = page?.cursor ? Number(page.cursor) : 0;
  if (!Number.isInteger(start) || start < 0) throw new Error(`cursor inválido: ${page?.cursor}`);
  const items = all.slice(start, start + limit);
  const next = start + items.length;
  return { items, nextCursor: next < all.length ? String(next) : null, hasMore: next < all.length };
}

/** Percorre todas as páginas — usar só na ingestão, nunca em request de UI. */
export async function collectAll<T>(fetchPage: (p: PageRequest) => Promise<Page<T>>, limit = 500, maxPages = 10_000): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page: Page<T> = await fetchPage({ cursor, limit });
    out.push(...page.items);
    if (!page.hasMore || !page.nextCursor) return out;
    cursor = page.nextCursor;
  }
  throw new Error("paginação excedeu o limite de páginas");
}
