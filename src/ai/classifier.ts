import type {
  Candidate,
  FactCheckStatus,
  ModelInfo,
  SpeechClassification,
  SpeechType,
  Tone,
  TopicId,
  TranscriptSegment,
} from "@/domain/types";
import { FACT_CHECK, SPEECH_TYPES, TONES, TOPICS } from "@/domain/types";
import { confidenceLevel } from "@/domain/quality";
import { RELEVANCE_METHOD, hasVerifiableClaim, isConcreteProposalType, relevanceBand, relevanceScore } from "@/domain/relevance";

/**
 * Pipeline de classificação. Em produção, `SpeechClassifier` chama um LLM no servidor
 * e valida a saída contra `ClassifierOutput`. O texto RAW nunca é alterado.
 */
export interface ClassifierOutput {
  speaker: string;
  topic: TopicId;
  subtopic: string | null;
  speech_type: SpeechType;
  tone: Tone;
  target: string | null;
  mentions: string[];
  relevance: "baixa" | "media" | "alta";
  fact_check_required: boolean;
  /** Status de checagem quando fornecido por um FactCheckProvider acoplado. */
  fact_check_status?: import("@/domain/types").FactCheckStatus;
  confidence: number;
  /** Modelo que efetivamente produziu a saída (ex.: fallback). Ausente = o do classificador. */
  produced_by?: ModelInfo;
}

export interface ClassificationContext {
  candidates: Candidate[];
  triggersReply: boolean;
  socialLift: number;
}

export interface SpeechClassifier {
  readonly model: ModelInfo;
  classify(segment: TranscriptSegment, ctx: ClassificationContext): Promise<ClassifierOutput>;
}

/** Tom padrão associado a cada tipo de fala (usado como prior pelo classificador mock). */
export const DEFAULT_TONE: Record<SpeechType, Tone> = {
  proposta: "propositivo",
  promessa: "propositivo",
  critica: "critico",
  ataque: "confrontativo",
  contraponto: "critico",
  resposta: "informativo",
  defesa: "defensivo",
  informacao: "informativo",
  comparacao: "critico",
  pergunta: "neutro",
};

/** Detecta menções nominais (nome completo ou sobrenome) a candidatos. */
export function detectMentions(text: string, candidates: Candidate[], exclude?: string): string[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = norm(text);
  return candidates
    .filter((c) => c.id !== exclude)
    .filter((c) => {
      const surname = c.name.split(" ").slice(-1)[0];
      return t.includes(norm(c.name)) || new RegExp(`\\b${norm(surname)}\\b`).test(t);
    })
    .map((c) => c.id);
}

/** Validação estrutural da saída de IA — nunca confiar cegamente no modelo (enums fechados, faixas, tipos). */
export function validateClassifierOutput(o: unknown): o is ClassifierOutput {
  return classifierOutputErrors(o).length === 0;
}

export function classifierOutputErrors(o: unknown): string[] {
  if (!o || typeof o !== "object" || Array.isArray(o)) return ["saída não é um objeto"];
  const x = o as Record<string, unknown>;
  const e: string[] = [];
  const isStr = (v: unknown) => typeof v === "string";
  if (!isStr(x.speaker)) e.push("speaker");
  if (!isStr(x.topic) || !(TOPICS as readonly string[]).includes(x.topic as string)) e.push("topic");
  if (x.subtopic !== null && !(isStr(x.subtopic) && (x.subtopic as string).length <= 80)) e.push("subtopic");
  if (!isStr(x.speech_type) || !(SPEECH_TYPES as readonly string[]).includes(x.speech_type as string)) e.push("speech_type");
  if (!isStr(x.tone) || !(TONES as readonly string[]).includes(x.tone as string)) e.push("tone");
  if (x.target !== null && !isStr(x.target)) e.push("target");
  if (!Array.isArray(x.mentions) || !x.mentions.every(isStr)) e.push("mentions");
  if (!["baixa", "media", "alta"].includes(x.relevance as string)) e.push("relevance");
  if (typeof x.fact_check_required !== "boolean") e.push("fact_check_required");
  if (x.fact_check_status !== undefined && !(FACT_CHECK as readonly string[]).includes(x.fact_check_status as string)) e.push("fact_check_status");
  if (typeof x.confidence !== "number" || !Number.isFinite(x.confidence) || x.confidence < 0 || x.confidence > 1) e.push("confidence");
  return e;
}

/** Converte a saída validada do modelo em entidade de domínio (AI ANALYSIS separada do RAW). */
export function toSpeechClassification(
  seg: TranscriptSegment,
  out: ClassifierOutput,
  model: ModelInfo,
  opts: { classifiedAt: string; factCheck?: FactCheckStatus; relevanceScore: number; relevanceFeatures: SpeechClassification["relevanceFeatures"]; sourceId: string },
): SpeechClassification {
  return {
    segmentId: seg.id,
    topic: out.topic,
    subtopic: out.subtopic,
    speechType: out.speech_type,
    tone: out.tone,
    targetId: out.target,
    mentions: out.mentions,
    relevance: out.relevance,
    relevanceScore: opts.relevanceScore,
    relevanceFeatures: opts.relevanceFeatures,
    relevanceMethod: { ...RELEVANCE_METHOD },
    factCheck: opts.factCheck ?? (out.fact_check_required ? "verificar" : "nao_necessario"),
    confidence: out.confidence,
    confidenceLevel: confidenceLevel(out.confidence),
    model,
    classifiedAt: opts.classifiedAt,
    humanReviewed: false,
    provenance: { nature: "ai", sourceId: opts.sourceId, mode: seg.provenance.mode },
  };
}

/** Calcula relevância a partir de critérios objetivos (ver domain/relevance.ts). */
export function computeSegmentRelevance(
  seg: TranscriptSegment,
  type: SpeechType,
  mentions: string[],
  ctx: Pick<ClassificationContext, "triggersReply" | "socialLift">,
) {
  const features = {
    verifiableClaim: hasVerifiableClaim(seg.text),
    concreteProposal: isConcreteProposalType(type),
    mentionsOther: mentions.length > 0,
    triggersReply: ctx.triggersReply,
    socialLift: Math.round(Math.min(1, Math.max(0, ctx.socialLift)) * 100) / 100,
  };
  const score = relevanceScore(features);
  return { score, band: relevanceBand(score), features };
}
