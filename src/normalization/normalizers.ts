import type { Candidate, Debate, MediaArticle, Party, SocialMetric, SocialPost, TopicId, TranscriptSegment } from "@/domain/types";
import { MODERATOR_SPEAKER_ID } from "@/domain/types";
import type { PartyVisualIdentity } from "@/domain/identity";
import { NEUTRAL_ENTITY_COLOR } from "@/domain/identity";
import type { RecordRef } from "@/domain/provenance";
import type { ConfidenceLevel } from "@/domain/quality";
import { confidenceLevel } from "@/domain/quality";
import type { GeoMetric } from "@/geo/types";
import { getRegion } from "@/geo/reference";
import { NormalizationError } from "@/providers/errors";
import type { RawRecord } from "@/providers/contracts";
import type * as D from "./schemas/demo";
import type * as F from "./schemas/fixture";
import type { NormalizationContext } from "./context";

/**
 * NORMALIZADORES — um por esquema de origem. Entram registros brutos, saem entidades
 * de domínio. Registros inválidos lançam NormalizationError (contabilizados, nunca
 * "corrigidos" silenciosamente).
 */
export type Normalized =
  | { type: "debate"; value: Debate; blocks: { id: string; label: string }[] }
  | { type: "segment"; value: TranscriptSegment }
  | { type: "party"; value: Party; identity?: PartyVisualIdentity }
  | { type: "candidate"; value: Candidate }
  | { type: "identity"; value: PartyVisualIdentity }
  | { type: "social_metric"; value: SocialMetric }
  | { type: "social_post"; value: SocialPost }
  | { type: "geo_metric"; value: GeoMetric }
  | { type: "article"; value: MediaArticle }
  | { type: "editorial_update"; value: EditorialUpdate };

import type { EditorialUpdate } from "@/domain/editorial";
import { payloadHash } from "@/domain/provenance";

type Fn = (r: RawRecord, ctx: NormalizationContext, sourceId: string) => Normalized;

const ref = (r: RawRecord): RecordRef => ({ recordId: `${r.providerId}:${r.externalId}`, externalId: r.externalId, providerId: r.providerId });
const fail = (r: RawRecord, msg: string, field: string | null = null): never => {
  throw new NormalizationError(r.providerId, r.externalId, msg, field);
};
const nonNeg = (r: RawRecord, v: unknown, field: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) fail(r, `${field} deve ser número ≥ 0`, field);
  return v as number;
};
const str = (r: RawRecord, v: unknown, field: string): string => {
  if (typeof v !== "string" || !v.trim()) fail(r, `${field} ausente`, field);
  return v as string;
};
const isoOk = (r: RawRecord, v: unknown, field: string): string => {
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) fail(r, `${field} não é data ISO`, field);
  return v as string;
};
function mapCounts(r: RawRecord, m: Record<string, number>, resolve: (k: string) => string | null, field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m ?? {})) {
    const id = resolve(k);
    if (!id) continue; // entidade não reconhecida: ignorada (não inventamos atribuição)
    out[id] = (out[id] ?? 0) + nonNeg(r, v, `${field}.${k}`);
  }
  return out;
}
function checkSegmentTimes(r: RawRecord, start: number, end: number) {
  if (!(end > start) || start < 0) fail(r, "intervalo de tempo inválido (fim ≤ início)", "time");
}

// ───────── DEMO ─────────

const demoEvent: Fn = (r, ctx, sourceId) => {
  const p = r.payload as D.DemoEventV1;
  const value: Debate = {
    id: str(r, p.id, "id"),
    title: str(r, p.title, "title"),
    broadcaster: p.broadcaster,
    officeLabel: p.office_label,
    electionYear: p.election_year,
    round: p.round,
    startsAt: isoOk(r, p.starts_at, "starts_at"),
    endsAt: isoOk(r, p.ends_at, "ends_at"),
    status: p.status,
    participantIds: p.participant_refs.map((x) => ctx.candidateByRef(x) ?? fail(r, `participante não resolvido: ${x}`, "participant_refs")),
    sourceIds: [sourceId],
    mode: ctx.mode,
  };
  return { type: "debate", value, blocks: p.blocks };
};

