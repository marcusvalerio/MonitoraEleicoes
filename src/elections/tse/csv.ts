import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

/** CSV do TSE: separador ";", campos entre aspas (podem conter quebras de linha), codificação latin1. Streaming. */
export function parseTseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ";") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur.replace(/\r$/, ""));
  return out;
}

/** Valores que o TSE usa para "não divulgável"/"nulo" ⇒ null (nunca 0). */
export const tseNull = (v: string | undefined) => (v === undefined || v === "" || v === "-1" || v === "-3" || v === "-4" || v === "#NULO" || v === "#NULO#" || v === "#NE" || v === "NÃO DIVULGÁVEL" ? null : v);

export async function* tseRows(input: Readable): AsyncGenerator<Record<string, string>> {
  input.setEncoding("latin1");
  const rl = createInterface({ input, crlfDelay: Infinity });
  let header: string[] | null = null;
  let buf: string | null = null;
  for await (const raw of rl) {
    // Campo entre aspas com quebra de linha (ex.: metodologia de pesquisas): junta até fechar as aspas.
    buf = buf === null ? raw : `${buf}\n${raw}`;
    if ((buf.match(/"/g)?.length ?? 0) % 2 === 1) continue;
    const line = buf;
    buf = null;
    if (!line) continue;
    const cells = parseTseLine(line);
    if (!header) {
      header = cells;
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    yield row;
  }
}
