import { createHmac } from "node:crypto";
import type { RawRecord, SocialCollectResult, SocialListeningCapabilities, SocialListeningProvider, SocialListeningQuery } from "../contracts";
import { AuthenticationRequired, InvalidResponse, ProviderError, ProviderUnavailable, RateLimited } from "../errors";
import { DEFAULT_RETRY } from "../resilience";

/**
 * YOUTUBE · Data API v3 (oficial) — https://developers.google.com/youtube/v3/docs
 * Endpoints e custo de cota (documentação oficial; cota padrão 10 000 unidades/dia por projeto):
 *   search.list         part=snippet, type=video, q, publishedAfter/Before, order=date, regionCode=BR   100 unidades
 *   videos.list         part=snippet,statistics (até 50 ids)                                            1 unidade
 *   commentThreads.list part=snippet,replies, videoId, order=time, textFormat=plainText (até 100)       1 unidade
 * Autor: guardamos só HMAC do channelId; nome exibido apenas do canal publicador (vídeo/live), nunca de comentaristas.
 * Métricas: só as que a API devolve (likeCount pode ser ocultado pelo canal ⇒ ausente, nunca 0).
 * Sem chave (YOUTUBE_API_KEY) ⇒ requires_authorization. Nada de scraping.
 */
export const YOUTUBE_PROVIDER_ID = "youtube-data-api";
const API = "https://www.googleapis.com/youtube/v3";
const COST = { search: 100, videos: 1, comments: 1 } as const;

export interface YouTubeConfig {
  apiKey?: string;
  /** Segredo para HMAC de autores. */
  hashKey?: string;
  /** Cota máxima por coleta (unidades). Padrão 1 500 (≈ 6 execuções/dia completas dentro das 10 000). */
  budget?: number;
  maxVideos?: number;
  commentsPerVideo?: number;
  timeoutMs?: number;
}

export interface YouTubeVideoV1 {
  video_id: string;
  channel_id: string | null;
  channel_title: string | null;
  title: string;
  description: string;
  published_at: string | null;
  live_broadcast: string | null;
  matched_terms: string[];
}
/** Métricas públicas em registro separado (pequeno): a variação de contagens não duplica o RAW do vídeo. */
export interface YouTubeVideoStatsV1 {
  video_id: string;
  statistics: Record<string, string>;
}
export interface YouTubeCommentV1 {
  comment_id: string;
  video_id: string;
  parent_id: string | null;
  author_channel_id: string | null;
  text: string;
  published_at: string | null;
  updated_at: string | null;
  like_count: number | null;
  reply_count: number | null;
}

export class YouTubeProvider implements SocialListeningProvider {
  readonly info;
  constructor(
    private readonly cfg: YouTubeConfig = {},
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    const capabilities: SocialListeningCapabilities = { search: true, comments: true, replies: true, engagement: true, realtime: "polling", historical: true, author: true, permalink: true, media: true };
    this.info = {
      id: YOUTUBE_PROVIDER_ID,
      platform: "youtube",
      name: "YouTube · Data API v3",
      kind: "social" as const,
      mode: "live" as const,
      capabilities,
      config: { requiredEnv: ["YOUTUBE_API_KEY"], configured: !!cfg.apiKey, baseUrl: API },
      rateLimit: { requestsPerWindow: 10_000, windowSeconds: 86_400, notes: "Cota diária em unidades (search = 100, videos/commentThreads = 1)." },
      retry: DEFAULT_RETRY,
      sourceId: "src-social-youtube",
      docsUrl: "https://developers.google.com/youtube/v3/docs",
    };
  }

  accessStatus() {
    return this.cfg.apiKey ? { status: "configured" as const, reason: "chave configurada (validar com 'testar')" } : { status: "requires_authorization" as const, reason: "YOUTUBE_API_KEY ausente" };
  }

  async health() {
    try {
      await this.get("videos", { part: "id", id: "dQw4w9WgXcQ" });
      return { status: "connected" as const, checkedAt: new Date(this.now()).toISOString() };
    } catch (e) {
      return { status: "offline" as const, checkedAt: new Date(this.now()).toISOString(), message: (e as Error).message };
    }
  }

  private hash(v: string | null | undefined) {
    return v && this.cfg.hashKey ? createHmac("sha256", this.cfg.hashKey).update(`yt:${v}`).digest("hex") : null;
  }

