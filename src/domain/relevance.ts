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
/** Identificação da metodologia de relevância (persistida junto a cada análise). */
export const RELEVANCE_METHOD = { method: "criteria-sum", version: "2" } as const;

/**
 * "Afirmação verificável" (metodologia v2): quantidade com unidade ou escala que
 * pode ser checada contra dados. NÃO contam: números de urna ("vote 22", "é 50",
 * "crava 10"), anos isolados (2018), datas ("dia 4", "domingo, 4"), ordinais e
 * números pequenos sem unidade.
 */
const UNIT = String.raw`(?:%|por\s*cento|pontos?\s+percentuais|mil\b|milh(?:ão|ões)|bilh(?:ão|ões)|reais|r\$|anos?\b|meses|dias\b|horas|km|quil[oô]metros|escolas|hospitais|leitos|vagas|empregos|pessoas|fam[ií]lias|munic[ií]pios|obras|policiais|professores|crian[çc]as|alunos|mortes|homic[ií]dios|casos|toneladas|litros|vezes)`;
const NUMBER = String.raw`\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?`;
const QUANTITY = new RegExp(String.raw`(?:r\$\s*(?:${NUMBER}))|(?:(?:${NUMBER})\s*${UNIT})`, "i");
const BALLOT = /\b(?:vot[eoa]r?|n[úu]mero|crava|digit[ea]|apert[ea]|[ée])\s+(?:o\s+|no\s+)?\d{1,5}\b/gi;
const YEAR = /\b(?:19|20)\d{2}\b/g;
const DATE = /\b(?:dia|domingo|segunda|terça|quarta|quinta|sexta|sábado)[,\s]+\d{1,2}\b/gi;

export function hasVerifiableClaim(text: string): boolean {
  const cleaned = text.replace(BALLOT, " ").replace(DATE, " ").replace(YEAR, " ");
  if (QUANTITY.test(cleaned)) return true;
  // número "grande" sem unidade explícita ainda pode ser dado (ex.: "8 mil obras" já coberto; "40 mil" coberto)
  return /\b\d{3,}(?:[.,]\d+)?\b/.test(cleaned);
}
