import type { Candidate, Party } from "@/domain/types";
import type { ConfidenceLevel } from "@/domain/quality";
import type { EditorialAnalysis, EditorialEventType, EditorialUpdate } from "@/domain/editorial";
import { TOPIC_LEXICON, scoreTopics } from "./classifiers";

/**
 * CLASSIFICADOR EDITORIAL POR REGRAS (determinístico, auditável). Interpreta uma atualização editorial
 * SEM alterar o texto original. Regras:
 *   - tipo de evento: só por marcador explícito no texto da fonte; sem marcador ⇒ `unknown` (não adivinha);
 *   - candidatos: nome completo ou apelido configurado (≥ 4 letras, não ambíguo, limite de palavra);
 *     ator/alvo só com padrão verbal explícito "X <verbo> Y"; caso contrário, apenas "mencionados";
 *   - tema: motor de temas existente (exige termo forte); sem evidência ⇒ `unknown`;
 *   - relevância: critérios objetivos versionados (nunca decidida por modelo).
 * Editorial é paráfrase do veículo: a confiança máxima de ator/tema é "média".
 */
export const EDITORIAL_CLASSIFIER = { name: "editorial-rules", version: "1.0.0", methodology: "editorial-methodology/1", relevance: "editorial-criteria/1" } as const;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Rule = { type: EditorialEventType; re: RegExp; conf: ConfidenceLevel };
// Ordem importa: marcadores estruturais do debate antes de verbos genéricos.
const RULES: Rule[] = [
  { type: "direito_resposta", re: /direito de resposta/, conf: "high" },
  { type: "treplica", re: /\btreplica\b/, conf: "high" },
  { type: "replica", re: /\breplica\b/, conf: "high" },
  { type: "consideracao_final", re: /consideracoes finais/, conf: "high" },
  { type: "intervalo", re: /\bintervalo\b/, conf: "high" },
  { type: "encerramento", re: /\b(fim|encerramento) do debate\b|\b(encerra|termina) o debate\b|\bdebate (termina|chega ao fim|e encerrado)\b/, conf: "high" },
  { type: "abertura", re: /\b(comeca|comecou|inicio|abertura) (d?o )?debate\b|\bdebate (comeca|comecou)\b/, conf: "high" },
  { type: "mudanca_tema", re: /\b(novo tema|tema sorteado|muda(nca)? de tema|proximo tema)\b/, conf: "medium" },
  { type: "pergunta", re: /\b(pergunta|perguntou|questiona|questionou|indaga|indagou)\b/, conf: "medium" },
  { type: "ataque", re: /\b(ataca|atacou|acusa|acusou)\b/, conf: "medium" },
  { type: "defesa", re: /\b(se defende|se defendeu|nega ter|negou ter)\b/, conf: "medium" },
  { type: "resposta", re: /\b(responde|respondeu|rebate|rebateu)\b/, conf: "medium" },
  { type: "proposta", re: /\b(propoe|propos|promete|prometeu|apresenta proposta)\b/, conf: "medium" },
  { type: "critica", re: /\b(critica|criticou)\b/, conf: "medium" },
];
const ACTION = /\b(pergunta|perguntou|questiona|questionou|indaga|indagou|ataca|atacou|acusa|acusou|critica|criticou|rebate|rebateu|responde|respondeu)\b/;
const BLOCK_NAMED = /\b(primeiro|segundo|terceiro|quarto|quinto|[1-5]o?|[1-5]º) bloco\b/;
const BLOCK_OTHER = /\bintervalo\b|\bconsideracoes finais\b/;
const SUBSTANTIVE: EditorialEventType[] = ["pergunta", "ataque", "critica", "proposta", "defesa", "direito_resposta", "resposta", "replica", "treplica"];

export interface EditorialContext {
  candidates: Candidate[];
  parties: Party[];
  /** Apelidos por nome completo (do registro oficial/configurado). */
  aliases: Map<string, string[]>;
}

