import { describe, expect, it } from "vitest";
import { YouTubeProvider } from "./index";
import { FX_YT_VIDEOS, fakeYouTube } from "./fixtures";
import { normalize } from "@/normalization/normalizers";
import { NormalizationContext } from "@/normalization/context";
import { classifySocial } from "@/ai/social";
import type { SocialRecord } from "@/domain/social";
import { PLATFORM_MATRIX, UnavailableSocialProvider } from "@/providers/social/catalog";

const Q = { terms: ["debate presidencial", "Helena Duarte"], since: "2026-10-02T00:00:00Z", until: "2026-10-02T01:00:00Z" };
const mk = (f: typeof fetch, budget?: number) => new YouTubeProvider({ apiKey: "chave-fake", hashKey: "k", budget }, f, () => Date.parse("2026-10-02T01:00:00Z"));

describe("YouTube Data API v3 (fixture)", () => {
  it("sem chave ⇒ requires_authorization; nunca finge coleta", async () => {
    const p = new YouTubeProvider({});
    expect(p.accessStatus().status).toBe("requires_authorization");
    await expect(p.collect(Q)).rejects.toMatchObject({ code: "authentication_required" });
    const others = PLATFORM_MATRIX.filter((e) => e.platform !== "youtube").map((e) => new UnavailableSocialProvider(e));
    expect(others.map((x) => [x.info.platform, x.accessStatus().status])).toContainEqual(["tiktok", "unsupported"]);
    expect(others.find((x) => x.info.platform === "x")?.accessStatus().status).toBe("requires_authorization");
    await expect(others[0].collect()).rejects.toMatchObject({ code: "authentication_required" });
  });
  it("coleta vídeos (dedup entre termos), métricas separadas, comentários e respostas; contabiliza cota", async () => {
    const yt = fakeYouTube(FX_YT_VIDEOS);
    const r = await mk(yt.fetch).collect(Q);
    const by = (s: string) => r.records.filter((x) => x.schema === s);
    expect(by("youtube.video/v1")).toHaveLength(2);
    expect(by("youtube.video-stats/v1")).toHaveLength(2);
    expect(by("youtube.comment/v1")).toHaveLength(4);
    expect(r.quotaUsed).toBe(2 * 100 + 1 + 1); // 2 buscas + 1 videos + 1 commentThreads (o outro vídeo tem comentários desativados, sem cobrança contabilizada)
    expect(r.partial).toBe(false);
    const v1 = by("youtube.video/v1").find((x) => x.externalId === "video:vid00000001")!;
    expect((v1.payload as { matched_terms: string[] }).matched_terms).toEqual(["Helena Duarte", "debate presidencial"]);
    const c = by("youtube.comment/v1")[0].payload as Record<string, unknown>;
    expect(c.author_channel_id).toMatch(/^[0-9a-f]{64}$/); // HMAC, nunca o id em claro
    expect(JSON.stringify(r.records)).not.toContain("Pessoa Comentarista"); // nome de comentarista não é coletado
  });
  it("orçamento de cota esgotado ⇒ janela parcial (nunca 'completa')", async () => {
    const r = await mk(fakeYouTube(FX_YT_VIDEOS).fetch, 150).collect(Q);
    expect(r.partial).toBe(true);
    expect(r.quotaUsed).toBeLessThanOrEqual(150);
  });
  it("cota diária esgotada ⇒ rate_limited NÃO retentável; chave inválida ⇒ authentication_required", async () => {
    await expect(mk(fakeYouTube([], { quotaExceeded: true }).fetch).collect(Q)).rejects.toMatchObject({ code: "rate_limited", retryable: false });
    await expect(mk(fakeYouTube([], { invalidKey: true }).fetch).collect(Q)).rejects.toMatchObject({ code: "authentication_required" });
  });
  it("normalização: vídeo/live/comentário/resposta; métrica oculta ausente (nunca 0)", async () => {
    const r = await mk(fakeYouTube(FX_YT_VIDEOS).fetch).collect(Q);
    const ctx = new NormalizationContext("live");
    const out = r.records.map((x) => normalize(x, ctx, "src-social-youtube"));
    const recs = out.filter((n) => n.type === "social_record").map((n) => n.value as SocialRecord);
    expect(recs.map((x) => x.contentType).sort()).toEqual(["comment", "comment", "comment", "live", "reply", "video"]);
    expect(recs.find((x) => x.contentType === "reply")?.parentId).toBe("youtube:comment:c1");
    expect(recs.find((x) => x.contentType === "comment")?.authorDisplayName).toBeNull();
    const stats = out.filter((n) => n.type === "social_metrics").map((n) => n.value as unknown as { recordId: string; metrics: Record<string, number> });
    expect(stats.find((s) => s.recordId === "youtube:video:vid00000002")?.metrics).toEqual({ views: 5400, comments: 0 });
  });
});

