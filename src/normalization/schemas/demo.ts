/** Esquemas RAW do provider DEMO (formato "nativo" simulado, versionado). */
export interface DemoEventV1 {
  id: string;
  title: string;
  broadcaster: string;
  office_label: string;
  election_year: number;
  round: 1 | 2;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "live" | "ended";
  participant_refs: string[];
  blocks: { id: string; label: string }[];
}
export interface DemoSegmentV1 {
  event_id: string;
  seq: number;
  speaker_ref: string;
  start_s: number;
  end_s: number;
  text: string;
  block_id: string;
  addressed_to_ref: string | null;
}
export interface DemoPartyV1 {
  id: string;
  acronym: string;
  name: string;
  number: number;
}
export interface DemoCandidateV1 {
  id: string;
  name: string;
  ballot_name: string;
  party_ref: string;
  office: string;
  initials: string;
}
export interface DemoPartyIdentityV1 {
  party_ref: string;
  acronym: string;
  color: string;
  valid_from: string;
  valid_to: string | null;
  source: string;
}
export interface DemoSocialCountV1 {
  event_id: string;
  platform: string;
  window_start_s: number;
  window_s: number;
  posts: number;
  mentions: Record<string, number>;
  topics: Record<string, number>;
}
export interface DemoSocialPostV1 {
  event_id: string;
  platform: string;
  offset_s: number;
  text: string;
  author: string;
  mentions: string[];
  topic: string | null;
  terms: string[];
}
export interface DemoRegionCountV1 {
  event_id: string;
  region_key: string;
  window_start_s: number;
  window_s: number;
  posts: number;
  location: { precision: "country" | "state" | "municipality" | "unknown"; source: "geotag" | "profile" | "text_mention" | "platform_region" | "none"; confidence: "high" | "medium" | "low" | "unknown" };
  mentions: Record<string, number>;
  topics: Record<string, number>;
}
export interface DemoArticleV1 {
  outlet: string;
  title: string;
  published_at: string;
  event_id: string | null;
  topics: string[];
}
