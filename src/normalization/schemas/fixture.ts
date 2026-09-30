/**
 * Esquemas RAW do provider FIXTURE (alternativo). Formatos deliberadamente
 * diferentes do DEMO — tempos em ms/ISO, referências por NOME, rótulos em texto —
 * para provar que o domínio independe do formato de origem.
 */
export interface FixtureShowV2 {
  show_id: string;
  name: string;
  network: string;
  race: { office: string; year: number; round: number };
  scheduled: { start: string; end: string };
  on_air: boolean;
  finished: boolean;
  lineup: string[]; // nomes completos
}
export interface FixtureCueV2 {
  show_id: string;
  cue_id: string;
  start_ms: number;
  end_ms: number;
  speaker: string; // "HELENA DUARTE" | "MODERAÇÃO"
  section: string; // rótulo do bloco
  target: string | null; // nome
  caption: string;
}
export interface FixturePartyV2 {
  code: string;
  short: string;
  full_name: string;
  ballot_number: string;
  brand: { hex: string; since: string; until: string | null; ref: string };
}
export interface FixtureCandidateV2 {
  code: string;
  full_name: string;
  party_code: string;
}
export interface FixtureVolumeV2 {
  show_id: string;
  platform_name: string; // "YouTube", "X"…
  window: { start: string; end: string };
  total: number;
  by_entity: { name: string; count: number }[];
  by_topic: { label: string; count: number }[];
}
export interface FixtureRegionalV2 {
  show_id: string;
  uf: string; // "RJ"
  city: string | null; // "Niterói" | null
  window: { start: string; end: string };
  count: number;
  geo: { method: "gps" | "bio" | "mention"; score: number };
  by_entity: { name: string; count: number }[];
  by_topic: { label: string; count: number }[];
}