/** Referências nominais (nome completo e apelidos não ambíguos) → candidato, com posição no texto. */
function findCandidates(text: string, ctx: EditorialContext): { id: string; at: number; end: number }[] {
  const t = norm(text);
  const owners = new Map<string, Set<string>>();
  for (const c of ctx.candidates) for (const n of [c.name, c.ballotName, ...(ctx.aliases.get(c.name) ?? [])]) {
    const k = norm(n).trim();
    if (k.length < 4) continue; // apelidos curtos são ambíguos demais
    (owners.get(k) ?? owners.set(k, new Set()).get(k)!).add(c.id);
  }
  const hits: { id: string; at: number; end: number }[] = [];
  for (const [k, ids] of owners) {
    if (ids.size !== 1) continue; // mesmo termo para dois candidatos ⇒ ambíguo, ignorado
    const re = new RegExp(`(^|[^\\p{L}])(${esc(k)})(?=$|[^\\p{L}])`, "gu");
    for (const m of t.matchAll(re)) {
      const at = m.index! + m[1].length;
      hits.push({ id: [...ids][0], at, end: at + k.length });
    }
  }
  // remove sobreposições (ex.: "Eduardo Paes" e "Paes" no mesmo trecho)
  hits.sort((a, b) => a.at - b.at || b.end - a.end);
  const out: typeof hits = [];
  for (const h of hits) if (!out.length || h.at >= out[out.length - 1].end) out.push(h);
  return out;
}

function findParties(text: string, parties: Party[]): string[] {
  const out = new Set<string>();
  for (const p of parties) {
    if (p.acronym.length >= 2 && new RegExp(`(^|[^\\p{L}])${esc(p.acronym)}(?=$|[^\\p{L}])`, "u").test(text)) out.add(p.id); // sigla: sensível a maiúsculas
    else if (p.name.length >= 6 && norm(text).includes(norm(p.name))) out.add(p.id);
  }
  return [...out];
}

export function classifyEditorial(u: EditorialUpdate, ctx: EditorialContext): EditorialAnalysis {
  const raw = [u.headline, u.text].filter(Boolean).join(". ");
  const t = norm(raw);

  const rule = RULES.find((r) => r.re.test(t));
  const eventType: EditorialEventType = rule?.type ?? "unknown";
  const evidence = rule ? (t.match(rule.re)?.[0] ?? null) : null;

  const hits = findCandidates(raw, ctx);
  const mentioned = [...new Set(hits.map((h) => h.id))];
  let actor: string | null = null;
  let target: string | null = null;
  let candConf: ConfidenceLevel = mentioned.length ? "low" : "unknown";
  // "X <verbo> (a/ao/à) Y" — ator e alvo explícitos
  for (let i = 0; i + 1 < hits.length; i++) {
    const between = t.slice(hits[i].end, hits[i + 1].at);
    if (hits[i].id !== hits[i + 1].id && between.length <= 40 && ACTION.test(between)) {
      actor = hits[i].id;
      target = hits[i + 1].id;
      candConf = "medium";
      break;
    }
  }
  // um único candidato no início, seguido de verbo de ação: ator (confiança baixa)
  if (!actor && mentioned.length === 1 && hits[0].at <= 3 && ACTION.test(t.slice(hits[0].end, hits[0].end + 30))) actor = hits[0].id;

  const scores = scoreTopics(raw);
  const top = scores[0];
  const known = !!top && top.score >= 2 && top.strong > 0;
  const lex = known ? TOPIC_LEXICON[top.topic]! : null;
  const topicEvidence = lex ? [...lex.strong, ...lex.weak].map((re) => raw.match(re)?.[0]).filter((x): x is string => !!x) : [];

  // bloco nomeado ("segundo bloco") prevalece sobre marcadores genéricos (intervalo, considerações finais)
  const block = t.match(BLOCK_NAMED)?.[0] ?? t.match(BLOCK_OTHER)?.[0] ?? null;
  const criteria = { namedActor: !!actor, namedTarget: !!target, substantiveType: SUBSTANTIVE.includes(eventType), knownTopic: known };
  const score = Math.round(((Number(criteria.namedActor) + Number(criteria.namedTarget) + Number(criteria.substantiveType) + Number(criteria.knownTopic)) / 4) * 100) / 100;

  return {
    eventId: u.id,
    contentHash: u.contentHash,
    classifier: EDITORIAL_CLASSIFIER.name,
    classifierVersion: EDITORIAL_CLASSIFIER.version,
    methodologyVersion: EDITORIAL_CLASSIFIER.methodology,
    eventType,
    eventTypeConfidence: rule?.conf ?? "unknown",
    eventTypeEvidence: evidence,
    actorCandidateId: actor,
    targetCandidateId: target,
    mentionedCandidateIds: mentioned,
    mentionedPartyIds: findParties(raw, ctx.parties),
    candidateConfidence: candConf,
    topic: known ? top.topic : "unknown",
    subtopic: null,
    topicConfidence: known ? (top.score >= 4 ? "medium" : "low") : "unknown",
    topicEvidence,
    blockSignal: block,
    relevance: score >= 0.75 ? "alta" : score >= 0.5 ? "media" : "baixa",
    relevanceScore: score,
    relevanceCriteria: criteria,
    relevanceVersion: EDITORIAL_CLASSIFIER.relevance,
  };
}