const demoSegment: Fn = (r, ctx, sourceId) => {
  const p = r.payload as D.DemoSegmentV1;
  checkSegmentTimes(r, p.start_s, p.end_s);
  const speaker = ctx.speakerByRef(p.speaker_ref) ?? fail(r, `orador não resolvido: ${p.speaker_ref}`, "speaker_ref");
  return {
    type: "segment",
    value: {
      id: r.externalId,
      debateId: p.event_id,
      seq: p.seq,
      speakerId: speaker,
      startOffset: p.start_s,
      endOffset: p.end_s,
      text: str(r, p.text, "text"),
      blockId: p.block_id,
      addressedToId: ctx.candidateByRef(p.addressed_to_ref),
      provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) },
    },
  };
};

const demoParty: Fn = (r, ctx, sourceId) => {
  const p = r.payload as D.DemoPartyV1;
  return { type: "party", value: { id: str(r, p.id, "id"), acronym: str(r, p.acronym, "acronym"), name: p.name, number: p.number, provenance: { nature: "official", sourceId, mode: ctx.mode, record: ref(r) } } };
};

const demoCandidate: Fn = (r, ctx, sourceId) => {
  const p = r.payload as D.DemoCandidateV1;
  if (!ctx.parties.has(p.party_ref)) fail(r, `partido desconhecido: ${p.party_ref}`, "party_ref");
  return {
    type: "candidate",
    value: { id: str(r, p.id, "id"), name: str(r, p.name, "name"), ballotName: p.ballot_name, partyId: p.party_ref, officeId: p.office, initials: p.initials, swatch: NEUTRAL_ENTITY_COLOR, provenance: { nature: "official", sourceId, mode: ctx.mode, record: ref(r) } },
  };
};

const demoIdentity: Fn = (r) => {
  const p = r.payload as D.DemoPartyIdentityV1;
  if (!/^#[0-9a-f]{6}$/i.test(p.color)) fail(r, "cor inválida", "color");
  return { type: "identity", value: { partyId: p.party_ref, acronym: p.acronym, color: p.color, validFrom: p.valid_from, validTo: p.valid_to, source: p.source } };
};

const demoCount: Fn = (r, ctx, sourceId) => {
  const p = r.payload as D.DemoSocialCountV1;
  const platform = ctx.platformByName(p.platform) ?? fail(r, `plataforma desconhecida: ${p.platform}`, "platform");
  return {
    type: "social_metric",
    value: {
      platform,
      bucketStart: nonNeg(r, p.window_start_s, "window_start_s"),
      bucketSize: nonNeg(r, p.window_s, "window_s"),
      posts: nonNeg(r, p.posts, "posts"),
      mentionsByCandidate: mapCounts(r, p.mentions, (k) => ctx.candidateByRef(k), "mentions"),
      byTopic: mapCounts(r, p.topics, (k) => ctx.topicByLabel(k), "topics") as Partial<Record<TopicId, number>>,
      provenance: { nature: "collected", sourceId: `${sourceId}-${platform}`, mode: ctx.mode, record: ref(r) },
    },
  };
};

const demoPost: Fn = (r, ctx, sourceId) => {
  const p = r.payload as D.DemoSocialPostV1;
  return {
    type: "social_post",
    value: {
      id: r.externalId,
      platform: ctx.platformByName(p.platform) ?? fail(r, "plataforma desconhecida", "platform"),
      offset: nonNeg(r, p.offset_s, "offset_s"),
      text: p.text,
      authorHandle: p.author,
      mentionsCandidateIds: p.mentions.map((m) => ctx.candidateByRef(m)).filter((x): x is string => !!x),
      topic: ctx.topicByLabel(p.topic),
      terms: p.terms,
      url: r.sourceUrl,
      provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) },
    },
  };
};

const demoRegion: Fn = (r, ctx, sourceId) => {
  const p = r.payload as D.DemoRegionCountV1;
  if (!getRegion(p.region_key)) fail(r, `território desconhecido: ${p.region_key}`, "region_key");
  return {
    type: "geo_metric",
    value: {
      regionKey: p.region_key,
      bucketStart: nonNeg(r, p.window_start_s, "window_start_s"),
      bucketSize: nonNeg(r, p.window_s, "window_s"),
      posts: nonNeg(r, p.posts, "posts"),
      mentionsByCandidate: mapCounts(r, p.mentions, (k) => ctx.candidateByRef(k), "mentions"),
      byTopic: mapCounts(r, p.topics, (k) => ctx.topicByLabel(k), "topics") as Partial<Record<TopicId, number>>,
      location: { precision: p.location.precision, source: p.location.source, confidence: p.location.confidence },
      provenance: { nature: "collected", sourceId: "src-demo-geo", mode: ctx.mode, record: ref(r) },
    },
  };
  void sourceId;
};

