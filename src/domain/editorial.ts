import type { ConfidenceLevel } from "./quality";
import type { Provenance, Relevance, TopicId } from "./types";

/**
 * COBERTURA EDITORIAL (ex.: g1 ao vivo) — NÃO é transcrição.
 *
 *   EditorialUpdate   = FATO DA FONTE: o que o veículo publicou (texto original, horário da fonte, URL, hash).
 *   EditorialAnalysis = INTERPRETAÇÃO versionada: tipo de evento, candidatos, tema, relevância — sempre com confiança
 *                       e evidência; `unknown` quando a fonte não deixa claro. Nunca altera o texto original.
 * Nenhuma atualização editorial é apresentada como fala literal de candidato.
 */
export const EDITORIAL_EVENT_TYPES = ["abertura", "pergunta", "resposta", "replica", "treplica", "ataque", "defesa", "proposta", "critica", "mudanca_tema", "direito_resposta", "intervalo", "encerramento", "consideracao_final", "outro", "unknown"] as const;
export type EditorialEventType = (typeof EDITORIAL_EVENT_TYPES)[number];

export const EDITORIAL_EVENT_LABEL: Record<EditorialEventType, string> = {
  abertura: "Abertura",
  pergunta: "Pergunta",
  resposta: "Resposta",
  replica: "Réplica",
  treplica: "Tréplica",
  ataque: "Ataque",
  defesa: "Defesa",
  proposta: "Proposta",
  critica: "Crítica",
  mudanca_tema: "Mudança de tema",
  direito_resposta: "Direito de resposta",
  intervalo: "Intervalo",
  encerramento: "Encerramento",
  consideracao_final: "Consideração final",
  outro: "Outro",
  unknown: "Não identificado",
};

export interface EditorialUpdate {
  /** `${debateId}:${providerId}:${postId}` — estável entre coletas. */
  id: string;
  debateId: string;
  providerId: string;
  sourceId: string;
  externalId: string;
  url: string | null;
  headline: string | null;
  /** Texto ORIGINAL publicado pela fonte (nunca reescrito). */
  text: string;
  /** Horário informado pela fonte; null = a fonte não informou (nunca estimado). */
  publishedAt: string | null;
  modifiedAt: string | null;
  collectedAt: string;
  contentHash: string;
  parserVersion: string;
  /** Estratégia de extração usada (json-ld, microdata…). */
  strategy: string;
  provenance: Provenance;
  /** Preenchidos na leitura do banco. */
  version?: number;
  removedAt?: string | null;
  ingestedAt?: string | null;
}

export interface EditorialAnalysis {
  eventId: string;
  contentHash: string;
  classifier: string;
  classifierVersion: string;
  methodologyVersion: string;
  eventType: EditorialEventType;
  eventTypeConfidence: ConfidenceLevel;
  eventTypeEvidence: string | null;
  /** Candidato que age (ex.: quem pergunta); null = não resolvido. */
  actorCandidateId: string | null;
  targetCandidateId: string | null;
  mentionedCandidateIds: string[];
  mentionedPartyIds: string[];
  candidateConfidence: ConfidenceLevel;
  topic: TopicId | "unknown";
  subtopic: string | null;
  topicConfidence: ConfidenceLevel;
  topicEvidence: string[];
  /** Sinal explícito de bloco/intervalo publicado pela fonte (ex.: "2º bloco"); null = nenhum. */
  blockSignal: string | null;
  relevance: Relevance;
  relevanceScore: number;
  relevanceCriteria: { namedActor: boolean; namedTarget: boolean; substantiveType: boolean; knownTopic: boolean };
  relevanceVersion: string;
  processedAt?: string;
}

export interface EditorialItem {
  update: EditorialUpdate;
  analysis: EditorialAnalysis | null;
  /** Cursor incremental (muda em inserção, edição e remoção). */
  changeSeq?: number;
}

export interface EditorialSourceStatus {
  id: string;
  debateId: string;
  providerId: string;
  sourceUrl: string | null;
  pollingIntervalMs: number;
  enabled: boolean;
  lastHeartbeatAt: string | null;
  lastCollectedAt: string | null;
  /** Horário da atualização mais recente publicada pela fonte. */
  lastUpdateAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  /** null = não coletado (nunca 0 por ausência). */
  records: number | null;
  rejected: number | null;
  /** Mediana (s) entre publicação na fonte e coleta; null = desconhecida. */
  collectionLatencyS: number | null;
}
