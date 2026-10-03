import { createHmac } from "node:crypto";
import type { RawRecord, SocialCollectResult, SocialListeningCapabilities, SocialListeningProvider, SocialListeningQuery } from "../contracts";
import { AuthenticationRequired, InvalidResponse, ProviderError, ProviderUnavailable, RateLimited } from "../errors";
import { DEFAULT_RETRY } from "../resilience";

/**
 * X · API v2 (oficial) — https://docs.x.com/x-api/posts/search/introduction
 *   GET /2/tweets/search/recent   query (≤ 512 caracteres), start_time/end_time (últimos 7 dias), max_results 10–100, next_token
 *   Autenticação: Bearer token do app (X_API_BEARER_TOKEN). Acesso é PAGO (cobrança por post lido) e limitado por janela (15 min).
 * Orçamento por execução (X_MAX_POSTS_PER_RUN, padrão 500 posts): esgotado ⇒ janela PARCIAL, nunca "completa".
 * Autor: só HMAC do author_id (sem @, sem nome). Métricas: só public_metrics devolvidas (ausente ⇒ ausente, nunca 0).
 * Sem token ⇒ requires_authorization. Nada de scraping, endpoints privados ou contorno de limite.
 */
export const X_PROVIDER_ID = "x-api-v2";
const API = "https://api.x.com/2";
const MAX_QUERY = 512;

export interface XConfig {
  bearerToken?: string;
  hashKey?: string;
  /** Máximo de posts lidos por execução (controle de custo). */
  maxPosts?: number;
  timeoutMs?: number;
  /** Filtro adicional da busca (padrão: português, sem reposts). */
  queryFilter?: string;
}

export interface XPostV1 {
  post_id: string;
  author_hash: string | null;
  text: string;
  created_at: string | null;
  lang: string | null;
  conversation_id: string | null;
  replied_to: string | null;
  quoted: string | null;
  matched_terms: string[];
}
/** Métricas públicas em registro separado: variação de contagens não duplica o RAW do post. */
export interface XPostMetricsV1 {
  post_id: string;
  public_metrics: Record<string, number>;
}

/** Agrupa termos em consultas OR de até 512 caracteres (termos com espaço entre aspas). */
export function buildQueries(terms: string[], filter: string): { query: string; terms: string[] }[] {
  const out: { query: string; terms: string[] }[] = [];
  let cur: string[] = [];
  const q = (ts: string[]) => `(${ts.map((t) => (/\s/.test(t) ? `"${t.replaceAll('"', "")}"` : t)).join(" OR ")}) ${filter}`.trim();
  for (const t of terms.map((x) => x.trim()).filter(Boolean)) {
    if (q([t]).length > MAX_QUERY) throw new InvalidResponse(X_PROVIDER_ID, `termo excede o limite de consulta: ${t.slice(0, 40)}…`);
    if (cur.length && q([...cur, t]).length > MAX_QUERY) {
      out.push({ query: q(cur), terms: cur });
      cur = [];
    }
    cur.push(t);
  }
  if (cur.length) out.push({ query: q(cur), terms: cur });
  return out;
}

export class XProvider implements SocialListeningProvider {
  readonly info;
  constructor(
    private readonly cfg: XConfig = {},
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    const capabilities: SocialListeningCapabilities = { search: true, comments: false, replies: true, engagement: true, realtime: "polling", historical: false, author: true, permalink: true, media: false };
    this.info = {
      id: X_PROVIDER_ID,
      platform: "x",
      name: "X · API v2 (busca recente)",
      kind: "social" as const,
      mode: "live" as const,
      capabilities,
      config: { requiredEnv: ["X_API_BEARER_TOKEN"], configured: !!cfg.bearerToken, baseUrl: API },
      rateLimit: { requestsPerWindow: null, windowSeconds: 900, notes: "Limites e custo dependem do plano contratado (janela de 15 min; cobrança por post lido)." },
      retry: DEFAULT_RETRY,
      sourceId: "src-social-x",
      docsUrl: "https://docs.x.com/x-api/posts/search/introduction",
    };
  }

  accessStatus() {
    return this.cfg.bearerToken ? { status: "configured" as const, reason: "token configurado (validar com 'testar')" } : { status: "requires_authorization" as const, reason: "X_API_BEARER_TOKEN ausente (acesso pago à API v2)" };
  }

  async health() {
    const at = new Date(this.now()).toISOString();
    try {
      // consulta mínima (10 posts, última hora) — consome cota/créditos mínimos
      await this.get("tweets/search/recent", { query: "eleições lang:pt -is:retweet", max_results: "10", start_time: new Date(this.now() - 3_600_000).toISOString() });
      return { status: "connected" as const, checkedAt: at };
    } catch (e) {
      return { status: (e instanceof AuthenticationRequired ? "not_configured" : "offline") as "not_configured" | "offline", checkedAt: at, message: (e as Error).message };
    }
  }

