import type { Relevance, SpeechType } from "./types";

/**
 * METODOLOGIA DE RELEVÂNCIA (v1)
 *
 * Relevância mede o potencial informativo de um segmento — NÃO a qualidade,
 * a veracidade ou o mérito político da fala. Critérios objetivos e auditáveis:
 *
 *  - verifiableClaim  (+0.30) a fala contém afirmação factual verificável (números, datas, dados)
 *  - concreteProposal (+0.25) a fala descreve uma medida concreta (proposta/promessa)
 *  - mentionsOther    (+0.15) a fala menciona nominalmente outro participante
 *  - triggersReply    (+0.10) a fala gerou resposta direta no debate
 *  - socialLift       (+0.20 × lift) aumento relativo do volume social nos 3 min seguintes (0–1)
 *
 * Faixas: >= 0.60 alta · >= 0.35 média · < 0.35 baixa.
 * Nenhum critério depende de quem fala ou do conteúdo ideológico.
 */
export interface RelevanceFeatures {
  verifiableClaim: boolean;
  concreteProposal: boolean;
  mentionsOther: boolean;
  triggersReply: boolean;
  /** 0–1, já normalizado. */
  socialLift: number;
}

export const RELEVANCE_WEIGHTS = {
  verifiableClaim: 0.3,
  concreteProposal: 0.25,
  mentionsOther: 0.15,
  triggersReply: 0.1,
  socialLift: 0.2,
} as const;

export const RELEVANCE_THRESHOLDS = { alta: 0.6, media: 0.35 } as const;

export function relevanceScore(f: RelevanceFeatures): number {
  const lift = Math.min(1, Math.max(0, f.socialLift));
  const s =
    (f.verifiableClaim ? RELEVANCE_WEIGHTS.verifiableClaim : 0) +
    (f.concreteProposal ? RELEVANCE_WEIGHTS.concreteProposal : 0) +
    (f.mentionsOther ? RELEVANCE_WEIGHTS.mentionsOther : 0) +
    (f.triggersReply ? RELEVANCE_WEIGHTS.triggersReply : 0) +
    RELEVANCE_WEIGHTS.socialLift * lift;
  return Math.round(s * 100) / 100;
}

export function relevanceBand(score: number): Relevance {
  if (score >= RELEVANCE_THRESHOLDS.alta) return "alta";
  if (score >= RELEVANCE_THRESHOLDS.media) return "media";
  return "baixa";
}

export function isConcreteProposalType(t: SpeechType): boolean {
  return t === "proposta" || t === "promessa";
}

/** Heurística determinística para "afirmação verificável": presença de números, percentuais ou valores. */
export function hasVerifiableClaim(text: string): boolean {
  return /\d/.test(text) || /\b(mil|milhões|bilhões|por cento)\b/i.test(text);
}
