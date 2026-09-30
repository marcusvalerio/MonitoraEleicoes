import type {
  DebateBlock,
  FactCheckStatus,
  SocialMetric,
  SocialPlatformId,
  SocialPost,
  SpeechClassification,
  SpeechType,
  Tone,
  TopicId,
  TranscriptSegment,
} from "@/domain/types";
import { TOPIC_LABEL } from "@/domain/labels";
import { DEFAULT_TONE, computeSegmentRelevance, detectMentions, toSpeechClassification } from "@/ai/classifier";
import { hasVerifiableClaim } from "@/domain/relevance";
import { createRng } from "./rng";
import { DEMO_BLOCK_DEFS, DEMO_CANDIDATES, DEMO_DEBATE, MODERATOR_ID } from "./entities";
import { CLOSING_LINES, MODERATOR_LINES, OPENING_LINES, TEXT_BANK } from "./text-bank";

const PROV = (nature: "collected" | "ai") => ({
  nature,
  sourceId: nature === "ai" ? "src-demo-ai" : "src-demo-transcript",
  mode: "demo" as const,
});

export const DEMO_MODEL = { model: "demo-classifier", version: "0.1.0", promptVersion: "speech-v1" };

type Role = "moderator" | "opening" | "question" | "answer" | "rebuttal" | "rejoinder" | "closing";

interface ScriptLine {
  speakerId: string;
  text: string;
  blockId: string;
  role: Role;
  addressedToId: string | null;
  topic: TopicId;
  subtopic: string | null;
  type: SpeechType;
  tone: Tone;
  duration: number;
}

const C = DEMO_CANDIDATES;
const idx = (l: string) => C["ABCD".indexOf(l)];

// Agenda do debate: [perguntador, respondente, tema]
const AGENDA: Record<"b1" | "b2" | "b3", [string, string, TopicId][]> = {
  b1: [["A", "B", "economia"], ["B", "C", "seguranca"], ["C", "D", "saude"], ["D", "A", "corrupcao"], ["A", "C", "economia"], ["B", "D", "emprego"]],
  b2: [["C", "A", "educacao"], ["D", "B", "infraestrutura"], ["A", "D", "meio_ambiente"], ["B", "A", "impostos"], ["C", "B", "previdencia"], ["D", "C", "tecnologia"], ["A", "B", "assistencia_social"], ["B", "C", "seguranca"]],
  b3: [["D", "A", "economia"], ["C", "B", "corrupcao"], ["A", "C", "saude"], ["B", "D", "impostos"], ["A", "D", "emprego"], ["C", "A", "educacao"], ["D", "B", "seguranca"], ["B", "C", "economia"]],
};

function buildScript(): ScriptLine[] {
  const rng = createRng(2026);
  const lines: ScriptLine[] = [];
  const mod = (blockId: keyof typeof MODERATOR_LINES) =>
    lines.push({ speakerId: MODERATOR_ID, text: MODERATOR_LINES[blockId], blockId, role: "moderator", addressedToId: null, topic: "outros", subtopic: null, type: "informacao", tone: "neutro", duration: rng.int(18, 30) });

  mod("b0");
  C.forEach((c, i) =>
    lines.push({ speakerId: c.id, text: OPENING_LINES[i], blockId: "b0", role: "opening", addressedToId: null, topic: "outros", subtopic: "Apresentação", type: "informacao", tone: "informativo", duration: rng.int(80, 90) }),
  );

  for (const blockId of ["b1", "b2", "b3"] as const) {
    mod(blockId);
    for (const [q, a, topic] of AGENDA[blockId]) {
      const asker = idx(q);
      const target = idx(a);
      const bank = TEXT_BANK[topic]!;
      const sub = rng.pick(bank.subtopics);
      const fill = (s: string, who: string) => s.replaceAll("{alvo}", who);

      lines.push({ speakerId: asker.id, text: fill(bank.question, target.name), blockId, role: "question", addressedToId: target.id, topic, subtopic: sub, type: "pergunta", tone: topic === "corrupcao" ? "critico" : "neutro", duration: rng.int(35, 55) });

      const withInfo = rng.chance(0.35);
      const prop = rng.chance(0.5) ? bank.proposal : bank.proposal2;
      const answerType: SpeechType = withInfo ? "resposta" : rng.chance(0.3) ? "promessa" : "proposta";
      lines.push({ speakerId: target.id, text: withInfo ? `${bank.info} ${prop}` : prop, blockId, role: "answer", addressedToId: asker.id, topic, subtopic: sub, type: answerType, tone: withInfo ? "informativo" : "propositivo", duration: rng.int(80, 110) });

      const r = rng.next();
      const rebType: SpeechType = r < 0.45 ? "critica" : r < 0.65 ? "ataque" : r < 0.85 ? "contraponto" : "comparacao";
      lines.push({ speakerId: asker.id, text: fill(bank.critique, target.name), blockId, role: "rebuttal", addressedToId: target.id, topic, subtopic: sub, type: rebType, tone: DEFAULT_TONE[rebType], duration: rng.int(45, 65) });

      const mentionBack = rng.chance(0.4);
      const defText = mentionBack ? `${asker.name.split(" ")[0]} ${asker.name.split(" ").slice(-1)[0]}, ${bank.defense.charAt(0).toLowerCase()}${bank.defense.slice(1)}` : bank.defense;
      const rejType: SpeechType = rng.chance(0.75) ? "defesa" : "resposta";
      lines.push({ speakerId: target.id, text: defText, blockId, role: "rejoinder", addressedToId: asker.id, topic, subtopic: sub, type: rejType, tone: rejType === "defesa" ? "defensivo" : "informativo", duration: rng.int(45, 65) });
    }
  }

  mod("b4");
  C.forEach((c, i) =>
    lines.push({ speakerId: c.id, text: CLOSING_LINES[(i + 1) % 4], blockId: "b4", role: "closing", addressedToId: null, topic: "outros", subtopic: "Considerações finais", type: "promessa", tone: "propositivo", duration: rng.int(80, 90) }),
  );
  return lines;
}

