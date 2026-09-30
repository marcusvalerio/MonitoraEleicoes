import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { G1StructureError, parseG1LivePage } from "./parse";
import { FIXTURE_POSTS, g1LivePage, g1MicrodataPage, g1UnexpectedPage } from "./fixtures";
import { G1LiveEditorialProvider, assertAllowedG1Url } from "./index";
import { classifyEditorial } from "@/ai/editorial";
import { agoraFromEditorial, editorialSummary, eventsByBlock, eventsOverTime, topicsInMotion, MENTION_CAVEAT } from "@/analytics/editorial";
import { ingest } from "@/ingestion/pipeline";
import { FileRegistryElectionProvider, FilePressProvider, FileTranscriptProvider, UnconfiguredSocialProvider } from "@/providers/files";
import { RuleBasedSpeechClassifier } from "@/ai/classifiers";
import { paginate } from "@/providers/contracts";
import type { EditorialItem, EditorialUpdate } from "@/domain/editorial";
import type { Candidate, Party } from "@/domain/types";

const URL = "https://g1.globo.com/politica/eleicoes/2026/ao-vivo/debate-ficticio.ghtml";
const FIX = path.join(process.cwd(), "e2e/fixtures/g1/data");
const fakeFetch = (body: string | (() => string), status = 200) => (async () => new Response(typeof body === "function" ? body() : body, { status })) as unknown as typeof fetch;

describe("g1 · extração (fixtures determinísticas)", () => {
  it("JSON-LD LiveBlogPosting: posts, horários e ids; variantes canônica+AMP sem duplicar", () => {
    const r = parseG1LivePage(g1LivePage(FIXTURE_POSTS));
    expect(r.strategy).toBe("json-ld");
    expect(r.posts).toHaveLength(5);
    expect(r.posts[1]).toMatchObject({ postId: FIXTURE_POSTS[1].id, publishedAt: "2026-10-02T00:14:05.000Z", text: FIXTURE_POSTS[1].text });
    expect(r.posts[1].url).toContain("?postId=");
    expect(r.posts[1].fragment).toContain("articleBody");
  });
  it("microdata como alternativa quando não há JSON-LD", () => {
    const r = parseG1LivePage(g1MicrodataPage(FIXTURE_POSTS.slice(0, 2)));
    expect(r.strategy).toBe("microdata");
    expect(r.posts.map((p) => p.postId)).toEqual([FIXTURE_POSTS[0].id, FIXTURE_POSTS[1].id]);
  });
  it("caso 4 · HTML inesperado → erro controlado (nunca '0 atualizações' silencioso)", () => {
    expect(() => parseG1LivePage(g1UnexpectedPage)).toThrow(G1StructureError);
  });
  it("caso 7 · horário ausente → null (nunca estimado)", () => {
    const r = parseG1LivePage(g1LivePage([{ id: "sem-hora", text: "Post sem horário.", published: null }]));
    expect(r.posts[0].publishedAt).toBeNull();
  });
});

