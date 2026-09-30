import type { SourceMode, SpeechClassification, TranscriptSegment } from "./types";

/**
 * ESTADO AO VIVO (derivado, nunca inventado).
 * Latências só são calculadas quando os instantes existem; caso contrário `null` ("—" na UI).
 *   captura     = coletado − fim da fala na fonte       (só fonte realmente ao vivo)
 *   ingestão    = gravado no banco − coletado
 *   análise     = analisado − gravado
 *   processamento = analisado − coletado                 (o que o sistema controla)
 *   ponta a ponta = analisado − fim da fala na fonte    (só fonte realmente ao vivo)
 * Em REPLAY o "fim da fala" é sintético: captura e ponta a ponta não se aplicam.
 */
export interface LatencySample {
  sourceMode: SourceMode | null;
  sourceEnd: string | null;
  collectedAt: string | null;
  ingestedAt: string | null;
  processedAt: string | null;
}
export interface LiveLatency {
  captureS: number | null;
  ingestionS: number | null;
  analysisS: number | null;
  processingS: number | null;
  endToEndS: number | null;
  /** Nº de segmentos recentes usados (mediana). */
  sample: number;
}

const diff = (a: string | null, b: string | null) => (a && b ? (Date.parse(a) - Date.parse(b)) / 1000 : null);
function median(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) * 100) / 100;
}

export function computeLatency(samples: LatencySample[]): LiveLatency {
  const live = samples.filter((s) => s.sourceMode === "live");
  return {
    captureS: median(live.map((s) => diff(s.collectedAt, s.sourceEnd))),
    ingestionS: median(samples.map((s) => diff(s.ingestedAt, s.collectedAt))),
    analysisS: median(samples.map((s) => diff(s.processedAt, s.ingestedAt))),
    processingS: median(samples.map((s) => diff(s.processedAt, s.collectedAt))),
    endToEndS: median(live.map((s) => diff(s.processedAt, s.sourceEnd))),
    sample: samples.length,
  };
}

export type ControlState = "scheduled" | "preparing" | "connecting" | "live" | "paused" | "finished" | "processing" | "archived" | "error";
export type Connection = "online" | "stale" | "connecting" | "paused" | "finished" | "not_started" | "error" | "unknown";

/** Sem batimento do worker há mais de STALE_S segundos ⇒ "sem sinal" (não fingimos que está online). */
export const STALE_S = 15;

export function connectionStatus(control: { status: ControlState; lastHeartbeatAt: string | null } | null, nowMs: number): Connection {
  if (!control) return "unknown";
  switch (control.status) {
    case "live":
      return control.lastHeartbeatAt && (nowMs - Date.parse(control.lastHeartbeatAt)) / 1000 <= STALE_S ? "online" : "stale";
    case "connecting":
    case "preparing":
      return "connecting";
    case "paused":
      return "paused";
    case "finished":
    case "processing":
    case "archived":
      return "finished";
    case "error":
      return "error";
    default:
      return "not_started";
  }
}

export interface LiveControlInfo {
  status: ControlState;
  sourceMode: SourceMode;
  speed: number | null;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

export interface LiveState {
  debateId: string;
  title: string;
  /** Modo da fonte dos segmentos (null = desconhecido, ex.: perfil demo). */
  sourceMode: SourceMode | null;
  control: LiveControlInfo | null;
  connection: Connection;
  totals: { segments: number; analyzed: number };
  latency: LiveLatency;
  /** Somente segmentos com seq > cursor pedido (incremental). */
  segments: TranscriptSegment[];
  classifications: SpeechClassification[];
  /** Cursor para a próxima consulta. */
  lastSeq: number;
  /** Cobertura editorial (ex.: g1) — nunca transcrição. Incremental por `editorialCursor` (inclui edições e remoções). */
  editorial: import("./editorial").EditorialItem[];
  editorialCursor: number;
  editorialTotal: number;
  /** Nomes atuais das entidades (leitura direta; evita nomes defasados logo após a 1ª coleta). */
  candidates?: { id: string; name: string; color: string }[];
  serverTime: string;
}
