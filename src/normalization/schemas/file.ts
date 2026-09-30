/** Esquemas RAW de providers baseados em ARQUIVO (dados reais importados manualmente). */
import type { TimingPrecision } from "@/domain/types";

export interface FileManifestV1 {
  id: string;
  title: string;
  broadcaster: string;
  jurisdiction: string;
  office: string;
  election_year: number;
  round: 1 | 2;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "live" | "ended";
  participants: string[];
  blocks: string[];
}
export interface FileCueV1 {
  event_id: string;
  seq: number;
  start_ms: number | null;
  end_ms: number | null;
  speaker_label: string | null;
  /** Resolução manual declarada no manifesto (label → nome do candidato). */
  speaker_map_target: string | null;
  attribution: "source_label" | "press_attribution";
  block_label: string | null;
  timing_precision: TimingPrecision;
  text: string;
}
export interface FilePartyV1 {
  acronym: string;
  name: string;
  number: number;
  color: string | null;
  color_source: string | null;
  valid_from: string | null;
}
export interface FileCandidateV1 {
  name: string;
  party: string;
  ballot_number: number | null;
  tse_id: string | null;
  aliases: string[];
  office: string;
}
export interface FileArticleV1 {
  outlet_and_title: string;
  published_at: string;
  event_id: string;
  document_sha256: string | null;
}
