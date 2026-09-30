import type { SocialPlatform } from "@/domain/types";
import { getDemoDataset } from "@/data/demo/generate";
import { getDemoGeoMetrics } from "@/data/demo/geo";
import { DEMO_BLOCK_DEFS, DEMO_CANDIDATES, DEMO_DEBATE, DEMO_PARTIES, DEMO_PAST_DEBATE } from "@/data/demo/entities";
import type {
  DemoArticleV1,
  DemoCandidateV1,
  DemoEventV1,
  DemoPartyIdentityV1,
  DemoPartyV1,
  DemoRegionCountV1,
  DemoSegmentV1,
  DemoSocialCountV1,
  DemoSocialPostV1,
} from "@/normalization/schemas/demo";
import { paginate, type ElectionProvider, type MediaProvider, type PageRequest, type RawRecord, type SocialProvider, type TranscriptProvider } from "../contracts";
import { DEFAULT_RETRY } from "../resilience";
import { PLATFORMS } from "../platforms";

/**
 * PROVIDERS DEMO — expõem o "mundo simulado" (src/data/demo) no MESMO contrato
 * que providers reais: registros brutos, paginados, com externalId e datas.
 */
const at = (startsAt: string, s: number) => new Date(Date.parse(startsAt) + s * 1000).toISOString();
const cfg = { requiredEnv: [], configured: true };
const noLimit = { requestsPerWindow: null, windowSeconds: null, notes: "Sem limite (dados locais)." };
const ok = async () => ({ status: "demo" as const, checkedAt: new Date().toISOString(), message: "Dados fictícios" });

function rec<P>(providerId: string, schema: string, externalId: string, publishedAt: string | null, collectedAt: string, payload: P): RawRecord<P> {
  return { providerId, schema, externalId, sourceUrl: null, publishedAt, collectedAt, payload };
}

export class DemoTranscriptProvider implements TranscriptProvider {
  readonly info = {
    id: "demo-transcript",
    name: "Transcrição simulada",
    kind: "transcript" as const,
    mode: "demo" as const,
    capabilities: { realtime: false, historical: true, replay: true, diarization: true, blocks: true },
    config: cfg,
    rateLimit: noLimit,
    retry: DEFAULT_RETRY,
    sourceId: "src-demo-transcript",
  };
  health = ok;
  async listEvents(page?: PageRequest) {
    const events: DemoEventV1[] = [DEMO_DEBATE, DEMO_PAST_DEBATE].map((d) => ({
      id: d.id,
      title: d.title,
      broadcaster: d.broadcaster,
      office_label: d.officeLabel,
      election_year: d.electionYear,
      round: d.round,
      starts_at: d.startsAt,
      ends_at: d.endsAt,
      status: d.status,
      participant_refs: d.participantIds,
      blocks: d.id === DEMO_DEBATE.id ? DEMO_BLOCK_DEFS.map((b) => ({ id: b.id, label: b.label })) : [],
    }));
    return paginate(events.map((e) => rec(this.info.id, "demo.event/v1", e.id, e.starts_at, e.starts_at, e)), page);
  }
  async fetchSegments(eventId: string, page?: PageRequest) {
    if (eventId !== DEMO_DEBATE.id) return paginate([], page);
    const segs = getDemoDataset().segments.map((s) =>
      rec<DemoSegmentV1>(this.info.id, "demo.segment/v1", s.id, at(DEMO_DEBATE.startsAt, s.startOffset), at(DEMO_DEBATE.startsAt, s.endOffset + 2), {
        event_id: s.debateId,
        seq: s.seq,
        speaker_ref: s.speakerId,
        start_s: s.startOffset,
        end_s: s.endOffset,
        text: s.text,
        block_id: s.blockId,
        addressed_to_ref: s.addressedToId,
      }),
    );
    return paginate(segs, page);
  }
}

