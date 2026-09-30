/**
 * FIXTURE da YouTube Data API v3 — mesmas formas de resposta documentadas (search/videos/commentThreads),
 * conteúdo FICTÍCIO. Simula cota, comentários desativados e likeCount oculto. Somente testes.
 */
export interface FakeVideo {
  id: string;
  title: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt: string;
  live?: boolean;
  stats?: Record<string, string>;
  comments?: { id: string; text: string; author: string; publishedAt: string; likes?: number; replies?: { id: string; text: string; author: string; publishedAt: string }[] }[];
  commentsDisabled?: boolean;
  terms: string[];
}

export function fakeYouTube(videos: FakeVideo[], o: { quotaExceeded?: boolean; invalidKey?: boolean } = {}) {
  const calls: string[] = [];
  const f = (async (input: URL | string) => {
    const u = new URL(String(input));
    const ep = u.pathname.split("/").pop()!;
    calls.push(ep);
    const err = (status: number, reason: string) => new Response(JSON.stringify({ error: { code: status, errors: [{ reason }] } }), { status });
    if (o.invalidKey) return err(400, "keyInvalid");
    if (o.quotaExceeded) return err(403, "quotaExceeded");
    if (ep === "search") {
      const q = u.searchParams.get("q")!;
      const after = u.searchParams.get("publishedAfter");
      const before = u.searchParams.get("publishedBefore");
      const items = videos
        .filter((v) => v.terms.includes(q) && (!after || v.publishedAt >= after) && (!before || v.publishedAt < before))
        .map((v) => ({ id: { kind: "youtube#video", videoId: v.id }, snippet: { publishedAt: v.publishedAt, channelId: v.channelId ?? "UC-ficticio", title: v.title, description: v.description ?? "", channelTitle: v.channelTitle ?? "Canal Fictício", liveBroadcastContent: v.live ? "live" : "none" } }));
      return new Response(JSON.stringify({ items }), { status: 200 });
    }
    if (ep === "videos") {
      const ids = (u.searchParams.get("id") ?? "").split(",");
      return new Response(JSON.stringify({ items: videos.filter((v) => ids.includes(v.id)).map((v) => ({ id: v.id, statistics: v.stats ?? {} })) }), { status: 200 });
    }
    if (ep === "commentThreads") {
      const v = videos.find((x) => x.id === u.searchParams.get("videoId"));
      if (v?.commentsDisabled) return err(403, "commentsDisabled");
      return new Response(
        JSON.stringify({
          items: (v?.comments ?? []).map((c) => ({
            id: c.id,
            snippet: { totalReplyCount: c.replies?.length ?? 0, topLevelComment: { id: c.id, snippet: { textOriginal: c.text, authorChannelId: { value: c.author }, authorDisplayName: "Pessoa Comentarista", likeCount: c.likes ?? 0, publishedAt: c.publishedAt, updatedAt: c.publishedAt } } },
            replies: { comments: (c.replies ?? []).map((r) => ({ id: r.id, snippet: { textOriginal: r.text, authorChannelId: { value: r.author }, authorDisplayName: "Outra Pessoa", likeCount: 0, publishedAt: r.publishedAt } })) },
          })),
        }),
        { status: 200 },
      );
    }
    return err(404, "notFound");
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

/** Noite de debate fictícia: candidatos Helena Duarte / Rafael Monteiro (fictícios). */
export const FX_YT_VIDEOS: FakeVideo[] = [
  {
    id: "vid00000001",
    title: "Debate presidencial: Helena Duarte e Rafael Monteiro discutem segurança pública",
    description: "Cobertura do debate. Policiamento e fronteiras no centro da discussão.",
    channelTitle: "Canal de Notícias Fictício",
    publishedAt: "2026-10-02T00:10:00Z",
    stats: { viewCount: "1200", likeCount: "80", commentCount: "3" },
    terms: ["debate presidencial", "Helena Duarte"],
    comments: [
      { id: "c1", text: "Vou votar na Helena Duarte, gostei das propostas para o SUS.", author: "UCa", publishedAt: "2026-10-02T00:20:00Z", likes: 5, replies: [{ id: "c1r1", text: "Não voto no Rafael Monteiro de jeito nenhum.", author: "UCb", publishedAt: "2026-10-02T00:22:00Z" }] },
      { id: "c2", text: "Eu gosto do debate, mas não gosto do candidato Rafael Monteiro.", author: "UCc", publishedAt: "2026-10-02T00:25:00Z" },
      { id: "c3", text: "Alguém sabe o que a Helena Duarte propôs sobre escolas em SP?", author: "UCd", publishedAt: "2026-10-02T00:30:00Z" },
    ],
  },
  {
    id: "vid00000002",
    title: "AO VIVO: repercussão do debate",
    channelTitle: "Canal de Análise Fictício",
    publishedAt: "2026-10-02T00:40:00Z",
    live: true,
    stats: { viewCount: "5400", commentCount: "0" }, // likeCount oculto pelo canal
    terms: ["debate presidencial"],
    commentsDisabled: true,
  },
];
