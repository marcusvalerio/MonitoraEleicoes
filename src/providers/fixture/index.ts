import { getDemoDataset } from "@/data/demo/generate";
import { getDemoGeoMetrics } from "@/data/demo/geo";
import { DEMO_BLOCK_DEFS, DEMO_CANDIDATES, DEMO_DEBATE, DEMO_PARTIES, MODERATOR_ID } from "@/data/demo/entities";
import { TOPIC_LABEL } from "@/domain/labels";
import type { TopicId } from "@/domain/types";
import { getRegion } from "@/geo/reference";
import type { FixtureCandidateV2, FixtureCueV2, FixturePartyV2, FixtureRegionalV2, FixtureShowV2, FixtureVolumeV2 } from "@/normalization/schemas/fixture";
import { paginate, type ElectionProvider, type MediaProvider, type PageRequest, type RawRecord, type SocialProvider, type TranscriptProvider } from "../contracts";
import { DEFAULT_RETRY } from "../resilience";
import { PLATFORMS } from "../platforms";

/**
 * PROVIDERS FIXTURE — segundo conjunto mockado, com formatos de origem diferentes do DEMO
 * (tempos em ms/ISO, referências por NOME, rótulos textuais, IDs próprios, cores próprias).
 * Existe para provar que domínio, analytics e UI não dependem do provider.
 * Inclui alguns registros inválidos de propósito (rejeitados pela normalização).
 */
const SHOW_ID = "fx-show-0001";
const iso = (s: number) => new Date(Date.parse(DEMO_DEBATE.startsAt) + s * 1000).toISOString();
const cfg = { requiredEnv: [], configured: true };
const noLimit = { requestsPerWindow: 600, windowSeconds: 900, notes: "Limite simulado para testes." };
const ok = async () => ({ status: "demo" as const, checkedAt: new Date().toISOString(), message: "Fixture de testes (fictício)" });
const PLATFORM_NAME: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name]));
const candCode = (id: string) => `FX-${DEMO_CANDIDATES.findIndex((c) => c.id === id) + 101}`;
const nameOf = (id: string) => DEMO_CANDIDATES.find((c) => c.id === id)?.name ?? id;
// Cores rotacionadas: a UI deve refletir SEM mudança de código.
const FIXTURE_COLORS = ["#1FA89A", "#B872D6", "#6B8EF0", "#C8842E"];

function rec<P>(providerId: string, schema: string, externalId: string, publishedAt: string | null, collectedAt: string, payload: P, url: string | null = null): RawRecord<P> {
  return { providerId, schema, externalId, sourceUrl: url, publishedAt, collectedAt, payload };
}
const entities = (m: Record<string, number>) => Object.entries(m).map(([id, count]) => ({ name: nameOf(id), count }));
const topics = (m: Partial<Record<TopicId, number>>) => (Object.entries(m) as [TopicId, number][]).map(([t, count]) => ({ label: t === "outros" ? "Outros" : TOPIC_LABEL[t], count }));

export class FixtureTranscriptProvider implements TranscriptProvider {
  readonly info = {
    id: "fixture-captions",
    name: "Legendas (fixture)",
    kind: "transcript" as const,
    mode: "demo" as const,
    capabilities: { realtime: false, historical: true, replay: true, diarization: true, blocks: true },
    config: cfg,
    rateLimit: noLimit,
    retry: DEFAULT_RETRY,
    sourceId: "src-fixture-captions",
  };
  health = ok;
  async listEvents(page?: PageRequest) {
    const show: FixtureShowV2 = {
      show_id: SHOW_ID,
      name: "Debate Presidencial",
      network: "Rede Fixture",
      race: { office: "Presidente da República", year: 2026, round: 1 },
      scheduled: { start: DEMO_DEBATE.startsAt, end: DEMO_DEBATE.endsAt },
      on_air: true,
      finished: false,
      lineup: DEMO_CANDIDATES.map((c) => c.name),
    };
    return paginate([rec(this.info.id, "fixture.show/v2", SHOW_ID, show.scheduled.start, show.scheduled.start, show, "https://fixture.example/shows/0001")], page);
  }
  async fetchSegments(showId: string, page?: PageRequest) {
    if (showId !== SHOW_ID) return paginate([], page);
    const blockLabel = Object.fromEntries(DEMO_BLOCK_DEFS.map((b) => [b.id, b.label]));
    const cues = getDemoDataset().segments.map((s, i) =>
      rec<FixtureCueV2>(this.info.id, "fixture.cue/v2", `cue-${String(i + 1).padStart(4, "0")}`, iso(s.startOffset), iso(s.endOffset + 4), {
        show_id: SHOW_ID,
        cue_id: `cue-${String(i + 1).padStart(4, "0")}`,
        start_ms: s.startOffset * 1000,
        end_ms: s.endOffset * 1000,
        speaker: s.speakerId === MODERATOR_ID ? "MODERAÇÃO" : nameOf(s.speakerId).toUpperCase(),
        section: blockLabel[s.blockId],
        target: s.addressedToId ? nameOf(s.addressedToId) : null,
        caption: s.text,
      }),
    );
    // registro inválido (fim antes do início) — deve ser rejeitado e contabilizado
    cues.push(rec<FixtureCueV2>(this.info.id, "fixture.cue/v2", "cue-broken", null, iso(10), { show_id: SHOW_ID, cue_id: "cue-broken", start_ms: 9000, end_ms: 1000, speaker: "DESCONHECIDO", section: "?", target: null, caption: "" }));
    return paginate(cues, page);
  }
}

