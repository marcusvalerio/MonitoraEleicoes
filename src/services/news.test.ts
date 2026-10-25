import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decodeFeed, parseRss } from "./news";

describe("leitor de RSS de notícias", () => {
  it("lê CDATA, entidades, data e descarta itens sem link", () => {
    const xml = `<rss><channel><title>Canal</title>
      <item><title><![CDATA[Apuração &amp; <b>2º turno</b>]]></title><link>https://g1.globo.com/a.ghtml</link><pubDate>Sun, 25 Oct 2026 20:00:00 -0300</pubDate><description>Resumo &quot;x&quot;</description></item>
      <item><title>Sem link</title></item></channel></rss>`;
    const it = parseRss(xml, "g1");
    expect(it).toHaveLength(1);
    expect(it[0]).toMatchObject({ source: "g1", title: "Apuração & 2º turno", url: "https://g1.globo.com/a.ghtml", publishedAt: "2026-10-25T23:00:00.000Z", summary: 'Resumo "x"' });
  });
  it("respeita ISO-8859-1 declarado (Folha)", () => {
    const head = '<?xml version="1.0" encoding="ISO-8859-1"?><rss><item><title>Elei';
    const bytes = new Uint8Array([...Buffer.from(head, "latin1"), 0xe7, 0xe3, ...Buffer.from("o</title><link>https://f.com/x</link></item></rss>", "latin1")]);
    expect(parseRss(decodeFeed(bytes.buffer), "folha")[0].title).toBe("Eleição");
  });
});
