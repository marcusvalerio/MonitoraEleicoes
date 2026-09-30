import type { ConfidenceLevel } from "@/domain/quality";
import type { MentionType, Sentiment, SocialAnalysis, SocialEntityLink, SocialRecord } from "@/domain/social";
import { TOPIC_LEXICON, scoreTopics } from "./classifiers";
import { UF_NAME } from "@/elections/reference";

/**
 * CLASSIFICADOR SOCIAL POR REGRAS (social-rules/1.0.0) — baseline auditável; confiança sempre ≤ "média".
 *   Entidades: nome completo ou nome de urna (≥ 5 letras, limite de palavra, sem ambiguidade); sigla de partido só em
 *              MAIÚSCULAS e como palavra. Nunca por palavra isolada ambígua.
 *   Tipo de menção: padrões explícitos (voto/apoio, "não voto", "?", comparação); sem padrão ⇒ "mencao".
 *              "ironia" NUNCA é atribuída por regra (exige leitura humana/LLM validado).
 *   Sentimento: do CONTEÚDO (léxico) separado do sentimento EM RELAÇÃO à entidade (só com padrão explícito; senão "incerto").
 *   Tema: motor existente (exige termo forte) ou "unknown".
 *   Geo: somente UF escrita no texto ("no Rio de Janeiro", "em SP") ⇒ fonte "mencao_explicita" (assunto do conteúdo,
 *        não localização do autor). Mais de uma UF ⇒ nenhuma. Nunca por idioma ou probabilidade.
 */
export const SOCIAL_CLASSIFIER = { name: "social-rules", version: "social-rules/1.0.0" } as const;