const demoArticle: Fn = (r, ctx, sourceId) => {
  const p = r.payload as D.DemoArticleV1;
  return {
    type: "article",
    value: {
      id: r.externalId,
      outlet: str(r, p.outlet, "outlet"),
      title: str(r, p.title, "title"),
      url: r.sourceUrl,
      publishedAt: isoOk(r, p.published_at, "published_at"),
      debateId: p.event_id,
      topics: p.topics.map((t) => ctx.topicByLabel(t)).filter((t): t is TopicId => !!t),
      provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) },
    },
  };
};

// ───────── FIXTURE ─────────

const fxParty: Fn = (r, ctx, sourceId) => {
  const p = r.payload as F.FixturePartyV2;
  const number = Number(p.ballot_number);
  if (!Number.isInteger(number)) fail(r, "número de urna inválido", "ballot_number");
  return {
    type: "party",
    value: { id: str(r, p.code, "code"), acronym: str(r, p.short, "short"), name: p.full_name, number, provenance: { nature: "official", sourceId, mode: ctx.mode, record: ref(r) } },
    identity: { partyId: p.code, acronym: p.short, color: p.brand.hex, validFrom: p.brand.since, validTo: p.brand.until, source: p.brand.ref },
  };
};

const fxCandidate: Fn = (r, ctx, sourceId) => {
  const p = r.payload as F.FixtureCandidateV2;
  const partyId = ctx.partyByRef(p.party_code) ?? fail(r, `partido desconhecido: ${p.party_code}`, "party_code");
  const initials = p.full_name.split(" ").filter(Boolean).map((w) => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase();
  return {
    type: "candidate",
    value: { id: str(r, p.code, "code"), name: str(r, p.full_name, "full_name"), ballotName: p.full_name, partyId, officeId: "presidente", initials, swatch: NEUTRAL_ENTITY_COLOR, provenance: { nature: "official", sourceId, mode: ctx.mode, record: ref(r) } },
  };
};

const fxShow: Fn = (r, ctx, sourceId) => {
  const p = r.payload as F.FixtureShowV2;
  const round = p.race.round === 2 ? 2 : 1;
  const value: Debate = {
    id: str(r, p.show_id, "show_id"),
    title: str(r, p.name, "name"),
    broadcaster: p.network,
    officeLabel: p.race.office,
    electionYear: p.race.year,
    round,
    startsAt: isoOk(r, p.scheduled.start, "scheduled.start"),
    endsAt: isoOk(r, p.scheduled.end, "scheduled.end"),
    status: p.finished ? "ended" : p.on_air ? "live" : "scheduled",
    participantIds: p.lineup.map((n) => ctx.candidateByRef(n) ?? fail(r, `participante não resolvido: ${n}`, "lineup")),
    sourceIds: [sourceId],
    mode: ctx.mode,
  };
  return { type: "debate", value, blocks: [] };
};

const fxCue: Fn = (r, ctx, sourceId) => {
  const p = r.payload as F.FixtureCueV2;
  checkSegmentTimes(r, p.start_ms, p.end_ms);
  const speaker = ctx.speakerByRef(p.speaker) ?? fail(r, `orador não resolvido: ${p.speaker}`, "speaker");
  const ev = ctx.events.get(p.show_id) ?? fail(r, `evento desconhecido: ${p.show_id}`, "show_id");
  let blockId = ev.blocks.get(p.section);
  if (!blockId) {
    blockId = `b${ev.blocks.size}`;
    ev.blocks.set(p.section, blockId);
  }
  return {
    type: "segment",
    value: {
      id: r.externalId,
      debateId: p.show_id,
      seq: Number(p.cue_id.replace(/\D/g, "")) || 0,
      speakerId: speaker,
      startOffset: p.start_ms / 1000,
      endOffset: p.end_ms / 1000,
      text: str(r, p.caption, "caption"),
      blockId,
      addressedToId: speaker === MODERATOR_SPEAKER_ID ? null : ctx.candidateByRef(p.target),
      provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) },
    },
  };
};

const fxCounts = (r: RawRecord, ctx: NormalizationContext, entities: { name: string; count: number }[], topics: { label: string; count: number }[]) => ({
  mentionsByCandidate: mapCounts(r, Object.fromEntries(entities.map((e) => [e.name, e.count])), (k) => ctx.candidateByRef(k), "by_entity"),
  byTopic: mapCounts(r, Object.fromEntries(topics.map((t) => [t.label, t.count])), (k) => ctx.topicByLabel(k) ?? (k === "Outros" ? "outros" : null), "by_topic") as Partial<Record<TopicId, number>>,
});

