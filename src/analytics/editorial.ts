import type { EditorialItem } from "@/domain/editorial";
import { EDITORIAL_EVENT_LABEL } from "@/domain/editorial";
import { TOPIC_LABEL } from "@/domain/labels";
import { violatesEditorialPolicy } from "@/domain/guards";
import { hasCausalLanguage } from "@/domain/statements";

/**
 * ANALYTICS DA COBERTURA EDITORIAL — medições (contagens) sobre o que a fonte publicou.
 * "Mais mencionado" ≠ "mais apoiado": contagens de menção na cobertura não medem apoio, preferência nem voto.
 * Posts removidos pela fonte ficam fora das contagens; posts sem horário ficam fora das séries temporais.
 */
export const MENTION_CAVEAT = "Menções contam citações na cobertura editorial; não indicam apoio, preferência ou intenção de voto.";

const active = (xs: EditorialItem[]) => xs.filter((x) => !x.update.removedAt);
const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const sorted = (m: Map<string, number>) => [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

export function editorialSummary(items: EditorialItem[]) {
  const xs = active(items);
  const byCandidate = new Map<string, number>();
  const byTopic = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const x of xs) {
    const a = x.analysis;
    const cands = new Set([...(a?.mentionedCandidateIds ?? []), ...(a?.actorCandidateId ? [a.actorCandidateId] : []), ...(a?.targetCandidateId ? [a.targetCandidateId] : [])]);
    for (const c of cands) inc(byCandidate, c);
    inc(byTopic, a?.topic ?? "unknown");
    inc(byType, a?.eventType ?? "unknown");
  }
  return { total: xs.length, untimed: xs.filter((x) => !x.update.publishedAt).length, byCandidate: sorted(byCandidate), byTopic: sorted(byTopic), byType: sorted(byType), caveat: MENTION_CAVEAT };
}

/** Ordem temporal da fonte (somente posts com horário). */
export function timedChronological(items: EditorialItem[]) {
  return active(items)
    .filter((x) => x.update.publishedAt)
    .sort((a, b) => a.update.publishedAt!.localeCompare(b.update.publishedAt!));
}

/** Blocos: cada post pertence ao último sinal explícito de bloco publicado antes dele (se houver). */
export function eventsByBlock(items: EditorialItem[]) {
  let current = "antes de qualquer sinal de bloco";
  const m = new Map<string, number>();
  for (const x of timedChronological(items)) {
    if (x.analysis?.blockSignal) current = x.analysis.blockSignal;
    inc(m, current);
  }
  return [...m.entries()].map(([block, count]) => ({ block, count }));
}

/** Eventos por janela de tempo (min), a partir do horário da fonte. */
export function eventsOverTime(items: EditorialItem[], bucketMin = 5) {
  const size = bucketMin * 60_000;
  const m = new Map<number, number>();
  for (const x of timedChronological(items)) {
    const b = Math.floor(Date.parse(x.update.publishedAt!) / size) * size;
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, count]) => ({ start: new Date(t).toISOString(), count }));
}

/** Temas em movimento: contagem na janela recente × janela anterior (mesmo tamanho). Base pequena ⇒ variação `null`. */
export function topicsInMotion(items: EditorialItem[], nowIso: string, windowMin = 10) {
  const now = Date.parse(nowIso);
  const w = windowMin * 60_000;
  const recent = new Map<string, number>();
  const prev = new Map<string, number>();
  for (const x of timedChronological(items)) {
    const t = Date.parse(x.update.publishedAt!);
    const topic = x.analysis?.topic ?? "unknown";
    if (topic === "unknown") continue;
    if (t > now - w && t <= now) inc(recent, topic);
    else if (t > now - 2 * w && t <= now - w) inc(prev, topic);
  }
  const keys = new Set([...recent.keys(), ...prev.keys()]);
  return [...keys]
    .map((topic) => ({ topic, recent: recent.get(topic) ?? 0, previous: prev.get(topic) ?? 0 }))
    .map((r) => ({ ...r, change: r.previous >= 2 ? (r.recent - r.previous) / r.previous : null }))
    .sort((a, b) => b.recent - a.recent);
}

const VERB: Partial<Record<string, string>> = { pergunta: "questionou", ataque: "atacou", critica: "criticou", resposta: "respondeu a", replica: "fez réplica a", treplica: "fez tréplica a", direito_resposta: "pediu direito de resposta contra" };

/**
 * Frase do bloco AGORA a partir do último evento editorial CONFIÁVEL (horário da fonte, ator e tipo resolvidos
 * com confiança ≥ média). Só usa campos sustentados pela análise; passa pelas guardas editoriais.
 * Sem frase segura ⇒ `sentence = null` e a UI mostra o texto original da fonte, atribuído a ela.
 */
export function agoraFromEditorial(items: EditorialItem[], name: (id: string) => string) {
  const xs = timedChronological(items).reverse();
  const latest = xs[0] ?? null;
  for (const x of xs) {
    const a = x.analysis;
    if (!a || !a.actorCandidateId || a.candidateConfidence === "low" || a.candidateConfidence === "unknown") continue;
    if (a.eventTypeConfidence === "low" || a.eventTypeConfidence === "unknown") continue;
    const verb = VERB[a.eventType];
    if (!verb) continue;
    const topic = a.topic !== "unknown" && a.topicConfidence !== "unknown" ? ` sobre ${TOPIC_LABEL[a.topic].toLowerCase()}` : "";
    const target = a.targetCandidateId ? ` ${name(a.targetCandidateId)}` : "";
    const sentence = `${name(a.actorCandidateId)} ${verb}${target}${topic}.`.replace(/ a\./, ".");
    if (violatesEditorialPolicy(sentence) || hasCausalLanguage(sentence)) continue;
    return { item: x, sentence, eventLabel: EDITORIAL_EVENT_LABEL[a.eventType] };
  }
  return latest ? { item: latest, sentence: null, eventLabel: latest.analysis ? EDITORIAL_EVENT_LABEL[latest.analysis.eventType] : null } : null;
}
