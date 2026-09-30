import type { ConfidenceLevel } from "./quality";
import type { Provenance } from "./types";

/**
 * SOCIAL LISTENING — monitoramento das FONTES CONECTADAS E DISPONÍVEIS (nunca "toda a internet").
 * Separações obrigatórias:
 *   volume (quantidade de conteúdos) × menções (entidade citada) × engagement (só o que a plataforma fornece)
 *   × sentimento do conteúdo × sentimento em relação à entidade × apoio (só com evidência explícita).
 * Menção ≠ apoio. Volume ≠ popularidade eleitoral.
 */
export const SOCIAL_CONTENT_TYPES = ["post", "comment", "reply", "news", "video", "live"] as const;
export type SocialContentType = (typeof SOCIAL_CONTENT_TYPES)[number];
export const MENTION_TYPES = ["mencao", "apoio_explicito", "critica_explicita", "comparacao", "pergunta", "noticia", "ironia", "neutro", "unclear"] as const;
export type MentionType = (typeof MENTION_TYPES)[number];
export const SENTIMENT_VALUES = ["positivo", "negativo", "neutro", "misto", "incerto"] as const;
export type Sentiment = (typeof SENTIMENT_VALUES)[number];
export type GeoSource = "declarada" | "mencao_explicita" | "institucional" | "estruturada" | "nenhuma";

export const MENTION_LABEL: Record<MentionType, string> = { mencao: "Menção", apoio_explicito: "Apoio explícito", critica_explicita: "Crítica explícita", comparacao: "Comparação", pergunta: "Pergunta", noticia: "Notícia", ironia: "Ironia", neutro: "Neutro", unclear: "Indefinido" };
export const SENTIMENT_LABEL: Record<Sentiment, string> = { positivo: "Positivo", negativo: "Negativo", neutro: "Neutro", misto: "Misto", incerto: "Incerto" };

/** Métricas públicas exatamente como a plataforma forneceu (chave ausente = não fornecido, nunca 0). */
export interface SocialMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  replies?: number;
  shares?: number;
}

export interface SocialRecord {
  /** `${platform}:${externalId}` */
  id: string;
  platform: string;
  providerId: string;
  externalId: string;
  monitorId: string | null;
  contentType: SocialContentType;
  parentId: string | null;
  rootId: string | null;
  /** HMAC do id do autor (nunca o id em claro). */
  authorHash: string | null;
  /** Só para publicadores (vídeo/live/notícia); null para comentaristas. */
  authorDisplayName: string | null;
  publishedAt: string | null;
  collectedAt: string;
  title: string | null;
  /** Texto original (nunca reescrito). */
  text: string;
  language: string | null;
  permalink: string | null;
  mediaType: string | null;
  metrics: SocialMetrics;
  contentHash: string;
  provenance: Provenance;
}

export interface SocialEntityLink {
  recordId: string;
  entityType: "candidacy" | "party";
  entityId: string;
  mentionType: MentionType;
  mentionConfidence: ConfidenceLevel;
  /** Sentimento EM RELAÇÃO à entidade (≠ sentimento do conteúdo). */
  entitySentiment: Sentiment;
  evidence: string | null;
}

export interface SocialAnalysis {
  recordId: string;
  analysisVersion: string;
  contentHash: string;
  classifier: string;
  contentSentiment: Sentiment;
  sentimentConfidence: ConfidenceLevel;
  topic: string;
  topicConfidence: ConfidenceLevel;
  topicEvidence: string[];
  relevant: boolean;
  /** UF MENCIONADA/DECLARADA — nunca inferida por idioma ou "provável". */
  geoUf: string | null;
  geoSource: GeoSource;
  geoEvidence: string | null;
  entities: SocialEntityLink[];
}

export interface SocialMonitor {
  id: string;
  name: string;
  electionYear: number | null;
  officeIds: number[];
  candidacyIds: number[];
  parties: string[];
  ufs: string[];
  terms: string[];
  platforms: string[];
  intervalS: number;
  status: "draft" | "active" | "paused" | "archived";
  debateId: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}