export class DemoSocialProvider implements SocialProvider {
  readonly info = {
    id: "demo-social",
    name: "Repercussão simulada",
    kind: "social" as const,
    mode: "demo" as const,
    capabilities: { realtime: false, historical: true, posts: true, aggregatedCounts: true, engagement: false, candidates: true, topics: true, geolocation: "aggregated" as const },
    config: cfg,
    rateLimit: noLimit,
    retry: DEFAULT_RETRY,
    sourceId: "src-demo-social",
  };
  health = ok;
  platforms(): SocialPlatform[] {
    return PLATFORMS;
  }
  async fetchCounts(q: { eventExternalId: string }, page?: PageRequest) {
    if (q.eventExternalId !== DEMO_DEBATE.id) return paginate([], page);
    const items = getDemoDataset().metrics.map((m) =>
      rec<DemoSocialCountV1>(this.info.id, "demo.social.count/v1", `${m.platform}:${m.bucketStart}`, at(DEMO_DEBATE.startsAt, m.bucketStart), at(DEMO_DEBATE.startsAt, m.bucketStart + m.bucketSize + 5), {
        event_id: DEMO_DEBATE.id,
        platform: m.platform,
        window_start_s: m.bucketStart,
        window_s: m.bucketSize,
        posts: m.posts,
        mentions: m.mentionsByCandidate,
        topics: m.byTopic as Record<string, number>,
      }),
    );
    return paginate(items, page);
  }
  async fetchPosts(q: { eventExternalId: string }, page?: PageRequest) {
    if (q.eventExternalId !== DEMO_DEBATE.id) return paginate([], page);
    const items = getDemoDataset().posts.map((p) =>
      rec<DemoSocialPostV1>(this.info.id, "demo.social.post/v1", p.id, at(DEMO_DEBATE.startsAt, p.offset), at(DEMO_DEBATE.startsAt, p.offset + 7), {
        event_id: DEMO_DEBATE.id,
        platform: p.platform,
        offset_s: p.offset,
        text: p.text,
        author: p.authorHandle,
        mentions: p.mentionsCandidateIds,
        topic: p.topic,
        terms: p.terms,
      }),
    );
    return paginate(items, page);
  }
  async fetchRegionalCounts(q: { eventExternalId: string }, page?: PageRequest) {
    if (q.eventExternalId !== DEMO_DEBATE.id) return paginate([], page);
    const items = getDemoGeoMetrics().map((m) =>
      rec<DemoRegionCountV1>(this.info.id, "demo.social.region_count/v1", `${m.regionKey}:${m.bucketStart}`, at(DEMO_DEBATE.startsAt, m.bucketStart), at(DEMO_DEBATE.startsAt, m.bucketStart + m.bucketSize + 20), {
        event_id: DEMO_DEBATE.id,
        region_key: m.regionKey,
        window_start_s: m.bucketStart,
        window_s: m.bucketSize,
        posts: m.posts,
        // Demo: localização inferida pelo perfil, precisão municipal, confiança média
        location: { precision: "municipality", source: "profile", confidence: "medium" },
        mentions: m.mentionsByCandidate,
        topics: m.byTopic as Record<string, number>,
      }),
    );
    return paginate(items, page);
  }
}

export class DemoElectionProvider implements ElectionProvider {
  readonly info = {
    id: "demo-election",
    name: "Candidatos e partidos fictícios",
    kind: "election" as const,
    mode: "demo" as const,
    capabilities: { historical: false, candidates: true, parties: true, partyIdentity: true, results: false, resultsGranularity: null },
    config: cfg,
    rateLimit: noLimit,
    retry: DEFAULT_RETRY,
    sourceId: "src-demo-election",
  };
  health = ok;
  async fetchParties(_q: object, page?: PageRequest) {
    const now = "2026-08-16T00:00:00.000Z";
    return paginate(DEMO_PARTIES.map((p) => rec<DemoPartyV1>(this.info.id, "demo.party/v1", p.id, null, now, { id: p.id, acronym: p.acronym, name: p.name, number: p.number })), page);
  }
  async fetchCandidates(_q: object, page?: PageRequest) {
    const now = "2026-08-16T00:00:00.000Z";
    return paginate(
      DEMO_CANDIDATES.map((c) => rec<DemoCandidateV1>(this.info.id, "demo.candidate/v1", c.id, null, now, { id: c.id, name: c.name, ballot_name: c.ballotName, party_ref: c.partyId, office: c.officeId, initials: c.initials })),
      page,
    );
  }
  async fetchPartyIdentities(_q: object, page?: PageRequest) {
    const now = "2026-08-16T00:00:00.000Z";
    return paginate(
      DEMO_CANDIDATES.map((c) => {
        const p = DEMO_PARTIES.find((x) => x.id === c.partyId)!;
        return rec<DemoPartyIdentityV1>(this.info.id, "demo.party_identity/v1", `${p.id}:2026`, null, now, {
          party_ref: p.id,
          acronym: p.acronym,
          color: c.swatch,
          valid_from: "2026-01-01",
          valid_to: null,
          source: "Paleta editorial validada para daltonismo (fictícia)",
        });
      }),
      page,
    );
  }
  async fetchResults(_q: object, page?: PageRequest) {
    // Nenhum resultado fictício é gerado: resultados só vêm de fonte oficial.
    return paginate<RawRecord>([], page);
  }
}

export class DemoMediaProvider implements MediaProvider {
  readonly info = {
    id: "demo-media",
    name: "Imprensa simulada",
    kind: "media" as const,
    mode: "demo" as const,
    capabilities: { articles: true, fullText: false, realtime: false },
    config: cfg,
    rateLimit: noLimit,
    retry: DEFAULT_RETRY,
    sourceId: "src-demo-media",
  };
  health = ok;
  async fetchArticles(_q: object, page?: PageRequest) {
    const base = DEMO_DEBATE.startsAt;
    const arts: DemoArticleV1[] = [
      { outlet: "Veículo Demo", title: "Debate presidencial começa com temas econômicos", published_at: at(base, 900), event_id: DEMO_DEBATE.id, topics: ["economia"] },
      { outlet: "Portal Demo", title: "Candidatos discutem segurança e saúde no primeiro bloco", published_at: at(base, 2400), event_id: DEMO_DEBATE.id, topics: ["seguranca", "saude"] },
      { outlet: "Agência Demo", title: "Checagem: números citados sobre educação", published_at: at(base, 4200), event_id: DEMO_DEBATE.id, topics: ["educacao"] },
    ];
    return paginate(arts.map((a, i) => rec(this.info.id, "demo.media.article/v1", `art-${i + 1}`, a.published_at, a.published_at, a)), page);
  }
}
