import type { Candidate, DebateEvent, SocialMetric, SpeechClassification, TopicId, TranscriptSegment } from "@/domain/types";
import { TOPIC_LABEL } from "@/domain/labels";

/**
 * EVENT ENGINE — deriva acontecimentos a partir de dados já existentes.
 * Descreve o que aconteceu; nunca qualifica positivamente/negativamente.
 */
export interface EventEngineInput {
  debateId: string;
  segments: TranscriptSegment[];
  classifications: SpeechClassification[];
  metrics: SocialMetric[];
  candidates: Candidate[];
  mode: "demo" | "live";
}

export function volumeByBucket(metrics: SocialMetric[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const x of metrics) m.set(x.bucketStart, (m.get(x.bucketStart) ?? 0) + x.posts);
  return m;
}

function sumRange(vol: Map<number, number>, from: number, to: number) {
  let s = 0;
  for (const [k, v] of vol) if (k >= from && k < to) s += v;
  return s;
}

export function detectEvents(input: EventEngineInput): DebateEvent[] {
  const { segments, classifications, metrics, candidates, debateId, mode } = input;
  const cls = new Map(classifications.map((c) => [c.segmentId, c]));
  const name = (id: string) => candidates.find((c) => c.id === id)?.name ?? id;
  const vol = volumeByBucket(metrics);
  const prov = { nature: "analysis" as const, sourceId: "src-demo-ai", mode };
  const events: Omit<DebateEvent, "id" | "code">[] = [];
  const dataEnd = metrics.reduce((m, x) => Math.max(m, x.bucketStart + x.bucketSize), 0);
  // Só calcula variação quando a janela posterior está completa (evita números enganosos ao vivo).
  const socialMetrics = (at: number) => {
    if (at + 300 > dataEnd) return [];
    const before = sumRange(vol, at - 300, at);
    const after = sumRange(vol, at, at + 300);
    return [
      { label: "Publicações 5 min antes", value: before },
      { label: "Publicações 5 min depois", value: after },
      { label: "Variação", value: before ? Math.round(((after - before) / before) * 100) : 0, unit: "%" },
    ];
  };

  // 1 · Cadeias pergunta → resposta (com menção quando houver)
  for (let i = 0; i < segments.length; i++) {
    const q = segments[i];
    const c = cls.get(q.id);
    if (!c || c.speechType !== "pergunta" || !q.addressedToId) continue;
    const chain = [q];
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[j];
      if (s.speakerId !== q.speakerId && s.speakerId !== q.addressedToId) break;
      chain.push(s);
    }
    const hasMention = chain.slice(1).some((s) => (cls.get(s.id)?.mentions.length ?? 0) > 0);
    const responded = chain.some((s) => s.speakerId === q.addressedToId);
    events.push({
      debateId,
      kind: hasMention ? "mention" : "reply_chain",
      startOffset: q.startOffset,
      title: `${name(q.speakerId)} ${hasMention ? "menciona" : "pergunta a"} ${name(q.addressedToId)}`,
      description: responded
        ? `${name(q.speakerId)} dirige pergunta sobre ${TOPIC_LABEL[c.topic].toLowerCase()} a ${name(q.addressedToId)}, que responde. Sequência com ${chain.length} falas.`
        : `${name(q.speakerId)} dirige pergunta sobre ${TOPIC_LABEL[c.topic].toLowerCase()} a ${name(q.addressedToId)}.`,
      segmentIds: chain.map((s) => s.id),
      candidateIds: [q.speakerId, q.addressedToId],
      topic: c.topic,
      subtopic: c.subtopic,
      socialPostIds: [],
      metrics: socialMetrics(chain[chain.length - 1].endOffset),
      sourceIds: ["src-demo-transcript", "src-demo-ai"],
      provenance: prov,
    });
  }

  // 2 · Tema entra no debate pela primeira vez
  const seen = new Set<TopicId>();
  for (const s of segments) {
    const c = cls.get(s.id);
    if (!c || c.topic === "outros" || seen.has(c.topic)) continue;
    seen.add(c.topic);
    events.push({
      debateId,
      kind: "topic_shift",
      startOffset: s.startOffset,
      title: `${TOPIC_LABEL[c.topic]} entra no debate`,
      description: `Primeira fala classificada com o tema ${TOPIC_LABEL[c.topic].toLowerCase()}.`,
      segmentIds: [s.id],
      candidateIds: [s.speakerId],
      topic: c.topic,
      subtopic: c.subtopic,
      socialPostIds: [],
      metrics: [],
      sourceIds: ["src-demo-ai"],
      provenance: prov,
    });
  }

  // 3 · Picos de volume social (> média + 1,5σ), agrupados
  const entries = [...vol.entries()].sort((a, b) => a[0] - b[0]);
  const values = entries.map((e) => e[1]);
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length));
  const threshold = mean + 1.5 * sd;
  let lastSpike = -Infinity;
  for (const [start, v] of entries) {
    if (v < threshold || start - lastSpike < 300) continue;
    lastSpike = start;
    const prev = [...segments].reverse().find((s) => s.endOffset <= start && s.endOffset > start - 300);
    const c = prev ? cls.get(prev.id) : undefined;
    events.push({
      debateId,
      kind: "social_spike",
      startOffset: start,
      title: `Volume de publicações acima do padrão`,
      description: prev
        ? `${v.toLocaleString("pt-BR")} publicações no minuto, após fala de ${name(prev.speakerId)} sobre ${TOPIC_LABEL[c?.topic ?? "outros"].toLowerCase()}. Proximidade temporal não indica causalidade.`
        : `${v.toLocaleString("pt-BR")} publicações no minuto.`,
      segmentIds: prev ? [prev.id] : [],
      candidateIds: prev ? [prev.speakerId] : [],
      topic: c?.topic ?? "outros",
      subtopic: c?.subtopic ?? null,
      socialPostIds: [],
      metrics: [{ label: "Publicações no minuto", value: v }, { label: "Média do debate", value: Math.round(mean) }],
      sourceIds: ["src-demo-social"],
      provenance: prov,
    });
  }

  // 4 · Falas de alta relevância com checagem sugerida
  for (const s of segments) {
    const c = cls.get(s.id);
    if (!c || c.relevance !== "alta" || !["verificar", "contexto_necessario"].includes(c.factCheck)) continue;
    events.push({
      debateId,
      kind: "fact_check_flag",
      startOffset: s.startOffset,
      title: `Afirmação com dado numérico de ${name(s.speakerId)}`,
      description: `Fala contém afirmação verificável sobre ${TOPIC_LABEL[c.topic].toLowerCase()}. Status: sugerida verificação — não é um veredito.`,
      segmentIds: [s.id],
      candidateIds: [s.speakerId],
      topic: c.topic,
      subtopic: c.subtopic,
      socialPostIds: [],
      metrics: [],
      sourceIds: ["src-demo-ai"],
      provenance: prov,
    });
  }

  return events
    .sort((a, b) => a.startOffset - b.startOffset)
    .map((e, i) => ({ ...e, id: `${debateId}-evt-${i + 1}`, code: `#${String(i + 1).padStart(3, "0")}` }));
}