describe("g1 · provider", () => {
  afterEach(() => {
    delete process.env.G1_ALLOWED_HOSTS;
  });
  it("allowlist: só https://g1.globo.com/…/ao-vivo/ (proteção contra SSRF)", () => {
    expect(() => assertAllowedG1Url(URL)).not.toThrow();
    for (const bad of ["http://g1.globo.com/x/ao-vivo/y", "https://evil.example/ao-vivo/", "https://g1.globo.com/politica/noticia/x.ghtml", "file:///etc/passwd", "http://169.254.169.254/"]) expect(() => assertAllowedG1Url(bad)).toThrow();
    process.env.G1_ALLOWED_HOSTS = "localhost:4599";
    expect(() => assertAllowedG1Url("http://localhost:4599/live.html")).not.toThrow();
  });
  it("caso 1/2/3 · RAW g1.live-post/v1; mesma página ⇒ mesmo hash; post editado ⇒ só ele muda", async () => {
    let html = g1LivePage(FIXTURE_POSTS);
    const p = new G1LiveEditorialProvider({ debateId: "d", sourceUrl: URL }, fakeFetch(() => html), () => Date.parse("2026-10-02T00:40:00Z"));
    const a = (await p.fetchUpdates()).items;
    const b = (await p.fetchUpdates()).items;
    expect(a[0].schema).toBe("g1.live-post/v1");
    expect(a.map((r) => JSON.stringify(r.payload))).toEqual(b.map((r) => JSON.stringify(r.payload)));
    html = g1LivePage(FIXTURE_POSTS.map((x, i) => (i === 2 ? { ...x, text: x.text + " (atualizado)", modified: "2026-10-02T00:20:00.000Z" } : x)));
    const c = (await p.fetchUpdates()).items;
    const changed = c.filter((r, i) => JSON.stringify(r.payload) !== JSON.stringify(a[i].payload));
    expect(changed.map((r) => r.externalId)).toEqual([`d#${FIXTURE_POSTS[2].id}`]);
    expect(p.lastSnapshot()).toMatchObject({ strategy: "json-ld", windowStart: FIXTURE_POSTS[0].published });
  });
  it("caso 5 · indisponível: 5xx/rede = retentável; 4xx = inválido; 429 = limite", async () => {
    const mk = (f: typeof fetch) => new G1LiveEditorialProvider({ debateId: "d", sourceUrl: URL, timeoutMs: 50 }, f);
    await expect(mk(fakeFetch("x", 503)).fetchUpdates()).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
    await expect(mk(fakeFetch("x", 403)).fetchUpdates()).rejects.toMatchObject({ code: "invalid_response", retryable: false });
    await expect(mk(fakeFetch("x", 429)).fetchUpdates()).rejects.toMatchObject({ code: "rate_limited" });
    const hang = ((_u: unknown, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    await expect(mk(hang).fetchUpdates()).rejects.toMatchObject({ code: "provider_unavailable", message: expect.stringMatching(/tempo esgotado/) });
    await expect(mk(fakeFetch(g1UnexpectedPage)).fetchUpdates()).rejects.toMatchObject({ code: "invalid_response" });
  });
});

const cands: Candidate[] = [
  { id: "c-hd", name: "Helena Duarte", ballotName: "Helena Duarte", partyId: "p-a", officeId: "x", swatch: "#000", initials: "HD" },
  { id: "c-rm", name: "Rafael Monteiro", ballotName: "Rafael Monteiro", partyId: "p-b", officeId: "x", swatch: "#000", initials: "RM" },
];
const parties: Party[] = [{ id: "p-a", acronym: "PFA", name: "Partido Fictício A", number: 91 }];
const ctx = { candidates: cands, parties, aliases: new Map([["Helena Duarte", ["Duarte"]], ["Rafael Monteiro", ["Monteiro"]]]) };
const upd = (text: string, publishedAt: string | null = "2026-10-02T00:14:05.000Z", id = "u1"): EditorialUpdate => ({ id, debateId: "d", providerId: "g1-live-editorial", sourceId: "src-g1-editorial", externalId: `d#${id}`, url: null, headline: null, text, publishedAt, modifiedAt: null, collectedAt: "2026-10-02T00:14:07.000Z", contentHash: "h", parserVersion: "p", strategy: "json-ld", provenance: { nature: "collected", sourceId: "src-g1-editorial", mode: "live" } });

describe("classificação editorial (interpretação versionada)", () => {
  it("'X questiona Y sobre segurança pública' → pergunta, ator → alvo, tema com evidência", () => {
    const a = classifyEditorial(upd("Helena Duarte questiona Rafael Monteiro sobre segurança pública."), ctx);
    expect(a).toMatchObject({ eventType: "pergunta", eventTypeConfidence: "medium", actorCandidateId: "c-hd", targetCandidateId: "c-rm", candidateConfidence: "medium", topic: "seguranca" });
    expect(a.topicEvidence.length).toBeGreaterThan(0);
    expect(a.relevanceCriteria).toEqual({ namedActor: true, namedTarget: true, substantiveType: true, knownTopic: true });
  });
  it("caso 6 · candidato não identificado ⇒ não rejeita; unknown", () => {
    const a = classifyEditorial(upd("Um candidato critica a proposta do adversário."), ctx);
    expect(a.actorCandidateId).toBeNull();
    expect(a.mentionedCandidateIds).toEqual([]);
    expect(a.candidateConfidence).toBe("unknown");
    expect(a.eventType).toBe("critica");
  });
  it("caso 8 · tema desconhecido ⇒ unknown (palavra fraca isolada não basta)", () => {
    const a = classifyEditorial(upd("Clima tenso no estúdio; a família do candidato acompanha."), ctx);
    expect(a.topic).toBe("unknown");
    expect(a.topicConfidence).toBe("unknown");
    expect(a.eventType).toBe("unknown");
  });
  it("caso 9 · mudança de bloco detectada quando a fonte diz", () => {
    expect(classifyEditorial(upd("Intervalo. O segundo bloco começa em instantes."), ctx)).toMatchObject({ eventType: "intervalo", blockSignal: "segundo bloco" });
  });
  it("menção só por nome/apelido completo, sem matching agressivo; sigla de partido sensível a maiúsculas", () => {
    expect(classifyEditorial(upd("O monte de propostas não convenceu."), ctx).mentionedCandidateIds).toEqual([]);
    expect(classifyEditorial(upd("Duarte fala ao lado de dirigentes do PFA."), ctx)).toMatchObject({ mentionedCandidateIds: ["c-hd"], mentionedPartyIds: ["p-a"] });
    expect(classifyEditorial(upd("pfa não é sigla aqui"), ctx).mentionedPartyIds).toEqual([]);
  });
  it("o texto original nunca é alterado pela análise", () => {
    const u = upd("Helena Duarte questiona Rafael Monteiro.");
    classifyEditorial(u, ctx);
    expect(u.text).toBe("Helena Duarte questiona Rafael Monteiro.");
  });
});

describe("analytics editorial", () => {
  const items: EditorialItem[] = FIXTURE_POSTS.map((p, i) => {
    const u = upd(p.text, p.published ?? null, `p${i}`);
    return { update: u, analysis: classifyEditorial(u, ctx) };
  });
  const names = (id: string) => cands.find((c) => c.id === id)?.name ?? "?";
  it("contagens por candidato/tema/tipo; menção ≠ apoio (aviso explícito)", () => {
    const s = editorialSummary(items);
    expect(s.total).toBe(5);
    expect(s.byCandidate.find((c) => c.key === "c-rm")?.count).toBe(2);
    expect(s.caveat).toBe(MENTION_CAVEAT);
    expect(s.caveat).toMatch(/não indicam apoio/);
  });
  it("blocos, série temporal e temas em movimento a partir do horário da fonte", () => {
    expect(eventsByBlock(items).map((b) => b.block)).toEqual(["antes de qualquer sinal de bloco", "segundo bloco"]);
    expect(eventsOverTime(items, 15).reduce((a, b) => a + b.count, 0)).toBe(5);
    expect(topicsInMotion(items, "2026-10-02T00:20:00Z", 10).find((t) => t.topic === "seguranca")?.recent).toBe(1);
  });
  it("AGORA: último evento confiável vira frase sustentada pela análise; sem frase segura ⇒ texto original", () => {
    const ag = agoraFromEditorial(items, names);
    expect(ag?.sentence).toBe("Helena Duarte questionou Rafael Monteiro sobre segurança.");
    const onlyVague = agoraFromEditorial([items[4]], names);
    expect(onlyVague?.sentence).toBeNull();
    expect(onlyVague?.item.update.text).toBe(FIXTURE_POSTS[4].text);
  });
});

describe("pipeline: g1 junto dos demais providers", () => {
  const base = { mode: "live" as const, election: new FileRegistryElectionProvider(FIX), transcript: new FileTranscriptProvider(FIX), social: new UnconfiguredSocialProvider(), media: new FilePressProvider(FIX), classifier: (s: import("@/ingestion/store").DataStore) => new RuleBasedSpeechClassifier(() => [...s.candidates.values()]), aiSourceId: "src-ai-rules", sleep: async () => {} };
  it("atualizações viram EditorialUpdate + análise; candidatos resolvidos pelo registro", async () => {
    const g1 = new G1LiveEditorialProvider({ debateId: "debate-fixture-g1", sourceUrl: URL }, fakeFetch(g1LivePage(FIXTURE_POSTS)));
    const store = await ingest({ ...base, editorial: [g1] });
    expect(store.editorial).toHaveLength(5);
    expect(store.editorialAnalyses.size).toBe(5);
    const q = store.editorialAnalyses.get(`debate-fixture-g1:g1-live-editorial:${FIXTURE_POSTS[1].id}`)!;
    expect(q.actorCandidateId).toBe("cand-helena-duarte");
    expect([...store.segments.values()].flat()).toHaveLength(0); // editorial nunca vira transcrição
  });
  it("caso 5 · g1 indisponível: execução 'failed', demais providers seguem", async () => {
    const g1 = new G1LiveEditorialProvider({ debateId: "debate-fixture-g1", sourceUrl: URL }, fakeFetch("x", 503));
    const store = await ingest({ ...base, editorial: [g1] });
    expect(store.reports.find((r) => r.kind === "media:editorial:debate-fixture-g1")?.status).toBe("failed");
    expect(store.candidates.size).toBe(3);
    expect(store.debates.has("debate-fixture-g1")).toBe(true);
  });
  it("post de debate desconhecido é rejeitado (nunca ligado a outro debate)", async () => {
    const g1 = new G1LiveEditorialProvider({ debateId: "nao-existe", sourceUrl: URL }, fakeFetch(g1LivePage(FIXTURE_POSTS)));
    const store = await ingest({ ...base, editorial: [g1] });
    expect(store.editorial).toHaveLength(0);
    expect(store.rejections.filter((r) => r.code === "normalization_error").length).toBe(5);
    void paginate;
  });
});
