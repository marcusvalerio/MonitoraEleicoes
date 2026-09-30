import type { Candidate, ModelInfo, SpeechType, Tone, TopicId, TranscriptSegment } from "@/domain/types";
import { MODERATOR_SPEAKER_ID, UNKNOWN_SPEAKER_ID } from "@/domain/types";
import { hasVerifiableClaim } from "@/domain/relevance";
import { DEFAULT_TONE, detectMentions, type ClassifierOutput, type SpeechClassifier } from "./classifier";

/**
 * CLASSIFICADOR POR REGRAS v2 (determinístico e auditável).
 *
 * Temas: pontuação ponderada por termos. Termos FORTES (específicos do tema) valem 2;
 * termos FRACOS (ambíguos, ex.: "família", "saúde" em saudação) valem 1. Um tema só é
 * atribuído com pontuação ≥ 2 E pelo menos um termo forte — termos ambíguos (mesmo somados) não definem tema.
 * Confiança deriva da pontuação e da margem sobre o segundo tema.
 *
 * Mudanças v1 → v2 motivadas pela validação RJ (docs/VALIDATION-RJ-2026-09-29.md),
 * sem regras específicas para aquelas falas.
 */
type Lexicon = { strong: RegExp[]; weak: RegExp[] };
const w = (...xs: string[]) => xs.map((x) => new RegExp(`\\b${x}`, "i"));

export const TOPIC_LEXICON: Partial<Record<TopicId, Lexicon>> = {
  seguranca: { strong: w("segurança pública", "crime", "criminos", "polícia", "policia", "policiamento", "bope", "batalh", "milícia", "milicia", "tráfico", "trafico", "homic", "violência", "violencia", "caveirão", "fronteira", "facç"), weak: w("segurança", "drogas", "armas?") },
  saude: { strong: w("sus\\b", "hospita", "cirurgia", "médic", "medic", "leitos?", "atenção básica", "vacina", "câncer", "cancer", "upa\\b", "filas? (?:da|de|na) saúde"), weak: w("saúde", "saude", "atendimento") },
  educacao: { strong: w("escola", "ensino", "alfabetiz", "professor", "alunos?", "ideb", "universidade", "faetec", "creche", "educação", "educacao"), weak: w("estud", "jovens") },
  corrupcao: { strong: w("corrup", "propina", "desvio", "lavagem", "investigaç", "inquérito", "inquerito", "delaç", "escândalo", "escandalo", "podridão", "podre"), weak: w("transparên", "ministério público", "judiciário") },
  economia: { strong: w("inflaç", "infla", "pib\\b", "crescimento econ", "juros", "dívida", "divida", "fiscal", "orçament", "orcament", "investimento", "empresas?", "indústria", "industria", "reindustrializ"), weak: w("econom", "dinheiro", "bolso", "mercado") },
  emprego: { strong: w("emprego", "desemprego", "trabalhador", "qualificação profissional", "carteira assinada", "informalidade", "escala 6 ?x ?1", "salári", "salari"), weak: w("trabalho", "renda") },
  impostos: { strong: w("impost", "tribut", "icms", "isenç", "carga tributária", "incentivos? fiscais"), weak: w("taxa", "contas? de água") },
  previdencia: { strong: w("previdênc", "previdenc", "aposentad", "inss\\b", "rio ?previdência"), weak: w("benefício") },
  infraestrutura: { strong: w("obras?", "saneamento", "esgoto", "cedae", "rodovia", "metrô", "metro\\b", "brt\\b", "vlt\\b", "trens?\\b", "supervia", "transporte", "ferrovi", "porto", "estrada", "pedágio", "pedagio", "duplica", "viário", "viario", "enchente", "concess"), weak: w("mobilidade", "cidade") },
  meio_ambiente: { strong: w("desmat", "ambiental", "lagoa", "poluiç", "despolu", "mudanças? climáticas", "crise climática", "aquecimento global", "energia solar", "preservaç", "sustentável", "sustentavel"), weak: w("verde", "natureza", "clima\\b") },
  tecnologia: { strong: w("tecnolog", "internet", "inteligência artificial", "digital", "conectividade", "inovaç"), weak: w("dados") },
  assistencia_social: { strong: w("transferência de renda", "transferencia de renda", "bolsa família", "bolsa familia", "cadastro social", "cadastro único", "assistência social", "vulnerab", "fome", "miséria", "miseria", "primeira infância"), weak: w("famílias? (?:pobres|carentes|vulneráveis)", "crianças", "idosos", "família", "familia") },
  justica: { strong: w("judiciário", "judiciario", "tribunal", "stf\\b", "pena\\b", "penas\\b", "presídio", "presidio", "sistema prisional"), weak: w("justiça") },
};

