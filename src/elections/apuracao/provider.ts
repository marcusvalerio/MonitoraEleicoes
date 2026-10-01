import { assertAllowedUrl, configUrl } from "./config";
import { sha256 } from "./normalize";

/**
 * Provider OFICIAL da apuração (arquivos públicos do sistema de divulgação do TSE). Somente GET em resultados.tse.jus.br,
 * sem autenticação, respeitando falhas: 404 = "ainda não publicado" (nunca vira 0), 5xx/rede = erro com retentativa.
 */
export const COUNT_PROVIDER_ID = "tse-divulgacao";
export const COUNT_SOURCE_ID = "src-tse-divulgacao";
export const COUNT_SCHEMA = "tse.divulga.u/v1";

export type FetchResult = { status: "ok"; url: string; body: string; json: unknown; sha256: string; etag: string | null; lastModified: string | null } | { status: "not_published"; url: string; httpStatus: number };

export interface CountProviderOptions {
  timeoutMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class TseCountProvider {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly o: CountProviderOptions = {},
  ) {}

  async fetchConfig(): Promise<unknown> {
    const r = await this.get(configUrl());
    if (r.status !== "ok") throw new Error(`configuração oficial indisponível (HTTP ${r.httpStatus})`);
    return r.json;
  }

  async get(url: string): Promise<FetchResult> {
    assertAllowedUrl(url);
    const retries = this.o.retries ?? 2;
    const sleep = this.o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    let last: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(this.o.timeoutMs ?? 15_000), headers: { accept: "application/json" } });
        if (res.status === 404 || res.status === 403) return { status: "not_published", url, httpStatus: res.status };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        if (body.length > 20_000_000) throw new Error("arquivo acima do limite de 20 MB");
        return { status: "ok", url, body, json: JSON.parse(body), sha256: sha256(body), etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified") };
      } catch (e) {
        last = e;
        if (e instanceof SyntaxError) break; // JSON inválido: não adianta repetir
        if (attempt < retries) await sleep(500 * 2 ** attempt);
      }
    }
    throw new Error(`falha ao obter ${url}: ${last instanceof Error ? last.message : String(last)}`);
  }
}
