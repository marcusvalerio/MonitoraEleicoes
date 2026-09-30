/** Esquemas RAW genéricos de transcrição AO VIVO / REPLAY (independentes da fonte). */
import type { SourceMode, TimingPrecision } from "@/domain/types";
import type { ConfidenceLevel } from "@/domain/quality";
import type { FileManifestV1 } from "./file";

/** Evento: mesmos campos do manifesto de arquivo + modo da fonte. */
export interface LiveEventV1 extends FileManifestV1 {
  source_mode: Exclude<SourceMode, "file">;
}

export interface LiveSegmentV1 {
  event_id: string;
  seq: number;
  speaker: {
    /** Rótulo como veio da fonte (legenda, STT). null = fonte não informou. */
    label: string | null;
    /** Nome resolvido declarado pela fonte/mapa. null = não resolvido. */
    name: string | null;
    confidence: ConfidenceLevel;
    source: "provider_label" | "manual_map" | "press_attribution" | "diarization" | "none";
  };
  text: string;
  /** Segundos desde o início do evento; null quando a fonte não informa. */
  start_offset_s: number | null;
  end_offset_s: number | null;
  timing_precision: TimingPrecision;
  source_mode: Exclude<SourceMode, "file">;
  /** Instante da fala segundo a fonte (ISO) — null se desconhecido. */
  source_time: string | null;
  /** Confiança da transcrição (0–1), se a fonte fornecer. */
  asr_confidence: number | null;
  block_label: string | null;
  /** Rastro da origem quando o segmento é reprodução de outro registro. */
  replay_of?: { provider_id: string; external_id: string; original_start_ms: number | null } | null;
}
