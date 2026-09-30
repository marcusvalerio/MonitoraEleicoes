import type { SocialPlatform } from "@/domain/types";

/** Catálogo de plataformas e nível real de acesso às APIs (não é igual entre elas). */
export const PLATFORMS: SocialPlatform[] = [
  { id: "x", name: "X", access: "limited", notes: "API paga; volume e busca limitados por plano." },
  { id: "youtube", name: "YouTube", access: "full", notes: "Data API v3: comentários e chat ao vivo com cotas." },
  { id: "tiktok", name: "TikTok", access: "restricted", notes: "Research API restrita a pesquisadores aprovados." },
  { id: "instagram", name: "Instagram", access: "restricted", notes: "Conteúdo público via APIs oficiais com restrições." },
  { id: "facebook", name: "Facebook", access: "restricted", notes: "Conteúdo público via ferramentas de pesquisa da Meta." },
  { id: "threads", name: "Threads", access: "limited", notes: "API recente, cobertura parcial." },
  { id: "telegram", name: "Telegram", access: "none", notes: "Não implementado." },
];
