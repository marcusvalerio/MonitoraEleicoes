/**
 * Parsers de ARQUIVO de transcrição → cues brutos (antes da normalização).
 * Formatos: VTT, SRT, TXT, JSON, CSV. Nenhum parser inventa tempo ou orador:
 * ausência vira `null` e é tratada adiante (precisão temporal / speakerConfidence).
 */
export interface FileCue {
  seq: number;
  startMs: number | null;
  endMs: number | null;
  speakerLabel: string | null;
  block: string | null;
  text: string;
}

export type TranscriptFormat = "vtt" | "srt" | "txt" | "json" | "csv";

export class TranscriptParseError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`linha ${line}: ${message}`);
  }
}

/** "00:01:02.500", "01:02,5", "62.5" → ms */
export function parseTimestamp(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const [, h, mi, s, ms] = m;
  return ((Number(h ?? 0) * 60 + Number(mi)) * 60 + Number(s)) * 1000 + Number((ms ?? "0").padEnd(3, "0"));
}

/** Extrai orador de "<v Nome>texto", "NOME: texto" ou "[Nome] texto". */
export function splitSpeaker(text: string): { speaker: string | null; text: string } {
  const v = text.match(/^<v(?:\.[^ >]+)?\s+([^>]+)>\s*([\s\S]*?)(?:<\/v>)?$/);
  if (v) return { speaker: v[1].trim(), text: v[2].trim() };
  const b = text.match(/^\[([^\]]{2,60})\]\s*([\s\S]+)$/);
  if (b) return { speaker: b[1].trim(), text: b[2].trim() };
  const c = text.match(/^([A-ZÀ-Ý][A-Za-zÀ-ÿ'.\- ]{1,50}):\s+([\s\S]+)$/);
  if (c && !/^https?$/i.test(c[1])) return { speaker: c[1].trim(), text: c[2].trim() };
  return { speaker: null, text: text.trim() };
}

function parseCueBlocks(src: string, kind: "vtt" | "srt"): FileCue[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: FileCue[] = [];
  let i = kind === "vtt" ? 1 : 0;
  if (kind === "vtt" && !/^WEBVTT/.test(lines[0] ?? "")) throw new TranscriptParseError(1, "arquivo VTT sem cabeçalho WEBVTT");
  while (i < lines.length) {
    while (i < lines.length && !lines[i].includes("-->")) i++;
    if (i >= lines.length) break;
    const [a, b] = lines[i].split("-->").map((x) => x.trim().split(/\s+/)[0]);
    const startMs = parseTimestamp(a);
    const endMs = parseTimestamp(b);
    if (startMs === null || endMs === null) throw new TranscriptParseError(i + 1, `timestamp inválido: ${lines[i]}`);
    i++;
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") body.push(lines[i++].trim());
    const { speaker, text } = splitSpeaker(body.join(" "));
    if (text) out.push({ seq: out.length + 1, startMs, endMs, speakerLabel: speaker, block: null, text });
  }
  return out;
}

/** TXT: "[hh:mm:ss] NOME: texto" (tempo opcional); "## Bloco" define o bloco corrente. */
function parseTxt(src: string): FileCue[] {
  const out: FileCue[] = [];
  let block: string | null = null;
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      block = h[1].trim();
      continue;
    }
    const t = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]\s*(.*)$/);
    const startMs = t ? parseTimestamp(t[1]) : null;
    const { speaker, text } = splitSpeaker(t ? t[2] : line);
    if (!speaker && out.length && startMs === null) {
      out[out.length - 1].text += ` ${text}`; // continuação do turno anterior
      continue;
    }
    out.push({ seq: out.length + 1, startMs, endMs: null, speakerLabel: speaker, block, text });
  }
  return out;
}

/** JSON: array de { speaker, text, start?, end?, block? } (start/end em s ou "hh:mm:ss"). */
function parseJson(src: string): FileCue[] {
  let data: unknown;
  try {
    data = JSON.parse(src);
  } catch {
    throw new TranscriptParseError(1, "JSON inválido");
  }
  const arr = Array.isArray(data) ? data : (data as { segments?: unknown[] })?.segments;
  if (!Array.isArray(arr)) throw new TranscriptParseError(1, "esperado array de segmentos");
  return arr.map((x, i) => {
    const o = x as Record<string, unknown>;
    if (typeof o.text !== "string" || !o.text.trim()) throw new TranscriptParseError(i + 1, "segmento sem texto");
    const ts = (v: unknown) => (typeof v === "number" ? Math.round(v * 1000) : typeof v === "string" ? parseTimestamp(v) : null);
    return { seq: i + 1, startMs: ts(o.start), endMs: ts(o.end), speakerLabel: typeof o.speaker === "string" ? o.speaker : null, block: typeof o.block === "string" ? o.block : null, text: o.text.trim() };
  });
}

/** CSV com cabeçalho: speaker,start,end,text[,block] (aspas duplas suportadas). */
function parseCsv(src: string): FileCue[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const idx = (k: string) => head.findIndex((h) => h.trim().toLowerCase() === k);
  if (idx("text") < 0) throw new TranscriptParseError(1, "coluna 'text' ausente");
  return body.map((r, i) => ({
    seq: i + 1,
    speakerLabel: idx("speaker") >= 0 ? r[idx("speaker")]?.trim() || null : null,
    startMs: idx("start") >= 0 ? parseTimestamp(r[idx("start")] ?? "") : null,
    endMs: idx("end") >= 0 ? parseTimestamp(r[idx("end")] ?? "") : null,
    block: idx("block") >= 0 ? r[idx("block")]?.trim() || null : null,
    text: (r[idx("text")] ?? "").trim(),
  })).filter((c) => c.text);
}

export function detectFormat(fileName: string): TranscriptFormat {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "vtt" || ext === "srt" || ext === "txt" || ext === "json" || ext === "csv") return ext;
  throw new Error(`formato não suportado: .${ext}`);
}

export function parseTranscript(content: string, format: TranscriptFormat): FileCue[] {
  switch (format) {
    case "vtt":
      return parseCueBlocks(content, "vtt");
    case "srt":
      return parseCueBlocks(content, "srt");
    case "txt":
      return parseTxt(content);
    case "json":
      return parseJson(content);
    case "csv":
      return parseCsv(content);
  }
}