  private async get(endpoint: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    if (!this.cfg.apiKey) throw new AuthenticationRequired(this.info.id, "YOUTUBE_API_KEY ausente");
    const url = new URL(`${API}/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", this.cfg.apiKey);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.cfg.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    } catch (e) {
      throw new ProviderUnavailable(this.info.id, ctl.signal.aborted ? "tempo esgotado" : `falha de rede: ${(e as Error).message}`, e);
    } finally {
      clearTimeout(t);
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return body;
    const reason = ((body.error as { errors?: { reason?: string }[] })?.errors?.[0]?.reason ?? "") as string;
    // Mensagens da API nunca contêm a chave; ainda assim não repassamos a URL.
    // Cota DIÁRIA esgotada: não adianta repetir no mesmo dia (não retentável). Limite de taxa: retentável com backoff.
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new ProviderError("rate_limited", this.info.id, "cota diária da YouTube Data API esgotada", { retryable: false });
    if (reason === "rateLimitExceeded" || res.status === 429) throw new RateLimited(this.info.id, null);
    if (reason === "commentsDisabled") throw Object.assign(new InvalidResponse(this.info.id, "comentários desativados no vídeo"), { reason });
    if (res.status === 400 || res.status === 401 || reason === "keyInvalid" || reason === "forbidden" || reason === "accessNotConfigured") throw new AuthenticationRequired(this.info.id, `acesso negado pela API (${reason || res.status})`);
    if (res.status >= 500) throw new ProviderUnavailable(this.info.id, `HTTP ${res.status}`);
    throw new InvalidResponse(this.info.id, `HTTP ${res.status} ${reason}`);
  }

  /**
   * Coleta uma janela: busca vídeos por termo (mais recentes primeiro), métricas públicas e comentários recentes.
   * Respeita o orçamento de cota; se acabar antes do fim, devolve `partial = true` (janela parcial, nunca "completa").
   */
  async collect(q: SocialListeningQuery): Promise<SocialCollectResult> {
    const budget = q.budget ?? this.cfg.budget ?? 1500;
    let used = 0;
    let partial = false;
    const collectedAt = new Date(this.now()).toISOString();
    const videos = new Map<string, { snippet: Record<string, unknown>; terms: Set<string> }>();
    const maxVideos = this.cfg.maxVideos ?? 50;
    for (const term of q.terms) {
      let pageToken: string | undefined;
      do {
        if (used + COST.search > budget || videos.size >= maxVideos) {
          partial = true;
          break;
        }
        const r = await this.get("search", { part: "snippet", type: "video", q: term, order: "date", publishedAfter: q.since, publishedBefore: q.until, maxResults: "50", regionCode: "BR", relevanceLanguage: "pt", ...(pageToken ? { pageToken } : {}) });
        used += COST.search;
        for (const it of (r.items as Record<string, unknown>[]) ?? []) {
          const id = (it.id as { videoId?: string })?.videoId;
          if (!id) continue;
          const v = videos.get(id) ?? { snippet: it.snippet as Record<string, unknown>, terms: new Set<string>() };
          v.terms.add(term);
          videos.set(id, v);
        }
        pageToken = r.nextPageToken as string | undefined;
      } while (pageToken && videos.size < maxVideos);
    }
    const ids = [...videos.keys()].slice(0, maxVideos);
    const stats = new Map<string, Record<string, string>>();
    for (let i = 0; i < ids.length; i += 50) {
      if (used + COST.videos > budget) {
        partial = true;
        break;
      }
      const r = await this.get("videos", { part: "statistics", id: ids.slice(i, i + 50).join(",") });
      used += COST.videos;
      for (const it of (r.items as Record<string, unknown>[]) ?? []) stats.set(it.id as string, (it.statistics as Record<string, string>) ?? {});
    }
    const records: RawRecord[] = [];
    for (const id of ids) {
      const s = videos.get(id)!.snippet;
      const payload: YouTubeVideoV1 = {
        video_id: id,
        channel_id: this.hash(s.channelId as string),
        channel_title: (s.channelTitle as string) ?? null,
        title: (s.title as string) ?? "",
        description: (s.description as string) ?? "",
        published_at: (s.publishedAt as string) ?? null,
        live_broadcast: (s.liveBroadcastContent as string) ?? null,
        matched_terms: [...videos.get(id)!.terms].sort(),
      };
      records.push({ providerId: this.info.id, schema: "youtube.video/v1", externalId: `video:${id}`, sourceUrl: `https://www.youtube.com/watch?v=${id}`, publishedAt: payload.published_at, collectedAt, payload });
      if (stats.has(id)) {
        const sp: YouTubeVideoStatsV1 = { video_id: id, statistics: stats.get(id)! };
        records.push({ providerId: this.info.id, schema: "youtube.video-stats/v1", externalId: `stats:${id}`, sourceUrl: `https://www.youtube.com/watch?v=${id}`, publishedAt: null, collectedAt, payload: sp });
      }
    }
    for (const id of ids) {
      if (used + COST.comments > budget) {
        partial = true;
        break;
      }
      let r: Record<string, unknown>;
      try {
        r = await this.get("commentThreads", { part: "snippet,replies", videoId: id, order: "time", maxResults: String(this.cfg.commentsPerVideo ?? 50), textFormat: "plainText" });
      } catch (e) {
        if ((e as { reason?: string }).reason === "commentsDisabled") continue; // estado do vídeo, não falha
        throw e;
      }
      used += COST.comments;
      for (const th of (r.items as Record<string, unknown>[]) ?? []) {
        const top = (th.snippet as { topLevelComment?: { id: string; snippet: Record<string, unknown> }; totalReplyCount?: number })?.topLevelComment;
        if (!top) continue;
        const push = (cid: string, sn: Record<string, unknown>, parent: string | null, replies: number | null) => {
          const payload: YouTubeCommentV1 = {
            comment_id: cid,
            video_id: id,
            parent_id: parent,
            author_channel_id: this.hash((sn.authorChannelId as { value?: string })?.value),
            text: ((sn.textOriginal ?? sn.textDisplay) as string) ?? "",
            published_at: (sn.publishedAt as string) ?? null,
            updated_at: (sn.updatedAt as string) ?? null,
            like_count: typeof sn.likeCount === "number" ? sn.likeCount : null,
            reply_count: replies,
          };
          records.push({ providerId: this.info.id, schema: "youtube.comment/v1", externalId: `comment:${cid}`, sourceUrl: `https://www.youtube.com/watch?v=${id}&lc=${cid}`, publishedAt: payload.published_at, collectedAt, payload });
        };
        push(top.id, top.snippet, null, (th.snippet as { totalReplyCount?: number }).totalReplyCount ?? null);
        for (const rep of ((th.replies as { comments?: { id: string; snippet: Record<string, unknown> }[] })?.comments ?? [])) push(rep.id, rep.snippet, top.id, null);
      }
    }
    return { records, quotaUsed: used, partial };
  }
}
