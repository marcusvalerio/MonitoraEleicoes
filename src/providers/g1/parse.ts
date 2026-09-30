/**
 * EXTRAÇÃO de atualizações da cobertura ao vivo do g1 — função pura (testável com fixtures).
 *
 * Estratégias, em ordem (a primeira que reconhecer a página vence; documentado em docs/G1-PROVIDER.md):
 *   1. "json-ld"   — <script type="application/ld+json"> com @type LiveBlogPosting → liveBlogUpdate[] (BlogPosting:
 *                    articleBody, headline, datePublished, dateModified, url?postId=…). Dado estruturado público (schema.org).
 *   2. "microdata" — elementos itemprop="liveBlogUpdate" com itemprop="articleBody" e <time datetime> / itemprop="datePublished".
 * Não usamos seletores CSS de layout nem APIs internas; `window.__PRELOADED_STATE__` foi avaliado e NÃO contém os posts.
 * Página sem nenhuma estrutura reconhecida ⇒ erro controlado (nunca "0 atualizações" silencioso).
 */
export const G1_PARSER_VERSION = "g1-parse/1.0.0";

export interface G1Post {
  postId: string;
  headline: string | null;
  text: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  url: string | null;
  /** Fragmento original relevante (JSON do BlogPosting ou HTML do post), limitado a 20 KB. */
  fragment: string;
}
export interface G1ParseResult {
  strategy: "json-ld" | "microdata";
  pageHeadline: string | null;
  coverageStartTime: string | null;
  posts: G1Post[];
}
export class G1StructureError extends Error {}

const MAX_FRAGMENT = 20_000;
const isoOrNull = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
export const cleanText = (s: string) => decode(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

function postIdFrom(url: string | null, fallback: unknown): string | null {
  if (url) {
    try {
      const id = new URL(url).searchParams.get("postId");
      if (id) return id;
    } catch {
      /* url inválida: tenta @id */
    }
  }
  return typeof fallback === "string" && fallback ? fallback : null;
}

function jsonLd(html: string): G1ParseResult | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const lives: Record<string, unknown>[] = [];
  for (const b of blocks) {
    let d: unknown;
    try {
      d = JSON.parse(b);
    } catch {
      continue; // bloco JSON-LD malformado: ignora este bloco
    }
    const items = Array.isArray(d) ? d : [d];
    for (const it of items) if (it && typeof it === "object" && (it as Record<string, unknown>)["@type"] === "LiveBlogPosting") lives.push(it as Record<string, unknown>);
  }
  if (!lives.length) return null;
  // Páginas trazem variantes (canônica e AMP); preferimos a canônica (url sem /google/amp/) e unimos posts por id.
  lives.sort((a, b) => Number(String(a.url ?? "").includes("/amp/")) - Number(String(b.url ?? "").includes("/amp/")));
  const posts = new Map<string, G1Post>();
  for (const l of lives) {
    const updates = Array.isArray(l.liveBlogUpdate) ? (l.liveBlogUpdate as Record<string, unknown>[]) : [];
    for (const u of updates) {
      if (!u || typeof u !== "object") continue;
      const url = typeof u.url === "string" ? u.url : null;
      const text = typeof u.articleBody === "string" ? cleanText(u.articleBody) : "";
      const headline = typeof u.headline === "string" && u.headline.trim() ? cleanText(u.headline) : null;
      const id = postIdFrom(url, u["@id"]);
      if (!id || posts.has(id)) continue;
      const fragment = JSON.stringify(u).slice(0, MAX_FRAGMENT);
      posts.set(id, { postId: id, headline, text, publishedAt: isoOrNull(u.datePublished), modifiedAt: isoOrNull(u.dateModified), url, fragment });
    }
  }
  const main = lives[0];
  return { strategy: "json-ld", pageHeadline: typeof main.headline === "string" ? cleanText(main.headline) : null, coverageStartTime: isoOrNull(main.coverageStartTime), posts: [...posts.values()] };
}

function microdata(html: string): G1ParseResult | null {
  const starts = [...html.matchAll(/<(article|div|li|section)\b[^>]*itemprop=["']liveBlogUpdate["'][^>]*>/gi)];
  if (!starts.length) return null;
  const posts: G1Post[] = [];
  starts.forEach((m, i) => {
    const from = m.index!;
    const to = i + 1 < starts.length ? starts[i + 1].index! : Math.min(html.length, from + MAX_FRAGMENT * 2);
    const frag = html.slice(from, to);
    const idAttr = /\b(?:data-post-id|id)=["']([^"']+)["']/i.exec(m[0])?.[1] ?? null;
    const body = /itemprop=["']articleBody["'][^>]*>([\s\S]*?)<\/(?:div|p|section|span)>/i.exec(frag)?.[1] ?? null;
    const time = /itemprop=["']datePublished["'][^>]*(?:content|datetime)=["']([^"']+)["']/i.exec(frag)?.[1] ?? /<time[^>]*datetime=["']([^"']+)["']/i.exec(frag)?.[1] ?? null;
    const modified = /itemprop=["']dateModified["'][^>]*(?:content|datetime)=["']([^"']+)["']/i.exec(frag)?.[1] ?? null;
    const headline = /itemprop=["']headline["'][^>]*>([\s\S]*?)<\//i.exec(frag)?.[1] ?? null;
    if (!idAttr || body === null) return;
    posts.push({ postId: idAttr, headline: headline ? cleanText(headline) : null, text: cleanText(body), publishedAt: isoOrNull(time), modifiedAt: isoOrNull(modified), url: null, fragment: frag.slice(0, MAX_FRAGMENT) });
  });
  return { strategy: "microdata", pageHeadline: null, coverageStartTime: null, posts };
}

export function parseG1LivePage(html: string): G1ParseResult {
  const r = jsonLd(html) ?? microdata(html);
  if (!r) throw new G1StructureError("estrutura inesperada: nenhum LiveBlogPosting (JSON-LD) nem microdata liveBlogUpdate encontrado");
  return r;
}