export interface SocialContext {
  candidacies: { id: number; name: string; ballotName: string }[];
  parties: { acronym: string; name: string }[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (k: string) => new RegExp(`(^|[^\\p{L}\\p{N}])(${esc(k)})(?=$|[^\\p{L}\\p{N}])`, "gu");

const POS = /\b(otim[oa]|excelente|parabens|gostei|adorei|amei|bom|boa|melhor|concordo|acertou|merece)\b/;
const NEG = /\b(pessim[oa]|horrivel|ridicul[oa]|vergonha|mentir\w*|corrupt\w*|ladr[aã]o|pior|lixo|nojo|absurd[oa]|discordo|errou|fraco)\b/;
// Negação antes do verbo ("não voto no X", "nunca vou votar") NUNCA é apoio.
const SUPPORT = (k: string) => new RegExp(`(?<!\\b(nao|nunca|jamais)\\s)\\b(vou votar|voto|votarei|meu voto (e|vai|sera) (no|na|em|pra|para)?|apoio|fechado com|to com|estou com)\\s+(no |na |em |o |a |pra |para )?${esc(k)}\\b`);
const REJECT = (k: string) => new RegExp(`\\b((nao|nunca|jamais)\\s+(vou\\s+|irei\\s+)?(votar|voto|votarei|votaria)|fora)\\s+(no |na |em |o |a |pra |para )?${esc(k)}\\b|\\b${esc(k)}\\s+(e|eh)\\s+(um |uma )?(mentiros[oa]|corrupt[oa]|ladr[aã]o|incompetente|vergonha)\\b`);
/** Opinião explícita sobre a entidade (não é declaração de voto): define só o sentimento EM RELAÇÃO a ela. */
const LIKES = (k: string) => new RegExp(`\\b(gosto|adoro|admiro|confio)\\s+(muito\\s+)?(do|da|de|no|na)\\s+(candidat[oa]\\s+)?${esc(k)}\\b`);
const DISLIKES = (k: string) => new RegExp(`\\b(nao gosto|detesto|odeio|nao suporto|nao confio)\\s+(do|da|de|no|na)\\s+(candidat[oa]\\s+)?${esc(k)}\\b`);
const COMPARE = /\b(melhor|pior)\s+(que|do que)\b|\s(vs|versus|x)\s/;

function sentimentOf(t: string): { s: Sentiment; c: ConfidenceLevel } {
  const p = POS.test(t);
  const n = NEG.test(t);
  if (p && n) return { s: "misto", c: "low" };
  if (p) return { s: "positivo", c: "low" };
  if (n) return { s: "negativo", c: "low" };
  return { s: "incerto", c: "unknown" };
}

function geoOf(text: string): { uf: string | null; evidence: string | null } {
  const t = norm(text);
  const hits = new Map<string, string>();
  for (const [uf, name] of Object.entries(UF_NAME)) {
    const n = norm(name);
    const m = t.match(new RegExp(`\\b(em|no|na|do|da|de)\\s+${esc(n)}\\b`));
    if (m) hits.set(uf, m[0]);
    const s = text.match(new RegExp(`\\b(em|no|na|do|da)\\s+${uf}\\b`)); // sigla só em maiúsculas
    if (s) hits.set(uf, s[0]);
  }
  if (hits.size !== 1) return { uf: null, evidence: null };
  const [[uf, ev]] = [...hits.entries()];
  return { uf, evidence: ev };
}

export function classifySocial(r: SocialRecord, ctx: SocialContext): SocialAnalysis {
  const raw = r.text;
  const t = norm(raw);
  const entities: SocialEntityLink[] = [];
  // termos → candidaturas; termos repetidos entre candidaturas são ambíguos e ignorados
  const owners = new Map<string, Set<number>>();
  for (const c of ctx.candidacies)
    for (const n of [c.name, c.ballotName]) {
      const k = norm(n).trim();
      if (k.length >= 5) (owners.get(k) ?? owners.set(k, new Set()).get(k)!).add(c.id);
    }
  const found = new Map<number, string>();
  for (const [k, ids] of owners) if (ids.size === 1 && word(k).test(t)) found.set([...ids][0], k);
  const multi = found.size > 1;
  for (const [id, k] of found) {
    let type: MentionType = "mencao";
    let conf: ConfidenceLevel = "medium";
    let entitySentiment: Sentiment = "incerto";
    let evidence: string | null = k;
    const sentence = t.split(/(?<=[.!?\n])/).find((s) => s.includes(k)) ?? t;
    if (r.contentType === "news") type = "noticia";
    else if (REJECT(k).test(t)) {
      type = "critica_explicita";
      entitySentiment = "negativo";
      evidence = t.match(REJECT(k))![0];
    } else if (SUPPORT(k).test(t)) {
      type = "apoio_explicito";
      entitySentiment = "positivo";
      evidence = t.match(SUPPORT(k))![0];
    } else if (DISLIKES(k).test(t)) {
      type = "critica_explicita";
      entitySentiment = "negativo";
      evidence = t.match(DISLIKES(k))![0];
    } else if (LIKES(k).test(t)) {
      entitySentiment = "positivo"; // opinião favorável ≠ declaração de apoio/voto
      evidence = t.match(LIKES(k))![0];
    } else if (multi && COMPARE.test(t)) {
      type = "comparacao";
      conf = "low";
    } else if (/\?\s*$/.test(sentence.trim())) {
      type = "pergunta";
      conf = "low";
    } else conf = "low";
    entities.push({ recordId: r.id, entityType: "candidacy", entityId: String(id), mentionType: type, mentionConfidence: conf, entitySentiment, evidence });
  }
  for (const p of ctx.parties) {
    if (p.acronym.length >= 2 && word(p.acronym).test(raw)) entities.push({ recordId: r.id, entityType: "party", entityId: p.acronym, mentionType: r.contentType === "news" ? "noticia" : "mencao", mentionConfidence: "low", entitySentiment: "incerto", evidence: p.acronym });
  }
  const top = scoreTopics(raw)[0];
  const known = !!top && top.score >= 2 && top.strong > 0;
  const lex = known ? TOPIC_LEXICON[top.topic]! : null;
  const sent = sentimentOf(t);
  const geo = geoOf(raw);
  return {
    recordId: r.id,
    analysisVersion: SOCIAL_CLASSIFIER.version,
    contentHash: r.contentHash,
    classifier: SOCIAL_CLASSIFIER.name,
    contentSentiment: sent.s,
    sentimentConfidence: sent.c,
    topic: known ? top.topic : "unknown",
    topicConfidence: known ? "low" : "unknown",
    topicEvidence: lex ? [...lex.strong, ...lex.weak].map((re) => raw.match(re)?.[0]).filter((x): x is string => !!x) : [],
    relevant: entities.length > 0 || known,
    geoUf: geo.uf,
    geoSource: geo.uf ? "mencao_explicita" : "nenhuma",
    geoEvidence: geo.evidence,
    entities,
  };
}