  private hash(v: string | null | undefined) {
    return v && this.cfg.hashKey ? createHmac("sha256", this.cfg.hashKey).update(`x:${v}`).digest("hex") : null;
  }

  private async get(endpoint: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    if (!this.cfg.bearerToken) throw new AuthenticationRequired(this.info.id, "X_API_BEARER_TOKEN ausente");
    const url = new URL(`${API}/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 15_000), headers: { authorization: `Bearer ${this.cfg.bearerToken}`, accept: "application/json" } });
    } catch (e) {
      throw new ProviderUnavailable(this.info.id, `falha de rede: ${(e as Error).message}`, e);
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return body;
    const title = String((body.title as string) ?? (body.errors as { title?: string }[] | undefined)?.[0]?.title ?? "");
    if (res.status === 429) {
      const reset = Number(res.headers.get("x-rate-limit-reset"));
      throw new RateLimited(this.info.id, Number.isFinite(reset) && reset > 0 ? Math.max(1, Math.round(reset - this.now() / 1000)) : null);
    }
    // Créditos/plano esgotados: não adianta repetir.
    if (res.status === 402 || /credit|usage cap|client-not-enrolled/i.test(title)) throw new ProviderError("rate_limited", this.info.id, `acesso à API esgotado ou não habilitado (${title || res.status})`, { retryable: false });
    if (res.status === 401 || res.status === 403) throw new AuthenticationRequired(this.info.id, `acesso negado pela API (${title || res.status})`);
    if (res.status >= 500) throw new ProviderUnavailable(this.info.id, `HTTP ${res.status}`);
    throw new InvalidResponse(this.info.id, `HTTP ${res.status} ${title}`.trim());
  }

  async collect(q: SocialListeningQuery): Promise<SocialCollectResult> {
    const maxPosts = q.budget ?? this.cfg.maxPosts ?? 500;
    const collectedAt = new Date(this.now()).toISOString();
    // API: start_time ≥ agora − 7 dias; end_time ≤ agora − 10 s
    const minStart = this.now() - 7 * 86_400_000 + 60_000;
    const since = new Date(Math.max(Date.parse(q.since), minStart)).toISOString();
    const until = new Date(Math.min(Date.parse(q.until), this.now() - 10_000)).toISOString();
    let partial = Date.parse(q.since) < minStart;
    const posts = new Map<string, { p: Record<string, unknown>; terms: Set<string> }>();
    let read = 0;
    for (const { query, terms } of buildQueries(q.terms, this.cfg.queryFilter ?? "lang:pt -is:retweet")) {
      let next: string | undefined;
      do {
        if (read >= maxPosts) {
          partial = true;
          break;
        }
        const r = await this.get("tweets/search/recent", {
          query,
          start_time: since,
          end_time: until,
          max_results: String(Math.max(10, Math.min(100, maxPosts - read))),
          "tweet.fields": "created_at,lang,conversation_id,referenced_tweets,public_metrics,author_id",
          ...(next ? { next_token: next } : {}),
        });
        const data = (r.data as Record<string, unknown>[]) ?? [];
        read += data.length;
        for (const it of data) {
          const id = String(it.id);
          const cur = posts.get(id) ?? { p: it, terms: new Set<string>() };
          // termo casado de fato no texto (a consulta é OR)
          for (const t of terms) if (String(it.text ?? "").toLowerCase().includes(t.toLowerCase())) cur.terms.add(t);
          posts.set(id, cur);
        }
        next = (r.meta as { next_token?: string } | undefined)?.next_token;
      } while (next);
    }
    const records: RawRecord[] = [];
    for (const [id, { p, terms }] of posts) {
      const refs = (p.referenced_tweets as { type: string; id: string }[] | undefined) ?? [];
      const payload: XPostV1 = {
        post_id: id,
        author_hash: this.hash(p.author_id as string),
        text: String(p.text ?? ""),
        created_at: (p.created_at as string) ?? null,
        lang: (p.lang as string) ?? null,
        conversation_id: (p.conversation_id as string) ?? null,
        replied_to: refs.find((x) => x.type === "replied_to")?.id ?? null,
        quoted: refs.find((x) => x.type === "quoted")?.id ?? null,
        matched_terms: [...terms].sort(),
      };
      const url = `https://x.com/i/web/status/${id}`;
      records.push({ providerId: this.info.id, schema: "x.post/v1", externalId: `post:${id}`, sourceUrl: url, publishedAt: payload.created_at, collectedAt, payload });
      if (p.public_metrics && typeof p.public_metrics === "object") {
        const m: XPostMetricsV1 = { post_id: id, public_metrics: p.public_metrics as Record<string, number> };
        records.push({ providerId: this.info.id, schema: "x.post-metrics/v1", externalId: `metrics:${id}`, sourceUrl: url, publishedAt: null, collectedAt, payload: m });
      }
    }
    return { records, quotaUsed: read, partial };
  }
}