export class FixtureSocialProvider implements SocialProvider {
  readonly info = {
    id: "fixture-listening",
    name: "Social listening (fixture)",
    kind: "social" as const,
    mode: "demo" as const,
    capabilities: { realtime: false, historical: true, posts: false, aggregatedCounts: true, engagement: false, candidates: true, topics: true, geolocation: "aggregated" as const },
    config: cfg,
    rateLimit: noLimit,
    retry: DEFAULT_RETRY,
    sourceId: "src-fixture-listening",
  };
  health = ok;
  platforms() {
    return PLATFORMS;
  }
  async fetchPosts(_q: object, page?: PageRequest) {
    return paginate<RawRecord>([], page); // capability posts=false
  }
  async fetchCounts(q: { eventExternalId: string }, page?: PageRequest) {
    if (q.eventExternalId !== SHOW_ID) return paginate([], page);
    const items = getDemoDataset().metrics.map((m) =>
      rec<FixtureVolumeV2>(this.info.id, "fixture.volume/v2", `${PLATFORM_NAME[m.platform]}@${m.bucketStart}`, iso(m.bucketStart), iso(m.bucketStart + 90), {
        show_id: SHOW_ID,
        platform_name: PLATFORM_NAME[m.platform],
        window: { start: iso(m.bucketStart), end: iso(m.bucketStart + m.bucketSize) },
        total: m.posts,
        by_entity: entities(m.mentionsByCandidate),
        by_topic: topics(m.byTopic),
      }),
    );
    return paginate(items, page);
  }
  async fetchRegionalCounts(q: { eventExternalId: string }, page?: PageRequest) {
    if (q.eventExternalId !== SHOW_ID) return paginate([], page);
    const items = getDemoGeoMetrics().map((m) => {
      const r = getRegion(m.regionKey)!;
      const uf = getRegion(r.parentKey!)!.shortName;
      const isRest = r.name === "Demais municípios";
      return rec<FixtureRegionalV2>(this.info.id, "fixture.regional/v2", `${uf}/${r.name}@${m.bucketStart}`, iso(m.bucketStart), iso(m.bucketStart + 120), {
        show_id: SHOW_ID,
        uf,
        city: isRest ? null : r.name,
        window: { start: iso(m.bucketStart), end: iso(m.bucketStart + m.bucketSize) },
        count: m.posts,
        geo: { method: isRest ? "mention" : "bio", score: isRest ? 0.55 : 0.72 },
        by_entity: entities(m.mentionsByCandidate),
        by_topic: topics(m.byTopic),
      });
    });
    // registros com UF inexistente — devem ser rejeitados
    for (let i = 0; i < 3; i++)
      items.push(rec<FixtureRegionalV2>(this.info.id, "fixture.regional/v2", `XX/erro@${i}`, iso(600), iso(700), { show_id: SHOW_ID, uf: "XX", city: null, window: { start: iso(600), end: iso(900) }, count: 12, geo: { method: "mention", score: 0.3 }, by_entity: [], by_topic: [] }));
    return paginate(items, page);
  }
}

export class FixtureElectionProvider implements ElectionProvider {
  readonly info = {
    id: "fixture-registry",
    name: "Registro de candidaturas (fixture)",
    kind: "election" as const,
    mode: "demo" as const,
    capabilities: { historical: false, candidates: true, parties: true, partyIdentity: true, results: false, resultsGranularity: null },
    config: cfg,
    rateLimit: noLimit,
    retry: DEFAULT_RETRY,
    sourceId: "src-fixture-registry",
  };
  health = ok;
  async fetchParties(_q: object, page?: PageRequest) {
    return paginate(
      DEMO_PARTIES.map((p, i) =>
        rec<FixturePartyV2>(this.info.id, "fixture.party/v2", `P${p.number}`, null, "2026-08-20T12:00:00.000Z", {
          code: `P${p.number}`,
          short: p.acronym,
          full_name: p.name,
          ballot_number: String(p.number),
          brand: { hex: FIXTURE_COLORS[i], since: "2026-01-01", until: null, ref: "Fixture brand book" },
        }),
      ),
      page,
    );
  }
  async fetchCandidates(_q: object, page?: PageRequest) {
    return paginate(
      DEMO_CANDIDATES.map((c) => {
        const p = DEMO_PARTIES.find((x) => x.id === c.partyId)!;
        return rec<FixtureCandidateV2>(this.info.id, "fixture.candidate/v2", candCode(c.id), null, "2026-08-20T12:00:00.000Z", { code: candCode(c.id), full_name: c.name, party_code: `P${p.number}` });
      }),
      page,
    );
  }
  async fetchPartyIdentities(q: object, page?: PageRequest) {
    // Identidade vem embutida no registro de partido (formato diferente do DEMO).
    return this.fetchParties(q, page);
  }
  async fetchResults(_q: object, page?: PageRequest) {
    return paginate<RawRecord>([], page);
  }
}

export class FixtureMediaProvider implements MediaProvider {
  readonly info = {
    id: "fixture-media",
    name: "Imprensa (fixture — não configurada)",
    kind: "media" as const,
    mode: "demo" as const,
    capabilities: { articles: false, fullText: false, realtime: false },
    config: { requiredEnv: ["FIXTURE_MEDIA_TOKEN"], configured: false },
    rateLimit: noLimit,
    retry: DEFAULT_RETRY,
    sourceId: "src-fixture-media",
  };
  async health() {
    return { status: "not_configured" as const, checkedAt: new Date().toISOString(), message: "Sem credenciais" };
  }
  async fetchArticles(_q: object, page?: PageRequest) {
    return paginate<RawRecord>([], page);
  }
}