const fxVolume: Fn = (r, ctx, sourceId) => {
  const p = r.payload as F.FixtureVolumeV2;
  const platform = ctx.platformByName(p.platform_name) ?? fail(r, `plataforma desconhecida: ${p.platform_name}`, "platform_name");
  const start = ctx.eventOffset(p.show_id, isoOk(r, p.window.start, "window.start")) ?? fail(r, "evento desconhecido", "show_id");
  const end = ctx.eventOffset(p.show_id, isoOk(r, p.window.end, "window.end"))!;
  return {
    type: "social_metric",
    value: { platform, bucketStart: start, bucketSize: end - start, posts: nonNeg(r, p.total, "total"), ...fxCounts(r, ctx, p.by_entity, p.by_topic), provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) } },
  };
};

const GEO_METHOD: Record<F.FixtureRegionalV2["geo"]["method"], GeoMetric["location"]["source"]> = { gps: "geotag", bio: "profile", mention: "text_mention" };

const fxRegional: Fn = (r, ctx, sourceId) => {
  const p = r.payload as F.FixtureRegionalV2;
  const regionKey = ctx.regionByUfCity(p.uf, p.city) ?? fail(r, `UF desconhecida: ${p.uf}`, "uf");
  const start = ctx.eventOffset(p.show_id, isoOk(r, p.window.start, "window.start")) ?? fail(r, "evento desconhecido", "show_id");
  const end = ctx.eventOffset(p.show_id, isoOk(r, p.window.end, "window.end"))!;
  const confidence: ConfidenceLevel = confidenceLevel(p.geo.score);
  return {
    type: "geo_metric",
    value: {
      regionKey,
      bucketStart: start,
      bucketSize: end - start,
      posts: nonNeg(r, p.count, "count"),
      ...fxCounts(r, ctx, p.by_entity, p.by_topic),
      location: { precision: p.city ? "municipality" : "state", source: GEO_METHOD[p.geo.method], confidence },
      provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) },
    },
  };
};

export const NORMALIZERS: Record<string, Fn> = {
  "demo.event/v1": demoEvent,
  "demo.segment/v1": demoSegment,
  "demo.party/v1": demoParty,
  "demo.candidate/v1": demoCandidate,
  "demo.party_identity/v1": demoIdentity,
  "demo.social.count/v1": demoCount,
  "demo.social.post/v1": demoPost,
  "demo.social.region_count/v1": demoRegion,
  "demo.media.article/v1": demoArticle,
  "fixture.show/v2": fxShow,
  "fixture.cue/v2": fxCue,
  "fixture.party/v2": fxParty,
  "fixture.candidate/v2": fxCandidate,
  "fixture.volume/v2": fxVolume,
  "fixture.regional/v2": fxRegional,
};

export function normalize(r: RawRecord, ctx: NormalizationContext, sourceId: string): Normalized {
  const fn = NORMALIZERS[r.schema];
  if (!fn) throw new NormalizationError(r.providerId, r.externalId, `esquema sem normalizador: ${r.schema}`, "schema");
  if (!r.externalId) throw new NormalizationError(r.providerId, "?", "externalId ausente", "externalId");
  if (Number.isNaN(Date.parse(r.collectedAt))) throw new NormalizationError(r.providerId, r.externalId, "collectedAt inválido", "collectedAt");
  return fn(r, ctx, sourceId);
}

// ───────── ARQUIVO (dados reais importados) ─────────
import type * as FL from "./schemas/file";
import { UNKNOWN_SPEAKER_ID } from "@/domain/types";
import { slug } from "@/geo/reference";

export const fileCandidateId = (name: string) => `cand-${slug(name)}`;
export const filePartyId = (acronym: string) => `party-${slug(acronym)}`;

const fileManifest: Fn = (r, ctx, sourceId) => {
  const p = r.payload as FL.FileManifestV1;
  const value: Debate = {
    id: str(r, p.id, "id"),
    title: str(r, p.title, "title"),
    jurisdiction: p.jurisdiction,
    broadcaster: p.broadcaster,
    officeLabel: p.office,
    electionYear: p.election_year,
    round: p.round,
    startsAt: isoOk(r, p.starts_at, "starts_at"),
    endsAt: p.ends_at === null ? null : isoOk(r, p.ends_at, "ends_at"),
    status: p.status,
    participantIds: p.participants.map((n) => ctx.candidateByRef(n) ?? fail(r, `participante não resolvido: ${n}`, "participants")),
    sourceIds: [sourceId],
    mode: ctx.mode,
  };
  return { type: "debate", value, blocks: p.blocks.map((label, i) => ({ id: `b${i + 1}`, label })) };
};

