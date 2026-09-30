import type { EditorialSnapshot, LiveEditorialCapabilities, LiveEditorialProvider, PageRequest, RawRecord } from "../contracts";
import { paginate } from "../contracts";
import { DEFAULT_RETRY } from "../resilience";
import { InvalidResponse, ProviderUnavailable, RateLimited } from "../errors";
import { G1_PARSER_VERSION, G1StructureError, parseG1LivePage } from "./parse";
import type { G1LivePostV1 } from "@/normalization/schemas/g1";

export const G1_PROVIDER_ID = "g1-live-editorial";
export const G1_SOURCE_ID = "src-g1-editorial";
const USER_AGENT = "MonitoraEleicoes/0.9 (+monitoramento editorial; respeita robots.txt)";

/**
 * Hosts permitidos (defesa contra SSRF: a URL vem do admin). Padrão: somente g1.globo.com via HTTPS.
 * `G1_ALLOWED_HOSTS` (servidor, lista separada por vírgula) só acrescenta hosts — usado por fixtures locais de teste.
 */
export function assertAllowedG1Url(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("URL inválida");
  }
  const extra = (process.env.G1_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isExtra = extra.includes(u.host);
  if (!isExtra && !(u.protocol === "https:" && u.host === "g1.globo.com")) throw new Error("URL fora da allowlist (somente https://g1.globo.com/…)");
  if (!isExtra && !/\/ao-vivo\//.test(u.pathname)) throw new Error("URL do g1 deve ser uma cobertura ao vivo (/ao-vivo/)");
  return u;
}

export interface G1Config {
  debateId: string;
  sourceUrl: string;
  timeoutMs?: number;
}

/**
 * G1 · cobertura editorial ao vivo. Coleta a página pública configurada, extrai as atualizações pelos
 * dados estruturados (JSON-LD LiveBlogPosting; microdata como alternativa) e devolve RAW `g1.live-post/v1`.
 * NÃO é transcrição. Sem cookies, sem autenticação, sem APIs internas, sem contornar proteção.
 */
export class G1LiveEditorialProvider implements LiveEditorialProvider {
  readonly info;
  readonly debateId: string;
  private snapshot: EditorialSnapshot | null = null;
  constructor(
    private readonly cfg: G1Config,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.debateId = cfg.debateId;
    const capabilities: LiveEditorialCapabilities = { live: true, timestamps: true, edits: true, windowed: true };
    this.info = {
      id: G1_PROVIDER_ID,
      name: "g1 · cobertura editorial ao vivo",
      kind: "media" as const,
      mode: "live" as const,
      capabilities,
      config: { requiredEnv: [], configured: !!cfg.sourceUrl, baseUrl: cfg.sourceUrl },
      rateLimit: { requestsPerWindow: 1, windowSeconds: 5, notes: "Polling mínimo de 5 s por página (configurável por fonte)." },
      retry: DEFAULT_RETRY,
      sourceId: G1_SOURCE_ID,
    };
  }

  async health() {
    try {
      await this.fetchHtml();
      return { status: "connected" as const, checkedAt: new Date(this.now()).toISOString() };
    } catch (e) {
      return { status: "offline" as const, checkedAt: new Date(this.now()).toISOString(), message: e instanceof Error ? e.message : String(e) };
    }
  }

  lastSnapshot() {
    return this.snapshot;
  }

  private async fetchHtml(): Promise<string> {
    const url = assertAllowedG1Url(this.cfg.sourceUrl);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.cfg.timeoutMs ?? 10_000);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, signal: ctl.signal, redirect: "follow", cache: "no-store" });
    } catch (e) {
      throw new ProviderUnavailable(this.info.id, ctl.signal.aborted ? `tempo esgotado (${this.cfg.timeoutMs ?? 10_000} ms)` : `falha de rede: ${(e as Error).message}`, e);
    } finally {
      clearTimeout(t);
    }
    if (res.status === 429) throw new RateLimited(this.info.id, Number(res.headers.get("retry-after")) || null);
    if (res.status >= 500) throw new ProviderUnavailable(this.info.id, `HTTP ${res.status}`);
    if (!res.ok) throw new InvalidResponse(this.info.id, `HTTP ${res.status}`);
    return res.text();
  }

  async fetchUpdates(page?: PageRequest) {
    const html = await this.fetchHtml();
    let parsed;
    try {
      parsed = parseG1LivePage(html);
    } catch (e) {
      if (e instanceof G1StructureError) throw new InvalidResponse(this.info.id, e.message);
      throw e;
    }
    const collectedAt = new Date(this.now()).toISOString();
    const recs: RawRecord<G1LivePostV1>[] = parsed.posts.map((p) => ({
      providerId: this.info.id,
      schema: "g1.live-post/v1",
      externalId: `${this.debateId}#${p.postId}`,
      sourceUrl: p.url ?? this.cfg.sourceUrl,
      publishedAt: p.publishedAt,
      collectedAt,
      // Payload estável: só conteúdo da fonte (edição na origem ⇒ novo hash ⇒ nova versão RAW)
      payload: { debate_id: this.debateId, page_url: this.cfg.sourceUrl, post_id: p.postId, headline: p.headline, text: p.text, published_at: p.publishedAt, modified_at: p.modifiedAt, url: p.url, strategy: parsed.strategy, parser_version: G1_PARSER_VERSION, fragment: p.fragment },
    }));
    const times = parsed.posts.map((p) => p.publishedAt).filter((x): x is string => !!x).sort();
    this.snapshot = { externalIds: recs.map((r) => r.externalId), windowStart: times[0] ?? null, strategy: parsed.strategy };
    return paginate(recs, { cursor: page?.cursor ?? null, limit: 500 });
  }
}
