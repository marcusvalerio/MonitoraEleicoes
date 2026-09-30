import type { FactCheckStatus, Relevance, SpeechClassification, Tone } from "@/domain/types";
import { FACT_CHECK_LABEL, RELEVANCE_LABEL, SPEECH_TYPE_LABEL, TONE_LABEL, TOPIC_LABEL } from "@/domain/labels";
import { Tag } from "@/components/ui/primitives";

type TagTone = "neutral" | "pos" | "neg" | "warn" | "info" | "strong";

export const TONE_TAG: Record<Tone, TagTone> = {
  propositivo: "pos",
  critico: "neg",
  confrontativo: "neg",
  defensivo: "warn",
  neutro: "neutral",
  informativo: "info",
};

/** "Verificado" = checagem concluída, NÃO significa "verdadeiro". Por isso é neutro. */
export const FACT_TAG: Record<FactCheckStatus, TagTone> = {
  nao_necessario: "neutral",
  verificar: "warn",
  em_verificacao: "info",
  verificado: "strong",
  contexto_necessario: "warn",
};

export const RELEVANCE_TAG: Record<Relevance, TagTone> = { baixa: "neutral", media: "neutral", alta: "strong" };

export function ClassificationTags({ c, compact }: { c: SpeechClassification; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {c.topic !== "outros" && <Tag tone="strong">{TOPIC_LABEL[c.topic]}</Tag>}
      {c.subtopic && !compact && <Tag>{c.subtopic}</Tag>}
      <Tag>{SPEECH_TYPE_LABEL[c.speechType]}</Tag>
      {!compact && (
        <Tag tone={TONE_TAG[c.tone]} dot>
          {TONE_LABEL[c.tone]}
        </Tag>
      )}
      {c.factCheck !== "nao_necessario" && <Tag tone={FACT_TAG[c.factCheck]}>{FACT_CHECK_LABEL[c.factCheck]}</Tag>}
      {c.relevance === "alta" && <Tag tone="strong">Relevância {RELEVANCE_LABEL[c.relevance].toLowerCase()}</Tag>}
    </div>
  );
}
