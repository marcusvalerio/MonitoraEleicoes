import type { SpeechClassification, SpeechType, TranscriptSegment } from "@/domain/types";
import { TOPIC_LABEL } from "@/domain/labels";

/**
 * Frases descritivas geradas a partir da classificação. Apenas descrevem o ato de fala
 * (quem, que tipo, sobre qual tema) — nunca avaliam.
 */
const VERB: Record<SpeechType, (topic: string, target: string | null) => string> = {
  proposta: (t) => `apresentou uma proposta sobre ${t}`,
  promessa: (t) => `fez uma promessa sobre ${t}`,
  critica: (t, x) => (x ? `criticou ${x} ao falar de ${t}` : `fez uma crítica sobre ${t}`),
  ataque: (t, x) => (x ? `dirigiu-se a ${x} em tom de confronto sobre ${t}` : `fez uma fala confrontativa sobre ${t}`),
  contraponto: (t, x) => (x ? `contrapôs ${x} sobre ${t}` : `apresentou um contraponto sobre ${t}`),
  resposta: (t) => `mencionou ${t} durante uma resposta`,
  defesa: (t) => `defendeu sua posição sobre ${t}`,
  informacao: (t) => `citou dados sobre ${t}`,
  comparacao: (t, x) => (x ? `comparou sua posição à de ${x} sobre ${t}` : `fez uma comparação sobre ${t}`),
  pergunta: (t, x) => (x ? `perguntou a ${x} sobre ${t}` : `fez uma pergunta sobre ${t}`),
};

export function describeSegment(seg: TranscriptSegment, c: SpeechClassification, name: (id: string) => string): string {
  const topic = c.topic === "outros" ? "o debate" : TOPIC_LABEL[c.topic].toLowerCase();
  const target = c.targetId ?? seg.addressedToId;
  const verb = VERB[c.speechType](topic, target && target !== seg.speakerId ? name(target) : null);
  return `${name(seg.speakerId)} ${verb}.`;
}
