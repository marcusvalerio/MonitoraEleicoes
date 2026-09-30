/**
 * FIXTURES DETERMINÍSTICAS do g1 (conteúdo FICTÍCIO). Reproduzem a forma observada na página pública:
 * dois blocos JSON-LD LiveBlogPosting (canônico e AMP) com liveBlogUpdate[] de BlogPosting,
 * url "?postId=<uuid>", barras escapadas "\/" e marcação de posts renderizada no cliente.
 */
export interface FixturePost {
  id: string;
  text: string;
  published?: string | null;
  modified?: string | null;
  headline?: string;
}
const PAGE = "https://g1.globo.com/politica/eleicoes/2026/ao-vivo/debate-ficticio.ghtml";

function blogPosting(p: FixturePost, page: string) {
  const o: Record<string, unknown> = { "@type": "BlogPosting", articleBody: p.text, author: { "@id": `${page}#publisher` }, publisher: { "@id": `${page}#publisher` }, url: `${page}?postId=${p.id}` };
  if (p.published !== null) o.datePublished = p.published ?? "2026-10-02T00:00:00.000Z";
  if (p.published !== null) o.dateModified = p.modified ?? p.published ?? "2026-10-02T00:00:00.000Z";
  if (p.headline) o.headline = p.headline;
  return o;
}

export function g1LivePage(posts: FixturePost[], page = PAGE): string {
  const live = (url: string) =>
    JSON.stringify({ "@context": "http://schema.org", "@type": "LiveBlogPosting", coverageStartTime: "2026-10-01T23:30:00.000Z", headline: "Debate fictício ao vivo", liveBlogUpdate: posts.map((p) => blogPosting(p, page)), url }).replace(/\//g, "\\/");
  return `<!doctype html><html><head><title>fixture</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Globo.com"}</script>
<script data-schema="LiveBlogPosting" type="application/ld+json">
  ${live(page)}
</script><script data-schema="LiveBlogPosting" type="application/ld+json">
  ${live(`https://g1.globo.com/google/amp/${page}`)}
</script>
<script>window.__PRELOADED_STATE__ = { live: { id: "x", liveNow: true } }</script>
</head><body><main itemscope itemtype="http://schema.org/LiveBlogPosting"><div class="cb-post-placeholder"></div></main></body></html>`;
}

export function g1MicrodataPage(posts: FixturePost[]): string {
  return `<!doctype html><html><body><main itemscope itemtype="http://schema.org/LiveBlogPosting">${posts
    .map((p) => `<article itemprop="liveBlogUpdate" itemscope itemtype="http://schema.org/BlogPosting" data-post-id="${p.id}">${p.published ? `<time itemprop="datePublished" datetime="${p.published}">x</time>` : ""}<div itemprop="articleBody"><p>${p.text}</p></div></article>`)
    .join("")}</main></body></html>`;
}

export const g1UnexpectedPage = `<!doctype html><html><body><div class="novo-layout"><p>Conteúdo reorganizado sem dados estruturados.</p></div></body></html>`;

/** Sequência realista de uma noite de debate (fictícia). */
export const FIXTURE_POSTS: FixturePost[] = [
  { id: "a0000000-0000-4000-8000-000000000001", text: "Começa o debate entre os candidatos à Presidência.", published: "2026-10-02T00:02:10.000Z" },
  { id: "a0000000-0000-4000-8000-000000000002", text: "Helena Duarte questiona Rafael Monteiro sobre segurança pública e o policiamento nas fronteiras.", published: "2026-10-02T00:14:05.000Z" },
  { id: "a0000000-0000-4000-8000-000000000003", text: "Rafael Monteiro rebate e cita investimento em hospitais do SUS.", published: "2026-10-02T00:16:40.000Z" },
  { id: "a0000000-0000-4000-8000-000000000004", text: "Intervalo. O segundo bloco começa em instantes.", published: "2026-10-02T00:31:00.000Z" },
  { id: "a0000000-0000-4000-8000-000000000005", text: "Clima tenso no estúdio; plateia se manifesta.", published: "2026-10-02T00:33:12.000Z" },
];
