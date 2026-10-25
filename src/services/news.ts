import "server-only";

/**
 * NOTÍCIAS — feeds RSS públicos e gratuitos dos portais validados pelo editor (g1, Folha, Estadão, UOL).
 * Só manchete, horário, resumo curto do próprio feed e link para a matéria original (o texto fica no portal).
 * Incluir portal novo = acrescentar aqui DEPOIS de validação editorial.
 */
export interface NewsSource {
  id: string;
  name: string;
  feed: string;
  home: string;
}
export const NEWS_SOURCES: NewsSource[] = [
  { id: "g1", name: "g1", feed: "https://g1.globo.com/rss/g1/politica/eleicoes/", home: "https://g1.globo.com/politica/eleicoes/" },
  { id: "folha", name: "Folha de S.Paulo", feed: "https://feeds.folha.uol.com.br/poder/rss091.xml", home: "https://www1.folha.uol.com.br/poder/" },
  { id: "estadao", name: "Estadão", feed: "https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/eleicoes/", home: "https://www.estadao.com.br/politica/eleicoes/" },
  { id: "uol", name: "UOL", feed: "https://rss.uol.com.br/feed/noticias.xml", home: "https://noticias.uol.com.br/" },
];

export interface NewsItem {
  source: string;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m)));
const text = (s: string | undefined) => {
  if (!s) return null;
  const raw = s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  const t = decodeEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return t || null;
};
const tag = (block: string, name: string) => new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block)?.[1];

/** Decodifica o corpo respeitando o encoding declarado no XML (a Folha publica em ISO-8859-1). */
export function decodeFeed(buf: ArrayBuffer): string {
  const head = new TextDecoder("latin1").decode(buf.slice(0, 200));
  const enc = /encoding=["']([\w-]+)["']/i.exec(head)?.[1]?.toLowerCase() ?? "utf-8";
  return new TextDecoder(enc === "iso-8859-1" || enc === "latin1" || enc === "windows-1252" ? "windows-1252" : "utf-8").decode(buf);
}

export function parseRss(xml: string, source: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = text(tag(b, "title"));
    const url = text(tag(b, "link")) ?? text(tag(b, "guid"));
    if (!title || !url || !/^https?:\/\//.test(url)) continue;
    const d = text(tag(b, "pubDate")) ?? text(tag(b, "dc:date"));
    const t = d ? Date.parse(d) : NaN;
    const summary = text(tag(b, "description"));
    out.push({ source, title, url, publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : null, summary: summary ? summary.slice(0, 240) : null });
  }
  return out;
}

export async function fetchNews(): Promise<{ items: NewsItem[]; failed: string[] }> {
  const failed: string[] = [];
  const lists = await Promise.all(
    NEWS_SOURCES.map(async (s) => {
      try {
        const r = await fetch(s.feed, { headers: { "user-agent": "MonitoraEleicoes/1.0 (+leitor de RSS)" }, signal: AbortSignal.timeout(8000), next: { revalidate: 300 } });
        if (!r.ok) throw new Error(String(r.status));
        return parseRss(decodeFeed(await r.arrayBuffer()), s.id);
      } catch {
        failed.push(s.id);
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const items = lists.flat().filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
  items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return { items, failed };
}

/** Filtro "só eleição" — palavras-chave simples e transparentes (não classifica tom nem lado). */
export const ELECTION_RE = /elei[çc][ãa]o|eleitor|urna|apura[çc][ãa]o|turno|tse|candidat|vot(o|a[çc][ãa]o|ar)|presid[êe]ncia|campanha|lula|fl[áa]vio|bolsonaro|governador|senado/i;
