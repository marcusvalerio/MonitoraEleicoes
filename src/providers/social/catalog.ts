import type { SocialAccessStatus, SocialListeningCapabilities, SocialListeningProvider } from "../contracts";
import { AuthenticationRequired } from "../errors";
import { DEFAULT_RETRY } from "../resilience";

/**
 * MATRIZ DE PLATAFORMAS (pesquisa de 30/09/2026 — documentação oficial + teste de acesso deste ambiente).
 * Só é "active" o que foi conectado e validado. O dashboard mostra exatamente este estado.
 */
export interface PlatformEntry {
  platform: string;
  name: string;
  api: string;
  docsUrl: string;
  auth: string;
  cost: string;
  capabilities: SocialListeningCapabilities;
  /** Estado quando não há provider implementado/credencial. */
  defaultStatus: SocialAccessStatus;
  limitations: string;
  probe: string;
}
const caps = (c: Partial<SocialListeningCapabilities>): SocialListeningCapabilities => ({ search: false, comments: false, replies: false, engagement: false, realtime: false, historical: false, author: false, permalink: false, media: false, ...c });

export const PLATFORM_MATRIX: PlatformEntry[] = [
  { platform: "youtube", name: "YouTube", api: "YouTube Data API v3", docsUrl: "https://developers.google.com/youtube/v3/docs", auth: "API key (Google Cloud)", cost: "gratuito dentro da cota (10 000 unidades/dia; search = 100)", capabilities: caps({ search: true, comments: true, replies: true, engagement: true, realtime: "polling", historical: true, author: true, permalink: true, media: true }), defaultStatus: "requires_authorization", limitations: "Cota diária limita buscas; likeCount pode ser ocultado; chat ao vivo não coletado nesta fase.", probe: "HTTP 403 sem chave ('unregistered callers')" },
  { platform: "bluesky", name: "Bluesky", api: "AT Protocol (app.bsky.feed.searchPosts)", docsUrl: "https://docs.bsky.app/", auth: "conta + app password", cost: "gratuito", capabilities: caps({ search: true, comments: true, replies: true, engagement: true, realtime: "polling", historical: true, author: true, permalink: true }), defaultStatus: "requires_authorization", limitations: "Busca pública passou a exigir autenticação; provider ainda não implementado.", probe: "HTTP 403 no AppView público" },
  { platform: "reddit", name: "Reddit", api: "Reddit Data API (OAuth)", docsUrl: "https://www.reddit.com/dev/api/", auth: "app OAuth registrado", cost: "gratuito não comercial; uso comercial exige acordo", capabilities: caps({ search: true, comments: true, replies: true, engagement: true, realtime: "polling", historical: true, permalink: true }), defaultStatus: "requires_authorization", limitations: "~100 req/min por cliente OAuth; termos de uso comercial.", probe: "HTTP 403 sem OAuth" },
  { platform: "x", name: "X", api: "X API v2 (search/recent)", docsUrl: "https://docs.x.com/", auth: "Bearer token de plano pago", cost: "pago", capabilities: caps({ search: true, replies: true, engagement: true, realtime: "polling", historical: false, author: true, permalink: true }), defaultStatus: "requires_authorization", limitations: "Busca recente limitada por plano; custo elevado.", probe: "HTTP 401 sem token" },
  { platform: "instagram", name: "Instagram", api: "Instagram Graph API / Meta Content Library", docsUrl: "https://developers.facebook.com/docs/instagram-platform", auth: "app revisado + conta profissional ou acesso de pesquisador", cost: "—", capabilities: caps({ search: false, comments: false, engagement: true, permalink: true }), defaultStatus: "requires_authorization", limitations: "Hashtag search restrita a contas profissionais do próprio app; comentários só em mídia própria.", probe: "HTTP 400 sem token" },
  { platform: "facebook", name: "Facebook", api: "Graph API / Meta Content Library", docsUrl: "https://developers.facebook.com/docs/graph-api", auth: "revisão de app (Page Public Content Access) ou pesquisador aprovado", cost: "—", capabilities: caps({ engagement: true, permalink: true }), defaultStatus: "requires_authorization", limitations: "Conteúdo público de páginas exige permissão revisada.", probe: "HTTP 400 sem token" },
  { platform: "tiktok", name: "TikTok", api: "TikTok Research API", docsUrl: "https://developers.tiktok.com/products/research-api/", auth: "pesquisador acadêmico aprovado", cost: "—", capabilities: caps({ search: true, comments: true, engagement: true, historical: true }), defaultStatus: "unsupported", limitations: "Elegibilidade restrita (pesquisa acadêmica); não disponível para este projeto.", probe: "HTTP 404 sem credencial" },
  { platform: "threads", name: "Threads", api: "Threads API (keyword search)", docsUrl: "https://developers.facebook.com/docs/threads", auth: "revisão de app (threads_keyword_search)", cost: "—", capabilities: caps({ search: true, engagement: true, permalink: true }), defaultStatus: "requires_authorization", limitations: "Permissão de busca exige revisão da Meta.", probe: "não testado" },
];

/** Provider "sem acesso": nunca coleta, nunca finge — explica o motivo. */
export class UnavailableSocialProvider implements SocialListeningProvider {
  readonly info;
  constructor(private readonly e: PlatformEntry) {
    this.info = { id: `${e.platform}-unavailable`, platform: e.platform, name: e.name, kind: "social" as const, mode: "live" as const, capabilities: e.capabilities, config: { requiredEnv: [], configured: false }, rateLimit: { requestsPerWindow: null, windowSeconds: null }, retry: DEFAULT_RETRY, sourceId: `src-social-${e.platform}`, docsUrl: e.docsUrl };
  }
  accessStatus() {
    return { status: this.e.defaultStatus, reason: this.e.limitations };
  }
  async health() {
    return { status: "not_configured" as const, checkedAt: new Date().toISOString(), message: this.e.limitations };
  }
  async collect(): Promise<never> {
    throw new AuthenticationRequired(this.info.id, `${this.e.name}: ${this.e.defaultStatus} — ${this.e.limitations}`);
  }
}
