/**
 * Domínio do Monitora Eleições.
 * Independente de UI e de providers. Toda entidade que carrega dado
 * possui `provenance` para diferenciar DADO OFICIAL, COLETADO, IA e ANÁLISE.
 */

/** Natureza epistemológica do dado — renderizada visualmente em toda a UI. */
export type DataNature = "official" | "collected" | "ai" | "analysis";

/** Modo de dados. Dados demo nunca se misturam com reais. */
export type DataMode = "demo" | "live";

export type SourceType = "official" | "social" | "media" | "transcript" | "ai_analysis";
export type { SourceStatus } from "./provenance";
import type { SourceStatus } from "./provenance";
import type { RecordRef, ProviderKind } from "./provenance";
import type { ConfidenceLevel, DataValue } from "./quality";

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  provider: string;
  url: string | null;
  /** Momento a que o dado se refere (ISO). */
  timestamp: string;
  /** Momento da coleta (ISO). */
  collectedAt: string;
  status: SourceStatus;
  mode: DataMode;
  description: string;
  recordCount: number;
  /** Provider responsável e seu tipo (quando aplicável). */
  providerId?: string;
  providerKind?: ProviderKind;
  license?: string;
}

export interface Provenance {
  nature: DataNature;
  sourceId: string;
  mode: DataMode;
  /** Registro de origem (quando a entidade veio de um registro individual). */
  record?: RecordRef;
}

/** Identificador do orador de moderação (independente de provider). */
export const MODERATOR_SPEAKER_ID = "moderador";

// ───────── Candidatos / partidos ─────────
export interface Party {
  id: string;
  acronym: string;
  name: string;
  number: number;
  provenance?: Provenance;
}

/** Território eleitoral oficial (hierarquia TSE/IBGE). */
export interface Territory {
  key: string;
  level: GeoLevel;
  name: string;
  parentKey: string | null;
  ibgeCode: number | null;
  tseCode: number | null;
}

export interface Candidate {
  id: string;
  name: string;
  ballotName: string;
  partyId: string;
  officeId: string;
  /** Cor de identificação derivada da PartyVisualIdentity vigente (nunca semântica). */
  swatch: string;
  initials: string;
  provenance?: Provenance;
}

// ───────── Debate ─────────
export type DebateStatus = "scheduled" | "live" | "ended";

export interface Debate {
  id: string;
  title: string;
  /** Jurisdição (ex.: "BR", "RJ"). */
  jurisdiction?: string;
  broadcaster: string;
  officeLabel: string;
  electionYear: number;
  round: 1 | 2;
  /** Início programado (ISO). */
  startsAt: string;
  /** Fim (ISO); null quando a fonte não informa. */
  endsAt: string | null;
  status: DebateStatus;
  participantIds: string[];
  sourceIds: string[];
  mode: DataMode;
}

export interface DebateParticipant {
  debateId: string;
  candidateId: string;
  podium: number;
}

export const TOPICS = [
  "economia",
  "emprego",
  "seguranca",
  "saude",
  "educacao",
  "infraestrutura",
  "meio_ambiente",
  "impostos",
  "previdencia",
  "corrupcao",
  "justica",
  "politica_externa",
  "tecnologia",
  "assistencia_social",
  "outros",
] as const;
export type TopicId = (typeof TOPICS)[number];

export const SPEECH_TYPES = [
  "proposta",
  "critica",
  "resposta",
  "defesa",
  "ataque",
  "informacao",
  "comparacao",
  "promessa",
  "pergunta",
  "contraponto",
] as const;
export type SpeechType = (typeof SPEECH_TYPES)[number];

export const TONES = ["propositivo", "critico", "defensivo", "confrontativo", "neutro", "informativo"] as const;
export type Tone = (typeof TONES)[number];

export const FACT_CHECK = ["nao_necessario", "verificar", "em_verificacao", "verificado", "contexto_necessario"] as const;
export type FactCheckStatus = (typeof FACT_CHECK)[number];

export const RELEVANCE = ["baixa", "media", "alta"] as const;
export type Relevance = (typeof RELEVANCE)[number];