const ctx = { candidacies: [{ id: 1, name: "HELENA DUARTE", ballotName: "HELENA DUARTE" }, { id: 2, name: "RAFAEL MONTEIRO", ballotName: "RAFAEL MONTEIRO" }], parties: [{ acronym: "PFA", name: "Partido Fictício A" }] };
const rec = (text: string, contentType: SocialRecord["contentType"] = "comment"): SocialRecord => ({ id: "youtube:comment:x", platform: "youtube", providerId: "y", externalId: "x", monitorId: null, contentType, parentId: null, rootId: null, authorHash: null, authorDisplayName: null, publishedAt: null, collectedAt: "2026-10-02T00:00:00Z", title: null, text, language: null, permalink: null, mediaType: null, metrics: {}, contentHash: "h", provenance: { nature: "collected", sourceId: "s", mode: "live" } });
const ent = (text: string, t?: SocialRecord["contentType"]) => classifySocial(rec(text, t), ctx).entities;

describe("classificação social: menção ≠ apoio; sentimento do conteúdo ≠ sentimento sobre a entidade", () => {
  it("apoio explícito só com declaração explícita", () => {
    expect(ent("Vou votar na Helena Duarte.")[0]).toMatchObject({ entityId: "1", mentionType: "apoio_explicito", entitySentiment: "positivo" });
    expect(ent("Helena Duarte falou sobre saúde.")[0]).toMatchObject({ mentionType: "mencao", entitySentiment: "incerto" });
    for (const neg of ["Não voto no Rafael Monteiro de jeito nenhum.", "Nunca vou votar no Rafael Monteiro", "jamais voto no Rafael Monteiro"]) expect(ent(neg)[0]).toMatchObject({ mentionType: "critica_explicita", entitySentiment: "negativo" });
  });
  it("'gosto do debate, mas não gosto do candidato X': conteúdo misto, X negativo", () => {
    const a = classifySocial(rec("Eu gosto do debate, mas não gosto do candidato Rafael Monteiro."), ctx);
    expect(a.entities[0]).toMatchObject({ entityId: "2", mentionType: "critica_explicita", entitySentiment: "negativo" });
    expect(a.contentSentiment).not.toBe("negativo");
  });
  it("pergunta, comparação, notícia; ironia nunca atribuída por regra", () => {
    expect(ent("Alguém sabe o que a Helena Duarte propôs?")[0].mentionType).toBe("pergunta");
    expect(ent("Helena Duarte é melhor que Rafael Monteiro nesse tema").every((e) => e.mentionType === "comparacao")).toBe(true);
    expect(ent("Helena Duarte apresenta plano", "news")[0].mentionType).toBe("noticia");
    expect(ent("Claro, Helena Duarte é um gênio... só que não").some((e) => e.mentionType === "ironia")).toBe(false);
  });
  it("sem matching agressivo: parte do nome/palavra ambígua não conta; sigla só em maiúsculas", () => {
    expect(ent("A helena do bairro e o monteiro da esquina")).toEqual([]);
    expect(ent("dirigentes do PFA").map((e) => e.entityId)).toEqual(["PFA"]);
    expect(ent("o pfa não conta")).toEqual([]);
  });
  it("geo só com evidência explícita (UF mencionada); idioma não conta; duas UFs ⇒ nenhuma", () => {
    expect(classifySocial(rec("Escolas em SP precisam de mais investimento"), ctx)).toMatchObject({ geoUf: "SP", geoSource: "mencao_explicita" });
    expect(classifySocial(rec("Ótimo debate, gostei muito"), ctx)).toMatchObject({ geoUf: null, geoSource: "nenhuma" });
    expect(classifySocial(rec("Obras no Rio de Janeiro e em Minas Gerais"), ctx).geoUf).toBeNull();
  });
  it("tema pelo motor existente; sem evidência ⇒ unknown", () => {
    expect(classifySocial(rec("Precisamos de mais policiamento e segurança pública"), ctx).topic).toBe("seguranca");
    expect(classifySocial(rec("Que noite!"), ctx).topic).toBe("unknown");
  });
});