const PLATFORM_BASE: Partial<Record<SocialPlatformId, number>> = {
  x: 140,
  youtube: 70,
  tiktok: 45,
  instagram: 35,
  facebook: 18,
  threads: 12,
  // telegram: sem acesso no MVP (provider indisponível)
};

export interface DemoDataset {
  blocks: DebateBlock[];
  segments: TranscriptSegment[];
  classifications: SpeechClassification[];
  metrics: SocialMetric[];
  posts: SocialPost[];
}

function build(): DemoDataset {
  const rng = createRng(1001);
  const script = buildScript();

  // 1 · Segmentos RAW com offsets
  let t = 0;
  const segments: TranscriptSegment[] = script.map((l, i) => {
    t += i === 0 ? 0 : rng.int(2, 5);
    const seg: TranscriptSegment = {
      id: `seg-${String(i + 1).padStart(3, "0")}`,
      debateId: DEMO_DEBATE.id,
      seq: i + 1,
      speakerId: l.speakerId,
      startOffset: t,
      endOffset: t + l.duration,
      text: l.text,
      blockId: l.blockId,
      addressedToId: l.addressedToId,
      provenance: PROV("collected"),
    };
    t += l.duration;
    return seg;
  });

  const blocks: DebateBlock[] = DEMO_BLOCK_DEFS.map((b) => {
    const s = segments.filter((x) => x.blockId === b.id);
    return { ...b, startOffset: s[0].startOffset, endOffset: s[s.length - 1].endOffset };
  });

  // 2 · Repercussão social (mock) — impulso após menções e afirmações verificáveis
  const bucket = 60;
  const end = segments[segments.length - 1].endOffset;
  const nBuckets = Math.ceil((end + 600) / bucket);
  const impulse = new Array(nBuckets).fill(0);
  const candWeight: Record<string, number>[] = Array.from({ length: nBuckets }, () => Object.fromEntries(C.map((c) => [c.id, 1])));
  const topicAt: TopicId[] = new Array(nBuckets).fill("outros");

  script.forEach((l, i) => {
    const seg = segments[i];
    const b0 = Math.floor(seg.startOffset / bucket);
    for (let k = b0; k < Math.min(nBuckets, b0 + 4); k++) topicAt[k] = l.topic;
    const mentions = detectMentions(seg.text, C, seg.speakerId);
    let mag = 0;
    if (mentions.length) mag += 0.6;
    if (l.type === "ataque") mag += 0.5;
    if (hasVerifiableClaim(seg.text)) mag += 0.3;
    mag *= 0.5 + rng.next();
    const start = Math.floor(seg.endOffset / bucket) + 1;
    for (let k = 0; k < 6 && start + k < nBuckets; k++) {
      impulse[start + k] += mag * Math.exp(-k / 1.8);
      if (l.speakerId !== MODERATOR_ID) candWeight[start + k][l.speakerId] += 2 * mag;
      for (const m of mentions) candWeight[start + k][m] += 1.5 * mag;
    }
  });

  const metrics: SocialMetric[] = [];
  for (const [platform, base] of Object.entries(PLATFORM_BASE) as [SocialPlatformId, number][]) {
    for (let k = 0; k < nBuckets; k++) {
      const ramp = Math.min(1, 0.35 + k / 20);
      const noise = 0.85 + rng.next() * 0.3;
      const posts = Math.round(base * ramp * noise * (1 + impulse[k]));
      const w = candWeight[k];
      const wSum = Object.values(w).reduce((a, b) => a + b, 0);
      const mentionShare = 0.55;
      const mentionsByCandidate = Object.fromEntries(C.map((c) => [c.id, Math.round((posts * mentionShare * w[c.id]) / wSum)]));
      const topic = topicAt[k];
      metrics.push({
        platform,
        bucketStart: k * bucket,
        bucketSize: bucket,
        posts,
        mentionsByCandidate,
        byTopic: { [topic]: Math.round(posts * 0.6), outros: Math.round(posts * 0.4) },
        provenance: { nature: "collected", sourceId: `src-demo-social-${platform}`, mode: "demo" },
      });
    }
  }

  // 3 · Classificação (AI ANALYSIS) com relevância baseada em critérios objetivos
  const volumeAt = (from: number, to: number) => {
    const inRange = metrics.filter((m) => m.bucketStart >= from && m.bucketStart < to);
    return inRange.reduce((a, m) => a + m.posts, 0) / Math.max(1, (to - from) / bucket);
  };

  const classifications: SpeechClassification[] = script.map((l, i) => {
    const seg = segments[i];
    const mentions = detectMentions(seg.text, C, seg.speakerId);
    const before = volumeAt(seg.startOffset - 180, seg.startOffset);
    const after = volumeAt(seg.endOffset, seg.endOffset + 180);
    const socialLift = before > 0 ? Math.max(0, Math.min(1, after / before - 1)) : 0;
    const next = script[i + 1];
    const triggersReply = !!next && next.speakerId === l.addressedToId && next.speakerId !== MODERATOR_ID;
    const rel = computeSegmentRelevance(seg, l.type, mentions, { triggersReply, socialLift });
    const verifiable = hasVerifiableClaim(seg.text) && l.speakerId !== MODERATOR_ID;
    let factCheck: FactCheckStatus = "nao_necessario";
    if (verifiable) {
      const r = rng.next();
      factCheck = seg.startOffset > end * 0.85 ? "verificar" : r < 0.35 ? "verificado" : r < 0.6 ? "em_verificacao" : r < 0.8 ? "contexto_necessario" : "verificar";
    }
    const target = l.role === "question" || l.role === "rebuttal" ? l.addressedToId : null;
    return toSpeechClassification(
      seg,
      {
        speaker: l.speakerId,
        topic: l.topic,
        subtopic: l.subtopic,
        speech_type: l.type,
        tone: l.tone,
        target,
        mentions,
        relevance: rel.band,
        fact_check_required: verifiable,
        confidence: Math.round((l.speakerId === MODERATOR_ID ? 0.95 + rng.next() * 0.04 : 0.62 + rng.next() * 0.35) * 100) / 100,
      },
      DEMO_MODEL,
      {
        classifiedAt: new Date(Date.parse(DEMO_DEBATE.startsAt) + (seg.endOffset + rng.int(2, 9)) * 1000).toISOString(),
        factCheck,
        relevanceScore: rel.score,
        relevanceFeatures: rel.features,
        sourceId: "src-demo-ai",
      },
    );
  });

  // 4 · Amostra de posts (textos genéricos fictícios)
  const templates = [
    (n: string, tp: string) => `Debate agora: ${n} falando sobre ${tp}.`,
    (n: string, tp: string) => `Alguém já conferiu o número que ${n} citou sobre ${tp}?`,
    (_n: string, tp: string) => `Tema da vez no debate: ${tp}.`,
    (n: string) => `Resposta de ${n} gerando bastante discussão aqui.`,
    (_n: string, tp: string) => `Quero ver mais detalhes sobre ${tp} nos programas de governo.`,
  ];
  const posts: SocialPost[] = [];
  const platforms = Object.keys(PLATFORM_BASE) as SocialPlatformId[];
  for (let k = 0; k < nBuckets; k++) {
    if (impulse[k] < 0.35) continue;
    const n = Math.min(4, Math.ceil(impulse[k] * 2));
    for (let j = 0; j < n; j++) {
      const w = candWeight[k];
      const cand = [...C].sort((a, b) => w[b.id] - w[a.id])[rng.int(0, 1)];
      const topic = topicAt[k];
      posts.push({
        id: `post-${posts.length + 1}`,
        platform: rng.pick(platforms),
        offset: k * bucket + rng.int(0, 59),
        text: rng.pick(templates)(cand.name, TOPIC_LABEL[topic].toLowerCase()),
        authorHandle: `@usuario_demo_${rng.int(100, 999)}`,
        mentionsCandidateIds: [cand.id],
        topic,
        terms: [TOPIC_LABEL[topic].toLowerCase(), "debate"],
        url: null,
        provenance: { nature: "collected", sourceId: "src-demo-social", mode: "demo" },
      });
    }
  }

  return { blocks, segments, classifications, metrics, posts };
}

let cache: DemoDataset | null = null;
/** Dataset demo determinístico (memoizado). */
export function getDemoDataset(): DemoDataset {
  if (!cache) cache = build();
  return cache;
}