/** Bloco do debate (moderação), usado para segmentar a linha do tempo. */
export interface DebateBlock {
  id: string;
  label: string;
  startOffset: number | null;
  endOffset: number | null;
}

/** Segmento com tempo conhecido — requisito das análises temporais. */
export type TimedSegment = TranscriptSegment & { startOffset: number; endOffset: number };
export const isTimed = (s: TranscriptSegment): s is TimedSegment => typeof s.startOffset === "number" && typeof s.endOffset === "number" && Number.isFinite(s.startOffset) && Number.isFinite(s.endOffset);

/**
 * Precisão temporal de um segmento — timestamps nunca são inventados.
 *  exact       — início/fim da própria fonte (legenda, ASR)
 *  approximate — horário aproximado (ex.: minuto de publicação)
 *  block       — só se sabe o bloco do debate
 *  sequence    — só se sabe a ordem
 *  unknown     — nada se sabe sobre o tempo
 */
export type TimingPrecision = "exact" | "approximate" | "block" | "sequence" | "unknown";

/** Orador não identificado com segurança. */
export const UNKNOWN_SPEAKER_ID = "orador-desconhecido";

/** RAW — nunca é alterado pela IA. */
export interface TranscriptSegment {
  id: string;
  debateId: string;
  seq: number;
  /** ID do candidato, "moderador" ou UNKNOWN_SPEAKER_ID. */
  speakerId: string;
  /** Rótulo do orador como aparece na fonte (antes da resolução). */
  speakerName?: string | null;
  /** Confiança na identificação do orador. */
  speakerConfidence?: ConfidenceLevel;
  /** Como o orador foi resolvido. */
  speakerResolution?: "source_label" | "manual_map" | "press_attribution" | "unresolved";
  /** Segundos desde o início do debate; null quando a fonte não informa. */
  startOffset: number | null;
  endOffset: number | null;
  timing?: { precision: TimingPrecision };
  text: string;
  blockId: string;
  /** Candidato a quem a fala é endereçada no formato do debate (pergunta/resposta). */
  addressedToId: string | null;
  provenance: Provenance;
}

export interface ModelInfo {
  model: string;
  version: string;
  promptVersion: string;
}

/** AI ANALYSIS — armazenada separadamente do RAW. */
export interface SpeechClassification {
  segmentId: string;
  topic: TopicId;
  subtopic: string | null;
  speechType: SpeechType;
  tone: Tone;
  /** Candidato alvo da fala, se houver. */
  targetId: string | null;
  mentions: string[];
  relevance: Relevance;
  relevanceScore: number;
  /** Metodologia/versão que calculou a relevância (independente do modelo). */
  relevanceMethod?: { method: string; version: string };
  /** Critérios objetivos que compõem a relevância (transparência). */
  relevanceFeatures: {
    verifiableClaim: boolean;
    concreteProposal: boolean;
    mentionsOther: boolean;
    triggersReply: boolean;
    socialLift: number;
  };
  factCheck: FactCheckStatus;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  model: ModelInfo;
  classifiedAt: string;
  /** Revisão humana (P2). */
  humanReviewed: boolean;
  provenance: Provenance;
}

export type DebateEventKind = "mention" | "reply_chain" | "topic_shift" | "social_spike" | "fact_check_flag";

export interface DebateEvent {
  id: string;
  code: string;
  debateId: string;
  kind: DebateEventKind;
  startOffset: number;
  title: string;
  description: string;
  segmentIds: string[];
  candidateIds: string[];
  topic: TopicId;
  subtopic: string | null;
  socialPostIds: string[];
  metrics: { label: string; value: number; unit?: string }[];
  sourceIds: string[];
  /** Separação explícita entre fato, medição e interpretação. */
  statements: import("./statements").Statement[];
  provenance: Provenance;
}

// ───────── Social ─────────
export type SocialPlatformId = "x" | "youtube" | "tiktok" | "instagram" | "facebook" | "threads" | "telegram";

