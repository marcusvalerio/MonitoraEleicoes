/**
 * Paleta categórica (ordem FIXA, validada com scripts de CVD contra a superfície #111113:
 * CVD ΔE ≥ 8,4 · visão normal ΔE ≥ 19,3 · contraste ≥ 3:1). Cor segue a ENTIDADE, nunca a posição/ranking.
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9", "#e66767"] as const;
export const OTHER = "#68686e";
/** Identidade fixa por plataforma (não muda quando um filtro remove outras séries). */
export const PLATFORM_COLOR: Record<string, string> = { youtube: "#e66767", bluesky: "#3987e5", reddit: "#d95926", x: "#9085e9", instagram: "#d55181", facebook: "#199e70", tiktok: "#c98500", threads: OTHER, news: OTHER };
/** Cor estável por chave (hash) dentro da paleta fixa — para séries dinâmicas (candidato/tema). */
export function colorFor(key: string, fixed?: Record<string, string>) {
  if (fixed?.[key]) return fixed[key];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SERIES[h % SERIES.length];
}