const fileCue: Fn = (r, ctx, sourceId) => {
  const p = r.payload as FL.FileCueV1;
  if (p.start_ms !== null && p.end_ms !== null) checkSegmentTimes(r, p.start_ms, p.end_ms);
  const ev = ctx.events.get(p.event_id) ?? fail(r, `evento desconhecido: ${p.event_id}`, "event_id");
  // Resolução de orador: mapa manual > rótulo da fonte > desconhecido (nunca assumido)
  let speakerId: string | null = null;
  let resolution: TranscriptSegment["speakerResolution"] = "unresolved";
  if (p.speaker_map_target) {
    speakerId = ctx.speakerByRef(p.speaker_map_target);
    resolution = speakerId ? (p.attribution === "press_attribution" ? "press_attribution" : "manual_map") : "unresolved";
  } else if (p.speaker_label) {
    speakerId = ctx.speakerByRef(p.speaker_label);
    resolution = speakerId ? (p.attribution === "press_attribution" ? "press_attribution" : "source_label") : "unresolved";
  }
  const speakerConfidence: ConfidenceLevel = !speakerId ? "unknown" : resolution === "press_attribution" ? "medium" : resolution === "manual_map" ? "high" : "high";
  let blockId: string | null = null;
  if (p.block_label) {
    blockId = ev.blocks.get(p.block_label) ?? null;
    if (!blockId) {
      blockId = `b${ev.blocks.size + 1}`;
      ev.blocks.set(p.block_label, blockId);
    }
  }
  return {
    type: "segment",
    value: {
      id: `${p.event_id}:${String(p.seq).padStart(4, "0")}`,
      debateId: p.event_id,
      seq: p.seq,
      speakerId: speakerId ?? UNKNOWN_SPEAKER_ID,
      speakerName: p.speaker_label,
      speakerConfidence,
      speakerResolution: resolution,
      startOffset: p.start_ms === null ? null : p.start_ms / 1000,
      endOffset: p.end_ms === null ? null : p.end_ms / 1000,
      timing: { precision: p.timing_precision },
      text: str(r, p.text, "text"),
      blockId: blockId ?? "sem-bloco",
      addressedToId: null,
      provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) },
    },
  };
};

const fileParty: Fn = (r, ctx, sourceId) => {
  const p = r.payload as FL.FilePartyV1;
  const id = filePartyId(str(r, p.acronym, "acronym"));
  if (p.color !== null && !/^#[0-9a-f]{6}$/i.test(p.color)) fail(r, "cor inválida", "color");
  return {
    type: "party",
    value: { id, acronym: p.acronym, name: p.name, number: nonNeg(r, p.number, "number"), provenance: { nature: "official", sourceId, mode: ctx.mode, record: ref(r) } },
    identity: p.color ? { partyId: id, acronym: p.acronym, color: p.color, validFrom: p.valid_from ?? "1900-01-01", validTo: null, source: p.color_source ?? "não informado" } : undefined,
  };
};

const fileCandidate: Fn = (r, ctx, sourceId) => {
  const p = r.payload as FL.FileCandidateV1;
  const partyId = ctx.partyByRef(p.party) ?? fail(r, `partido desconhecido: ${p.party}`, "party");
  const name = str(r, p.name, "name");
  const initials = name.split(" ").filter(Boolean).filter((_, i, a) => i === 0 || i === a.length - 1).map((w) => w[0]).join("").toUpperCase();
  ctx.aliases.set(name, p.aliases);
  return { type: "candidate", value: { id: p.tse_id ?? fileCandidateId(name), name, ballotName: name, partyId, officeId: slug(p.office), initials, swatch: NEUTRAL_ENTITY_COLOR, provenance: { nature: "official", sourceId, mode: ctx.mode, record: ref(r) } } };
};

const fileArticle: Fn = (r, ctx, sourceId) => {
  const p = r.payload as FL.FileArticleV1;
  const [outlet, ...rest] = p.outlet_and_title.split(" — ");
  return { type: "article", value: { id: r.externalId, outlet, title: rest.join(" — ") || outlet, url: r.sourceUrl, publishedAt: isoOk(r, p.published_at, "published_at"), debateId: p.event_id, topics: [], provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) } } };
};