export interface SocialPlatform {
  id: SocialPlatformId;
  name: string;
  /** Nível de acesso real da API — plataformas não são equivalentes. */
  access: "full" | "limited" | "restricted" | "none";
  notes: string;
}

export interface SocialPost {
  id: string;
  platform: SocialPlatformId;
  /** Offset relativo ao debate (s). */
  offset: number;
  text: string;
  authorHandle: string;
  mentionsCandidateIds: string[];
  topic: TopicId | null;
  terms: string[];
  url: string | null;
  provenance: Provenance;
}

/** Menções extraídas de publicações — entidades separadas do post. */
export interface CandidateMention {
  postId: string;
  candidateId: string;
  method: "exact_name" | "alias" | "model";
  confidence: ConfidenceLevel;
}
export interface PartyMention {
  postId: string;
  partyId: string;
  /** "direct" = sigla/nome do partido; "via_candidate" = atribuída pelo candidato citado. */
  method: "direct" | "via_candidate";
  confidence: ConfidenceLevel;
}
export interface TopicMention {
  postId: string;
  topic: TopicId;
  confidence: ConfidenceLevel;
  model: ModelInfo | null;
}

export type LocationPrecision = "country" | "state" | "municipality" | "unknown";
export type LocationSource = "geotag" | "profile" | "text_mention" | "platform_region" | "none";

/** Localização de uma publicação — inferida nunca é apresentada como exata. */
export interface GeoMention {
  postId: string;
  regionKey: string | null;
  precision: LocationPrecision;
  source: LocationSource;
  confidence: ConfidenceLevel;
}

export interface MediaArticle {
  id: string;
  outlet: string;
  title: string;
  url: string | null;
  publishedAt: string;
  debateId: string | null;
  topics: TopicId[];
  provenance: Provenance;
}

export interface SocialMetric {
  platform: SocialPlatformId;
  bucketStart: number;
  bucketSize: number;
  posts: number;
  mentionsByCandidate: Record<string, number>;
  byTopic: Partial<Record<TopicId, number>>;
  provenance: Provenance;
}

// ───────── Eleições (P1 — modelo pronto) ─────────
export interface Election {
  id: string;
  year: number;
  label: string;
  sourceId: string;
}
export interface ElectionRound {
  id: string;
  electionId: string;
  round: 1 | 2;
  date: string;
}
export interface Office {
  id: string;
  code: number;
  name: string;
}
export interface Region {
  id: string;
  name: string;
}
export interface State {
  uf: string;
  name: string;
  regionId: string;
}
export interface Municipality {
  tseCode: number;
  ibgeCode: number | null;
  name: string;
  uf: string;
}
export interface ElectoralZone {
  uf: string;
  number: number;
  municipalityCode: number;
}
export interface PollingPlace {
  id: string;
  uf: string;
  zone: number;
  number: number;
  name: string;
  address: string | null;
}
export interface PollingSection {
  uf: string;
  zone: number;
  number: number;
  pollingPlaceId: string;
}

export type GeoLevel = "brasil" | "regiao" | "uf" | "municipio" | "zona" | "local" | "secao";

export interface ElectoralResult {
  roundId: string;
  officeId: string;
  level: GeoLevel;
  /** Chave da localidade no nível (ex.: "RJ", "RJ:60011", "RJ:125:34"). */
  locationKey: string;
  eligibleVoters: DataValue<number>;
  turnout: DataValue<number>;
  abstention: DataValue<number>;
  validVotes: DataValue<number>;
  blankVotes: DataValue<number>;
  nullVotes: DataValue<number>;
  votesByCandidate: Record<string, DataValue<number>>;
  importBatchId: string;
  provenance: Provenance;
}

export interface ImportBatch {
  id: string;
  electionId: string;
  fileName: string;
  fileVersion: string;
  checksum: string;
  importedAt: string;
  rows: number;
  status: "validated" | "normalized" | "loaded" | "failed";
}

export interface Analysis {
  id: string;
  title: string;
  body: string;
  basedOn: string[];
  createdAt: string;
  provenance: Provenance;
}
