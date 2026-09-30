import type { SocialPlatform } from "@/domain/types";
import type { SocialProvider, SocialSearchQuery } from "../types";
import { getDemoDataset } from "@/data/demo/generate";

export const PLATFORMS: SocialPlatform[] = [
  { id: "x", name: "X", access: "limited", notes: "API paga; volume e busca limitados por plano." },
  { id: "youtube", name: "YouTube", access: "full", notes: "Data API v3: comentários e chat ao vivo com cotas." },
  { id: "tiktok", name: "TikTok", access: "restricted", notes: "Research API restrita a pesquisadores aprovados." },
  { id: "instagram", name: "Instagram", access: "restricted", notes: "Conteúdo público via APIs oficiais com restrições." },
  { id: "facebook", name: "Facebook", access: "restricted", notes: "Conteúdo público via ferramentas de pesquisa da Meta." },
  { id: "threads", name: "Threads", access: "limited", notes: "API recente, cobertura parcial." },
  { id: "telegram", name: "Telegram", access: "none", notes: "Não implementado no MVP." },
];

/** Provider social DEMO. Cada plataforma real terá adapter próprio (XProvider, YouTubeProvider…). */
export class MockSocialProvider implements SocialProvider {
  readonly id = "mock-social";
  readonly mode = "demo" as const;
  platforms() {
    return PLATFORMS;
  }
  async search(q: SocialSearchQuery) {
    const ds = getDemoDataset();
    let posts = ds.posts.filter(
      (p) =>
        (q.from === undefined || p.offset >= q.from) &&
        (q.to === undefined || p.offset <= q.to) &&
        (!q.platforms || q.platforms.includes(p.platform)) &&
        (!q.candidateId || p.mentionsCandidateIds.includes(q.candidateId)),
    );
    const total = posts.length;
    posts = posts.slice(-(q.limit ?? 50));
    return { posts, total, platform: "all" as const, caveats: ["DEMO DATA — publicações fictícias."] };
  }
  async metrics(q: SocialSearchQuery & { bucketSize: number }) {
    return getDemoDataset().metrics.filter(
      (m) =>
        (q.from === undefined || m.bucketStart >= q.from) &&
        (q.to === undefined || m.bucketStart + m.bucketSize <= q.to) &&
        (!q.platforms || q.platforms.includes(m.platform)),
    );
  }
  async health() {
    return { status: "ok" as const, checkedAt: new Date().toISOString(), message: "DEMO" };
  }
}
