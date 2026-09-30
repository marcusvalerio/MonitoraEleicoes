import type { Candidate, ModelInfo, SpeechType, Tone, TopicId, TranscriptSegment } from "@/domain/types";
import { MODERATOR_SPEAKER_ID } from "@/domain/types";
import { hasVerifiableClaim } from "@/domain/relevance";
import { DEFAULT_TONE, detectMentions, type ClassifierOutput, type SpeechClassifier } from "./classifier";

/**
 * Classificadores plugáveis. Em produção: LLM no servidor com saída estruturada validada.
 * Relevância NÃO vem do modelo — é calculada pela metodologia na ingestão.
 */

const KEYWORDS: [TopicId, RegExp][] = [
  ["corrupcao", /corrup|transpar|emenda|investiga|contrato/i],
  ["seguranca", /seguran|crime|polícia|policia|fronteira|viol/i],
  ["saude", /saúde|saude|sus\b|cirurgia|fila|médic/i],
  ["educacao", /educa|escola|ensino|alfabet|aluno/i],
  ["previdencia", /previd|aposentad|inss|benefício/i],
  ["impostos", /impost|tribut|isenção|isencao|carga/i],
  ["emprego", /emprego|trabalh|informal|qualifica/i],
  ["meio_ambiente", /ambient|desmat|energ|clima/i],
  ["infraestrutura", /obra|saneamento|rodovi|infraestrut/i],
  ["tecnologia", /tecnolog|internet|intelig[êe]ncia artificial|\bia\b|digital|conex/i],
  ["assistencia_social", /transfer[êe]ncia de renda|famíli|familia|cadastro social|crian/i],
  ["economia", /econom|infla|crescimento|fiscal|crédito|credito|juros/i],
];

/** ALTERNATIVO: classificador por regras (palavras-chave), determinístico e auditável. */
export class RuleBasedSpeechClassifier implements SpeechClassifier {
  readonly model: ModelInfo = { model: "rule-based-classifier", version: "0.1.0", promptVersion: "keywords-v1" };
  constructor(private readonly candidates: () => Candidate[]) {}
  async classify(seg: TranscriptSegment): Promise<ClassifierOutput> {
    const t = seg.text;
    const hits = KEYWORDS.filter(([, re]) => re.test(t));
    const topic: TopicId = seg.speakerId === MODERATOR_SPEAKER_ID || !hits.length ? "outros" : hits[0][0];
    const mentions = detectMentions(t, this.candidates(), seg.speakerId);
    let type: SpeechType = "resposta";
    if (seg.speakerId === MODERATOR_SPEAKER_ID) type = "informacao";
    else if (t.trim().endsWith("?")) type = "pergunta";
    else if (/\b(vamos|propomos|nossa proposta)\b/i.test(t)) type = "proposta";
    else if (mentions.length && /\bn[ãa]o\b/i.test(t)) type = "critica";
    else if (/\beu (respondi|apresentei|defendi)\b/i.test(t)) type = "defesa";
    const tone: Tone = seg.speakerId === MODERATOR_SPEAKER_ID ? "neutro" : DEFAULT_TONE[type];
    const verifiable = seg.speakerId !== MODERATOR_SPEAKER_ID && hasVerifiableClaim(t);
    return {
      speaker: seg.speakerId,
      topic,
      subtopic: null,
      speech_type: type,
      tone,
      target: type === "pergunta" || type === "critica" ? seg.addressedToId : null,
      mentions,
      relevance: "baixa",
      fact_check_required: verifiable,
      confidence: hits.length === 1 ? 0.8 : hits.length > 1 ? 0.6 : 0.4,
    };
  }
}
