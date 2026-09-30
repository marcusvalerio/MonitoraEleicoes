import type { Candidate, ModelInfo, TranscriptSegment } from "@/domain/types";
import { SPEECH_TYPES, TONES, TOPICS } from "@/domain/types";
import { violatesEditorialPolicy } from "@/domain/guards";
import { hasCausalLanguage } from "@/domain/statements";
import { RELEVANCE_METHOD } from "@/domain/relevance";
import { classifierOutputErrors, type ClassificationContext, type ClassifierOutput, type SpeechClassifier } from "./classifier";

/**
 * CLASSIFICADOR LLM (contrato). Fluxo obrigatório — o modelo NUNCA escreve no banco:
 *
 *   LLM → saída estruturada (JSON) → validação de esquema → validação de domínio → pipeline → Neon
 *
 * O transporte é injetado (`LlmClient`): nenhum SDK de fornecedor no domínio; chaves só no servidor
 * (variáveis de ambiente lidas pela implementação do cliente). Sem cliente configurado, o registry
 * continua usando o classificador por regras (fallback/testes).
 */
export const LLM_PROMPT_VERSION = "llm-structured-v1";

export interface LlmRequest {
  system: string;
  user: string;
  /** JSON Schema da saída esperada (modo de saída estruturada do provedor). */
  schema: Record<string, unknown>;
}
export interface LlmResponse {
  /** Texto bruto devolvido (deve ser JSON). */
  text: string;
  /** Identificador do modelo efetivamente usado, como o provedor informou. */
  model: string;
}
export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class ClassificationRejected extends Error {
  constructor(
    message: string,
    readonly field: string | null,
    readonly raw: string | null,
  ) {
    super(message);
  }
}

export function outputSchema(candidateIds: string[]) {
  const id = { type: ["string", "null"], enum: [...candidateIds, null] };
  return {
    type: "object",
    additionalProperties: false,
    required: ["speaker", "topic", "subtopic", "speech_type", "tone", "target", "mentions", "relevance", "fact_check_required", "confidence"],
    properties: {
      speaker: { type: "string" },
      topic: { type: "string", enum: [...TOPICS] },
      subtopic: { type: ["string", "null"], maxLength: 80 },
      speech_type: { type: "string", enum: [...SPEECH_TYPES] },
      tone: { type: "string", enum: [...TONES] },
      target: id,
      mentions: { type: "array", items: { type: "string", enum: candidateIds } },
      relevance: { type: "string", enum: ["baixa", "media", "alta"] },
      fact_check_required: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  };
}

const SYSTEM = [
  "Você classifica UMA fala de debate eleitoral brasileiro. Responda SOMENTE com JSON no esquema dado.",
  "Descreva o que foi dito; nunca avalie quem está certo, quem venceu, nem faça recomendação de voto.",
  "Não invente fatos, números, horários ou oradores. Não use linguagem causal.",
  "`speaker` deve repetir exatamente o id de orador informado. Menções só a ids de candidatos listados.",
].join("\n");

/**
 * Validação de DOMÍNIO (além do esquema): o modelo não pode trocar o orador, mencionar ids
 * desconhecidos, atribuir alvo a si mesmo, nem produzir juízo político ou linguagem causal.
 */
export function domainErrors(out: ClassifierOutput, seg: TranscriptSegment, candidates: Candidate[]): { field: string; message: string }[] {
  const ids = new Set(candidates.map((c) => c.id));
  const e: { field: string; message: string }[] = [];
  if (out.speaker !== seg.speakerId) e.push({ field: "speaker", message: "modelo alterou o orador (orador vem da fonte, não da IA)" });
  if (out.mentions.some((m) => !ids.has(m))) e.push({ field: "mentions", message: "menção a id desconhecido" });
  if (out.mentions.includes(seg.speakerId)) e.push({ field: "mentions", message: "orador não menciona a si mesmo" });
  if (out.target !== null && (!ids.has(out.target) || out.target === seg.speakerId)) e.push({ field: "target", message: "alvo inválido" });
  if (out.subtopic && (violatesEditorialPolicy(out.subtopic) || hasCausalLanguage(out.subtopic))) e.push({ field: "subtopic", message: "subtema com juízo político ou linguagem causal" });
  return e;
}

export class LlmSpeechClassifier implements SpeechClassifier {
  readonly model: ModelInfo;
  /** Versão da metodologia de relevância aplicada depois (independe do modelo). */
  readonly methodologyVersion = `${RELEVANCE_METHOD.method}@${RELEVANCE_METHOD.version}`;
  constructor(
    private readonly client: LlmClient,
    model: { model: string; version: string },
  ) {
    this.model = { model: model.model, version: model.version, promptVersion: LLM_PROMPT_VERSION };
  }

  async classify(seg: TranscriptSegment, ctx: ClassificationContext): Promise<ClassifierOutput> {
    const cands = ctx.candidates.map((c) => ({ id: c.id, name: c.name }));
    const res = await this.client.complete({
      system: SYSTEM,
      user: JSON.stringify({ speaker_id: seg.speakerId, speaker_label: seg.speakerName ?? null, candidates: cands, text: seg.text }),
      schema: outputSchema(cands.map((c) => c.id)),
    });
    if (res.model !== this.model.model) throw new ClassificationRejected(`modelo respondeu como '${res.model}', esperado '${this.model.model}'`, "model", res.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      throw new ClassificationRejected("saída não é JSON", null, res.text);
    }
    const schemaErrs = classifierOutputErrors(parsed);
    if (schemaErrs.length) throw new ClassificationRejected(`esquema inválido: ${schemaErrs.join(", ")}`, schemaErrs[0], res.text);
    const extra = Object.keys(parsed as object).filter((k) => !(k in outputSchema([]).properties));
    if (extra.length) throw new ClassificationRejected(`campos não previstos: ${extra.join(", ")}`, extra[0], res.text);
    const out = parsed as ClassifierOutput;
    const dom = domainErrors(out, seg, ctx.candidates);
    if (dom.length) throw new ClassificationRejected(dom.map((d) => d.message).join("; "), dom[0].field, res.text);
    return out;
  }
}

/** Primário (ex.: LLM) com fallback determinístico: rejeição do primário cai para o secundário, sem mascarar (modelo registrado é o que respondeu). */
export class FallbackClassifier implements SpeechClassifier {
  constructor(
    private readonly primary: SpeechClassifier,
    private readonly fallback: SpeechClassifier,
    private readonly onFallback: (seg: TranscriptSegment, err: unknown) => void = () => {},
  ) {}
  /** Modelo nominal (dedup); a análise grava `produced_by` quando o fallback respondeu. */
  get model() {
    return this.primary.model;
  }
  async classify(seg: TranscriptSegment, ctx: ClassificationContext): Promise<ClassifierOutput> {
    try {
      return await this.primary.classify(seg, ctx);
    } catch (e) {
      this.onFallback(seg, e);
      return { ...(await this.fallback.classify(seg, ctx)), produced_by: this.fallback.model };
    }
  }
}