export function scoreTopics(text: string): { topic: TopicId; score: number; strong: number }[] {
  const out: { topic: TopicId; score: number; strong: number }[] = [];
  for (const [topic, lex] of Object.entries(TOPIC_LEXICON) as [TopicId, Lexicon][]) {
    let score = 0;
    let strong = 0;
    for (const re of lex.strong) {
      if (re.test(text)) {
        score += 2;
        strong++;
      }
    }
    for (const re of lex.weak) if (re.test(text)) score += 1;
    if (score) out.push({ topic, score, strong });
  }
  return out.sort((a, b) => b.score - a.score);
}

const PROPOSAL = /\b(?:vamos|vou|iremos|irei|propomos|proponho|nossa proposta é|pretendo|prometo)\s+(?:\w+\s+){0,2}?(?:criar|ampliar|investir|construir|implantar|garantir|reduzir|zerar|levar|entregar|duplicar|triplicar|contratar|abrir|acabar|reestatizar|valorizar|fortalecer|instalar|implementar)/i;
const ATTACK_TERMS = /\b(?:mentir|mentira|enganar|enganaram|podre|podridão|criminos|corrupt|malandr|fraude|mente\b)/i;
const DEFENSE = /\b(?:eu não (?:fujo|fiz|disse|sou)|não é verdade|isso é mentira|fui inocentad|fui eu que fiz|eu já fiz|eu apresentei|eu respondi|eu defendi|nunca fui)/i;
const COMPARISON = /\b(?:ao contrário d[eoa]|diferente d[eoa]|enquanto (?:ele|ela|o candidato|a candidata))/i;

export const RULES_MODEL: ModelInfo = { model: "rule-based-classifier", version: "0.2.2", promptVersion: "keywords-v2" };

export class RuleBasedSpeechClassifier implements SpeechClassifier {
  readonly model: ModelInfo = RULES_MODEL;
  constructor(private readonly candidates: () => Candidate[]) {}

  async classify(seg: TranscriptSegment): Promise<ClassifierOutput> {
    const t = seg.text;
    const isModerator = seg.speakerId === MODERATOR_SPEAKER_ID;
    const scores = isModerator ? [] : scoreTopics(t);
    const top = scores[0];
    const second = scores[1]?.score ?? 0;
    const topic: TopicId = top && top.score >= 2 && top.strong > 0 ? top.topic : "outros";
    const mentions = detectMentions(t, this.candidates(), seg.speakerId);

    let type: SpeechType;
    if (isModerator) type = "informacao";
    else if (/\?\s*$/.test(t.trim()) || (/\?/.test(t) && t.length < 240)) type = "pergunta";
    else if (DEFENSE.test(t)) type = "defesa";
    else if (mentions.length && ATTACK_TERMS.test(t)) type = "ataque";
    else if (mentions.length && COMPARISON.test(t)) type = "comparacao";
    else if (mentions.length && /\bn[ãa]o\b/i.test(t)) type = "critica";
    else if (PROPOSAL.test(t)) type = "proposta";
    else if (seg.addressedToId) type = "resposta";
    else if (hasVerifiableClaim(t)) type = "informacao";
    else type = "resposta";

    const tone: Tone = isModerator ? "neutro" : DEFAULT_TONE[type];
    const verifiable = !isModerator && seg.speakerId !== UNKNOWN_SPEAKER_ID && hasVerifiableClaim(t);
    // confiança: força do tema + margem; sem tema = baixa
    const confidence = topic === "outros" ? 0.35 : Math.min(0.88, 0.4 + 0.05 * top.score + 0.04 * Math.max(0, top.score - second));
    return {
      speaker: seg.speakerId,
      topic,
      subtopic: null,
      speech_type: type,
      tone,
      target: type === "pergunta" || type === "critica" || type === "ataque" || type === "comparacao" ? (seg.addressedToId ?? mentions[0] ?? null) : null,
      mentions,
      relevance: "baixa",
      fact_check_required: verifiable,
      confidence: Math.round(confidence * 100) / 100,
    };
  }
}
