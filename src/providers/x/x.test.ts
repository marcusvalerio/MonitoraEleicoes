import { describe, expect, it } from "vitest";
import { XProvider, buildQueries } from "./index";
import { normalize } from "@/normalization/normalizers";

/** Respostas SIMULADAS da API v2 (apenas para teste automatizado; textos fictícios). */
const NOW = Date.parse("2026-10-04T23:00:00Z");
const post = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, text, author_id: "u" + id, created_at: "2026-10-04T22:30:00.000Z", lang: "pt", conversation_id: id, public_metrics: { like_count: 3, reply_count: 1, retweet_count: 0 }, ...extra });
function fakeX(pages: Record<string, unknown>[], status = 200, headers: Record<string, string> = {}) {
  const calls: URL[] = [];
  const f = (async (u: URL, init: RequestInit) => {
    calls.push(new URL(u));
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    if (status !== 200) return new Response(JSON.stringify({ title: headers.title ?? "Error" }), { status, headers });
    const tok = new URL(u).searchParams.get("next_token");
    return new Response(JSON.stringify(pages[tok ? Number(tok) : 0] ?? { meta: {} }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const q = { terms: ["debate presidencial", "TSE"], since: "2026-10-04T22:00:00Z", until: "2026-10-04T23:00:00Z" };

describe("X · API v2 (busca recente)", () => {
  it("sem token ⇒ requires_authorization; nenhuma requisição", async () => {
    const p = new XProvider({}, (async () => { throw new Error("não deveria chamar"); }) as unknown as typeof fetch);
    expect(p.accessStatus().status).toBe("requires_authorization");
    await expect(p.collect(q)).rejects.toThrow(/X_API_BEARER_TOKEN/);
  });
  it("consultas: termos com espaço entre aspas, OR, filtro de idioma/sem repost; respeita 512 caracteres", () => {
    expect(buildQueries(["debate presidencial", "TSE"], "lang:pt -is:retweet")).toEqual([{ query: '("debate presidencial" OR TSE) lang:pt -is:retweet', terms: ["debate presidencial", "TSE"] }]);
    const many = Array.from({ length: 60 }, (_, i) => `termo${i}`);
    const qs = buildQueries(many, "lang:pt");
    expect(qs.length).toBeGreaterThan(1);
    expect(qs.every((x) => x.query.length <= 512)).toBe(true);
    expect(qs.flatMap((x) => x.terms)).toEqual(many);
  });
  it("coleta paginada: posts + métricas separadas; autor só em HMAC; respostas identificadas", async () => {
    const { f, calls } = fakeX([{ data: [post("1", "Assisti o debate presidencial"), post("2", "TSE divulga", { referenced_tweets: [{ type: "replied_to", id: "1" }], conversation_id: "1" })], meta: { next_token: "1" } }, { data: [post("3", "mais sobre o TSE")], meta: {} }]);
    const r = await new XProvider({ bearerToken: "tok", hashKey: "k" }, f, () => NOW).collect(q);
    expect(calls).toHaveLength(2);
    expect(calls[0].searchParams.get("end_time")).toBe(new Date(Math.min(Date.parse(q.until), NOW - 10_000)).toISOString());
    expect(r.partial).toBe(false);
    expect(r.quotaUsed).toBe(3);
    const posts = r.records.filter((x) => x.schema === "x.post/v1");
    expect(posts).toHaveLength(3);
    const p2 = posts.find((x) => x.externalId === "post:2")!.payload as Record<string, unknown>;
    expect(p2).toMatchObject({ replied_to: "1", matched_terms: ["TSE"] });
    expect(String(p2.author_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r.records)).not.toContain("u2");
    const n = normalize(posts.find((x) => x.externalId === "post:2")!, { mode: "live" } as never, "src-social-x");
    expect(n).toMatchObject({ type: "social_record", value: { id: "x:post:2", platform: "x", contentType: "reply", parentId: "x:post:1", rootId: "x:post:1", authorDisplayName: null } });
    const m = normalize(r.records.find((x) => x.externalId === "metrics:1")!, { mode: "live" } as never, "src-social-x");
    expect(m).toMatchObject({ type: "social_metrics", value: { metrics: { likes: 3, replies: 1, shares: 0 } } });
    expect((m.value as unknown as { metrics: Record<string, number> }).metrics).not.toHaveProperty("views"); // impressões ausentes ⇒ ausente
  });
  it("orçamento de posts esgotado ⇒ janela parcial", async () => {
    const { f } = fakeX([{ data: Array.from({ length: 10 }, (_, i) => post(String(i), "TSE")), meta: { next_token: "1" } }, { data: [post("99", "TSE")], meta: {} }]);
    const r = await new XProvider({ bearerToken: "tok", maxPosts: 10 }, f, () => NOW).collect(q);
    expect(r).toMatchObject({ partial: true, quotaUsed: 10 });
  });
  it("erros: 401 ⇒ autenticação; 429 ⇒ rate limit com reset; 402 ⇒ acesso esgotado (não retentável); 503 ⇒ indisponível", async () => {
    await expect(new XProvider({ bearerToken: "tok" }, fakeX([], 401).f, () => NOW).collect(q)).rejects.toMatchObject({ code: "authentication_required" });
    await expect(new XProvider({ bearerToken: "tok" }, fakeX([], 429, { "x-rate-limit-reset": String(NOW / 1000 + 120) }).f, () => NOW).collect(q)).rejects.toMatchObject({ code: "rate_limited" });
    await expect(new XProvider({ bearerToken: "tok" }, fakeX([], 402, { title: "CreditsDepleted" }).f, () => NOW).collect(q)).rejects.toMatchObject({ code: "rate_limited", retryable: false });
    await expect(new XProvider({ bearerToken: "tok" }, fakeX([], 503).f, () => NOW).collect(q)).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});