// ───────── AO VIVO / REPLAY (esquema genérico) ─────────
import type * as LV from "./schemas/live";

const liveEvent: Fn = (r, ctx, sourceId) => {
  const n = fileManifest(r, ctx, sourceId);
  if (n.type === "debate") n.value.sourceMode = (r.payload as LV.LiveEventV1).source_mode;
  return n;
};

const liveSegment: Fn = (r, ctx, sourceId) => {
  const p = r.payload as LV.LiveSegmentV1;
  if (p.start_offset_s !== null && p.end_offset_s !== null) checkSegmentTimes(r, p.start_offset_s * 1000, p.end_offset_s * 1000);
  if ((p.start_offset_s === null) !== (p.timing_precision === "unknown" || p.timing_precision === "sequence" || p.timing_precision === "block")) fail(r, "precisão temporal incoerente com offsets", "timing_precision");
  if (p.asr_confidence !== null && !(p.asr_confidence >= 0 && p.asr_confidence <= 1)) fail(r, "asr_confidence fora de [0,1]", "asr_confidence");
  const ev = ctx.events.get(p.event_id) ?? fail(r, `evento desconhecido: ${p.event_id}`, "event_id");
  // Orador: somente o que a fonte declara; nunca adivinhado.
  const speakerRef = p.speaker.name ?? p.speaker.label;
  const speakerId = speakerRef ? ctx.speakerByRef(speakerRef) : null;
  const resolution: TranscriptSegment["speakerResolution"] = !speakerId || p.speaker.source === "none" ? "unresolved" : p.speaker.source;
  const speakerConfidence: ConfidenceLevel = speakerId ? p.speaker.confidence : "unknown";
  let blockId = "sem-bloco";
  if (p.block_label) {
    blockId = ev.blocks.get(p.block_label) ?? `b${ev.blocks.size + 1}`;
    ev.blocks.set(p.block_label, blockId);
  }
  return {
    type: "segment",
    value: {
      id: `${p.event_id}:${String(p.seq).padStart(5, "0")}`,
      debateId: p.event_id,
      seq: p.seq,
      speakerId: speakerId ?? UNKNOWN_SPEAKER_ID,
      speakerName: p.speaker.label,
      speakerConfidence,
      speakerResolution: resolution,
      startOffset: p.start_offset_s,
      endOffset: p.end_offset_s,
      timing: { precision: p.timing_precision },
      text: str(r, p.text, "text"),
      blockId,
      addressedToId: null,
      provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) },
      capture: { sourceMode: p.source_mode, sourceTime: p.source_time, collectedAt: r.collectedAt, asrConfidence: p.asr_confidence },
    },
  };
};

// ───────── COBERTURA EDITORIAL (g1) ─────────
import type * as G1 from "./schemas/g1";

const g1Post: Fn = (r, ctx, sourceId) => {
  const p = r.payload as G1.G1LivePostV1;
  if (!p.post_id) fail(r, "post sem id", "post_id");
  if (!ctx.debateIds.has(p.debate_id)) fail(r, `debate desconhecido: ${p.debate_id}`, "debate_id");
  const text = str(r, p.text, "text");
  if (!text.trim()) fail(r, "post sem texto", "text");
  return {
    type: "editorial_update",
    value: {
      id: `${p.debate_id}:${r.providerId}:${p.post_id}`,
      debateId: p.debate_id,
      providerId: r.providerId,
      sourceId,
      externalId: r.externalId,
      url: p.url ?? p.page_url,
      headline: p.headline,
      text,
      // horário só se a fonte informou; nunca estimado a partir da coleta
      publishedAt: p.published_at,
      modifiedAt: p.modified_at,
      collectedAt: r.collectedAt,
      contentHash: payloadHash(p),
      parserVersion: p.parser_version,
      strategy: p.strategy,
      provenance: { nature: "collected", sourceId, mode: ctx.mode, record: ref(r) },
    },
  };
};

Object.assign(NORMALIZERS, { "g1.live-post/v1": g1Post, "live.event/v1": liveEvent, "live.segment/v1": liveSegment, "file.manifest/v1": fileManifest, "file.cue/v1": fileCue, "file.party/v1": fileParty, "file.candidate/v1": fileCandidate, "file.article/v1": fileArticle });
