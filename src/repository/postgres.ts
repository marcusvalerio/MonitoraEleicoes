import type { Candidate, DataMode, Debate, DebateBlock, MediaArticle, Party, SocialMetric, SocialPost, Source, SpeechClassification, TranscriptSegment } from "@/domain/types";
import { MODERATOR_SPEAKER_ID, UNKNOWN_SPEAKER_ID } from "@/domain/types";
import type { SourceRecord } from "@/domain/provenance";
import type { PartyVisualIdentity } from "@/domain/identity";
import { NEUTRAL_ENTITY_COLOR, identityAt } from "@/domain/identity";
import type { GeoMetric } from "@/geo/types";
import { DataStore, type IngestionReport } from "@/ingestion/store";
import { createSql, type Sql } from "@/persistence/db";
import { log } from "@/infrastructure/log";
import type { PageRequest } from "@/providers/contracts";
import { StoreQueries, type QueryContext } from "./queries";
import type { Repository } from "./types";
import { computeLatency, connectionStatus, type LiveControlInfo, type LiveState } from "@/domain/live";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const TTL_MS = Number(process.env.MONITORA_PG_TTL_MS ?? 10_000);
const RUN_TO_REPORT: Record<string, IngestionReport["status"]> = { completed: "ok", partial: "partial", failed: "failed", running: "partial" };

/**
 * REPOSITÓRIO POSTGRESQL (Neon). Somente leitura: a gravação é do worker de ingestão.
 * Hidrata um DataStore a partir de consultas indexadas e reutiliza exatamente as mesmas
 * consultas de domínio (StoreQueries) do repositório em memória — services não sabem a diferença.
 * O recorte é recarregado a cada TTL (padrão 10 s) para acompanhar a ingestão ao vivo.
 */
/** Linha de transcript_segment (+ speaker) → domínio. Orador só é candidato se o banco diz que é. */
export function segmentFromRow(r: Row, dataMode: DataMode, record: TranscriptSegment["provenance"]["record"]): TranscriptSegment {
  const kind = r.speaker_kind as string;
  const speakerId = kind === "moderator" ? MODERATOR_SPEAKER_ID : kind === "candidate" && r.speaker_candidate_id ? (r.speaker_candidate_id as string) : UNKNOWN_SPEAKER_ID;
  const sourceMode = (r.source_mode as NonNullable<TranscriptSegment["capture"]>["sourceMode"]) ?? "file";
  return {
    id: r.id as string,
    debateId: r.debate_id as string,
    seq: r.seq as number,
    speakerId,
    speakerName: (r.speaker_label as string) ?? null,
    speakerConfidence: r.resolution_confidence as TranscriptSegment["speakerConfidence"],
    speakerResolution: r.resolution_source === "demo" ? undefined : (r.resolution_source as TranscriptSegment["speakerResolution"]),
    startOffset: num(r.start_s),
    endOffset: num(r.end_s),
    timing: { precision: r.timestamp_precision as NonNullable<TranscriptSegment["timing"]>["precision"] },
    text: r.text as string,
    blockId: r.block_id as string,
    addressedToId: (r.addressed_to_candidate_id as string) ?? null,
    provenance: { nature: "collected", sourceId: (r.rec_source_id as string) ?? "", mode: dataMode, record },
    capture: sourceMode === "file" ? undefined : { sourceMode, sourceTime: iso(r.source_time), collectedAt: iso(r.collected_at), ingestedAt: iso(r.ingested_at), asrConfidence: num(r.asr_confidence) },
  };
}

export function analysisFromRow(r: Row, aiSource: string, dataMode: DataMode): SpeechClassification {
  return {
    segmentId: r.segment_id as string,
    topic: r.topic as SpeechClassification["topic"],
    subtopic: (r.subtopic as string) ?? null,
    speechType: r.speech_type as SpeechClassification["speechType"],
    tone: r.tone as SpeechClassification["tone"],
    targetId: (r.target_candidate_id as string) ?? null,
    mentions: (r.mentions as string[]) ?? [],
    relevance: r.relevance_level as SpeechClassification["relevance"],
    relevanceScore: Number(r.relevance_f),
    relevanceMethod: { method: r.relevance_method as string, version: r.relevance_method_version as string },
    relevanceFeatures: r.relevance_features as SpeechClassification["relevanceFeatures"],
    factCheck: r.fact_check as SpeechClassification["factCheck"],
    confidence: Number(r.confidence_f),
    confidenceLevel: r.confidence_level as SpeechClassification["confidenceLevel"],
    model: { model: r.model as string, version: r.model_version as string, promptVersion: r.prompt_version as string },
    classifiedAt: iso(r.created_at)!,
    humanReviewed: r.method === "human",
    provenance: { nature: "ai", sourceId: aiSource, mode: dataMode },
  };
}

export class PostgresRepository implements Repository {
  private snapshot: { at: number; q: Promise<StoreQueries> } | null = null;
  constructor(
    private readonly sql: Sql,
    private readonly ctx: QueryContext,
  ) {}

  static fromEnv(ctx: QueryContext) {
    return new PostgresRepository(createSql(process.env.DATABASE_URL, "DATABASE_URL"), ctx);
  }

  get mode() {
    return this.ctx.mode;
  }
  get clock() {
    return this.ctx.clock;
  }

  private queries(): Promise<StoreQueries> {
    const now = Date.now();
    if (!this.snapshot || now - this.snapshot.at > TTL_MS) {
      const q = this.load().catch((e) => {
        this.snapshot = null;
        throw e;
      });
      this.snapshot = { at: now, q };
    }
    return this.snapshot.q;
  }

  private async load(): Promise<StoreQueries> {
    const t0 = Date.now();
    const sql = this.sql;
    const [datasets, sources, records, parties, identities, candidates, debates, blocks, participants, segments, analyses, metrics, posts, geo, media, runs, errors] = await Promise.all([
      sql`select id, kind from dataset`,
      sql`select * from source order by id`,
      sql`select * from source_record`,
      sql`select * from party`,
      sql`select * from party_visual_identity`,
      sql`select * from candidate`,
      sql`select d.*, coalesce(dc.source_mode, (select ts.source_mode from transcript_segment ts where ts.debate_id = d.id and ts.source_mode <> 'file' limit 1)) as source_mode
          from debate d left join debate_control dc on dc.id = d.id`,
      sql`select * from debate_block order by debate_id, ord`,
      sql`select * from debate_participant order by debate_id, podium`,
      sql`select ts.*, ts.start_offset_s::float8 as start_s, ts.end_offset_s::float8 as end_s, sp.kind as speaker_kind, sp.candidate_id as speaker_candidate_id,
                 sp.resolution_source, sp.resolution_confidence, sr.provider_id as rec_provider_id, sr.source_id as rec_source_id
          from transcript_segment ts join speaker sp on sp.id = ts.speaker_id left join source_record sr on sr.id = ts.source_record_id
          order by ts.debate_id, ts.seq`,
      // Análise vigente por segmento = a mais recente (versões anteriores continuam no banco)
      sql`select distinct on (segment_id) *, confidence::float8 as confidence_f, relevance_score::float8 as relevance_f from analysis order by segment_id, created_at desc, id desc`,
      sql`select m.*, m.bucket_start_s::float8 as start_s, m.bucket_size_s::float8 as size_s, sr.provider_id as rec_provider_id, sr.external_id as rec_external_id from social_metric m left join source_record sr on sr.id = m.source_record_id`,
      sql`select p.*, p.offset_s::float8 as off_s, sr.provider_id as rec_provider_id from social_post p left join source_record sr on sr.id = p.source_record_id order by p.debate_id, p.offset_s`,
      sql`select g.*, g.bucket_start_s::float8 as start_s, g.bucket_size_s::float8 as size_s from geo_observation g`,
      sql`select m.*, sr.provider_id as rec_provider_id, sr.external_id as rec_external_id from media_asset m left join source_record sr on sr.id = m.source_record_id`,
      // Última execução por provider + etapa
      sql`select distinct on (provider_id, kind) * from ingestion_run order by provider_id, kind, started_at desc`,
      sql`select e.ingestion_run_id, e.external_id, e.code, e.message, e.field from ingestion_error e
          where e.ingestion_run_id in (select distinct on (provider_id, kind) id from ingestion_run order by provider_id, kind, started_at desc)
          order by e.id limit 500`,
    ]);

    const modeOf = new Map((datasets as Row[]).map((d) => [d.id as string, (d.kind === "demo" || d.kind === "fixture" ? "demo" : "live") as DataMode]));
    const mode = (dsId: unknown): DataMode => modeOf.get(dsId as string) ?? "live";
    const store = new DataStore();
    const ref = (r: Row, key = "source_record_id") => {
      const id = r[key] as string | null;
      if (!id) return undefined;
      const rec = store.sourceRecords.get(id);
      return rec ? { recordId: id, externalId: rec.externalId, providerId: rec.providerId } : undefined;
    };

    for (const r of records as Row[]) {
      const rec: SourceRecord = { id: r.id as string, sourceId: r.source_id as string, providerId: r.provider_id as string, externalId: r.external_id as string, schema: r.schema as string, sourceUrl: (r.source_url as string) ?? null, publishedAt: iso(r.published_at), collectedAt: iso(r.collected_at)!, ingestedAt: iso(r.ingested_at)!, payloadHash: r.content_hash as string };
      store.sourceRecords.set(rec.id, rec);
    }
    for (const r of parties as Row[]) {
      const p: Party = { id: r.id as string, acronym: r.acronym as string, name: r.name as string, number: r.number as number, provenance: { nature: "official", sourceId: store.sourceRecords.get(r.source_record_id as string)?.sourceId ?? "", mode: mode(r.dataset_id), record: ref(r) } };
      store.parties.set(p.id, p);
    }
    store.identities = (identities as Row[]).map((r): PartyVisualIdentity => ({ partyId: r.party_id as string, acronym: r.acronym as string, color: r.color as string, validFrom: (iso(r.valid_from) ?? "").slice(0, 10), validTo: r.valid_to ? iso(r.valid_to)!.slice(0, 10) : null, source: r.source as string }));
    const nowIso = new Date().toISOString();
    for (const r of candidates as Row[]) {
      const c: Candidate = {
        id: r.id as string,
        name: r.name as string,
        ballotName: r.ballot_name as string,
        partyId: r.party_id as string,
        officeId: r.office_id as string,
        initials: r.initials as string,
        swatch: identityAt(store.identities, r.party_id as string, nowIso)?.color ?? NEUTRAL_ENTITY_COLOR,
        provenance: { nature: "official", sourceId: store.sourceRecords.get(r.source_record_id as string)?.sourceId ?? "", mode: mode(r.dataset_id), record: ref(r) },
      };
      store.candidates.set(c.id, c);
    }

    const debateSources = new Map<string, Set<string>>();
    const addSrc = (d: string, s: string | null | undefined) => s && (debateSources.get(d) ?? debateSources.set(d, new Set()).get(d)!).add(s);
    for (const r of debates as Row[]) addSrc(r.id as string, store.sourceRecords.get(r.source_record_id as string)?.sourceId);
    for (const r of segments as Row[]) addSrc(r.debate_id as string, r.rec_source_id as string);
    for (const r of media as Row[]) if (r.debate_id) addSrc(r.debate_id as string, store.sourceRecords.get(r.source_record_id as string)?.sourceId);
    for (const r of debates as Row[]) {
      const d: Debate = {
        id: r.id as string,
        title: r.title as string,
        jurisdiction: (r.jurisdiction as string) ?? undefined,
        broadcaster: r.broadcaster as string,
        officeLabel: r.office_label as string,
        electionYear: r.election_year as number,
        round: r.round as 1 | 2,
        startsAt: iso(r.starts_at)!,
        endsAt: iso(r.ends_at),
        status: r.status as Debate["status"],
        participantIds: (participants as Row[]).filter((p) => p.debate_id === r.id).map((p) => p.candidate_id as string),
        sourceIds: [...(debateSources.get(r.id as string) ?? [])],
        mode: mode(r.dataset_id),
        sourceMode: (r.source_mode as Debate["sourceMode"]) ?? undefined,
      };
      store.debates.set(d.id, d);
      store.blocks.set(d.id, []);
    }
    for (const r of blocks as Row[]) store.blocks.get(r.debate_id as string)?.push({ id: r.id as string, label: r.label as string, startOffset: num(r.start_offset_s), endOffset: num(r.end_offset_s) } satisfies DebateBlock);

    for (const r of segments as Row[]) {
      const seg = segmentFromRow(r, mode(r.dataset_id), ref(r));
      store.push(store.segments, seg.debateId, seg);
    }

    const segMode = new Map([...store.segments.values()].flat().map((s) => [s.id, s.provenance.mode]));
    const aiSource = (sources as Row[]).find((s) => s.provider_kind === "ai")?.id as string | undefined;
    for (const r of analyses as Row[]) {
      const c = analysisFromRow(r, aiSource ?? "", segMode.get(r.segment_id as string) ?? "live");
      store.classifications.set(c.segmentId, c);
    }

    for (const r of metrics as Row[]) {
      const m: SocialMetric = { platform: r.platform as SocialMetric["platform"], bucketStart: Number(r.start_s), bucketSize: Number(r.size_s), posts: r.posts as number, mentionsByCandidate: r.mentions_by_candidate as Record<string, number>, byTopic: r.by_topic as SocialMetric["byTopic"], provenance: { nature: "collected", sourceId: r.source_id as string, mode: mode(r.dataset_id), record: ref(r) } };
      store.push(store.socialMetrics, r.debate_id as string, m);
    }
    for (const r of posts as Row[]) {
      const p = { id: r.id as string, platform: r.platform, offset: Number(r.off_s), authorHandle: r.author, text: r.text, url: r.url, provenance: { nature: "collected", sourceId: store.sourceRecords.get(r.source_record_id as string)?.sourceId ?? "", mode: mode(r.dataset_id), record: ref(r) } } as unknown as SocialPost;
      store.push(store.socialPosts, r.debate_id as string, p);
    }
    for (const r of geo as Row[]) {
      const g = { regionKey: r.region_key, bucketStart: Number(r.start_s), bucketSize: Number(r.size_s), posts: r.posts, mentionsByCandidate: r.mentions_by_candidate, byTopic: r.by_topic, location: { precision: r.geo_precision, source: r.geo_source, confidence: r.geo_confidence }, provenance: { nature: "collected", sourceId: r.source_id, mode: mode(r.dataset_id), record: ref(r) } } as unknown as GeoMetric;
      store.push(store.geoMetrics, r.debate_id as string, g);
    }
    store.articles = (media as Row[]).map((r): MediaArticle => ({ id: r.id as string, outlet: r.outlet as string, title: r.title as string, url: (r.url as string) ?? null, publishedAt: iso(r.published_at) ?? "", debateId: (r.debate_id as string) ?? null, topics: [], provenance: { nature: "collected", sourceId: store.sourceRecords.get(r.source_record_id as string)?.sourceId ?? "", mode: mode(r.dataset_id), record: ref(r) } }));

    const errs = errors as Row[];
    store.reports = (runs as Row[])
      .sort((a, b) => iso(a.started_at)!.localeCompare(iso(b.started_at)!))
      .map((r) => ({
        providerId: r.provider_id as string,
        sourceId: (r.source_id as string) ?? "",
        kind: r.kind as string,
        status: RUN_TO_REPORT[r.status as string] ?? "partial",
        fetched: r.received_count as number,
        normalized: r.normalized_count as number,
        rejected: r.rejected_count as number,
        issues: errs.filter((e) => e.ingestion_run_id === r.id).slice(0, 20).map((e) => ({ externalId: (e.external_id as string) ?? "", code: e.code as string, message: e.message as string, field: (e.field as string) ?? null })),
        startedAt: iso(r.started_at)!,
        finishedAt: iso(r.finished_at) ?? "",
        message: (r.message as string) ?? undefined,
      }));
    store.ingestedAt = store.reports.reduce((m, r) => (r.finishedAt > m ? r.finishedAt : m), "") || new Date(0).toISOString();

    // Fontes: o que está no banco prevalece; fontes do perfil ainda não persistidas aparecem como registradas.
    const dbSources: Source[] = (sources as Row[]).map((r) => {
      const recs = [...store.sourceRecords.values()].filter((x) => x.sourceId === r.id);
      return {
        id: r.id as string,
        name: r.name as string,
        type: r.type as Source["type"],
        provider: r.provider as string,
        url: (r.url as string) ?? null,
        timestamp: recs.map((x) => x.publishedAt ?? "").sort().at(-1) || iso(r.updated_at)!,
        collectedAt: recs.map((x) => x.collectedAt).sort().at(-1) ?? iso(r.updated_at)!,
        status: r.status as Source["status"],
        mode: mode(r.dataset_id),
        description: r.description as string,
        recordCount: recs.length,
        providerId: (r.provider_id as string) ?? undefined,
        providerKind: (r.provider_kind as Source["providerKind"]) ?? undefined,
        license: (r.license as string) ?? undefined,
      };
    });
    const known = new Set(dbSources.map((s) => s.id));
    const ctx: QueryContext = { ...this.ctx, sources: [...dbSources, ...this.ctx.sources.filter((s) => !known.has(s.id))], cacheKey: `pg:${store.ingestedAt}` };
    log("info", "repository.postgres.loaded", { ms: Date.now() - t0, debates: store.debates.size, segments: (segments as Row[]).length, analyses: (analyses as Row[]).length, runs: store.reports.length });
    return new StoreQueries(store, ctx);
  }

  moderatorId = () => MODERATOR_SPEAKER_ID;
  platforms = () => this.ctx.platforms();
  listDebates = async () => (await this.queries()).listDebates();
  getDebate = async (id: string) => (await this.queries()).getDebate(id);
  getBlocks = async (id: string) => (await this.queries()).getBlocks(id);
  transcriptEnd = async (id: string) => (await this.queries()).transcriptEnd(id);
  getTranscript = async (id: string, r?: { from?: number; to?: number }) => (await this.queries()).getTranscript(id, r);
  getTranscriptQuality = async (id: string) => (await this.queries()).getTranscriptQuality(id);
  getTranscriptPage = async (id: string, p: PageRequest & { to?: number }) => (await this.queries()).getTranscriptPage(id, p);
  getSegment = async (d: string, id: string) => (await this.queries()).getSegment(d, id);
  getEvents = async (id: string, r?: { to?: number }) => (await this.queries()).getEvents(id, r);
  getCandidates = async () => (await this.queries()).getCandidates();
  getParties = async () => (await this.queries()).getParties();
  getPartyIdentities = async () => (await this.queries()).getPartyIdentities();
  getElectoralResults = async () => (await this.queries()).getElectoralResults();
  getSocialMetrics = async (id: string, r?: { to?: number }) => (await this.queries()).getSocialMetrics(id, r);
  getSocialPosts = async (id: string, p: PageRequest & { from?: number; to?: number }) => (await this.queries()).getSocialPosts(id, p);
  getGeoMetrics = async (id: string, r?: { to?: number }) => (await this.queries()).getGeoMetrics(id, r);
  getGeoCoverage = async (id: string, r?: { from?: number; to?: number }) => (await this.queries()).getGeoCoverage(id, r);
  getArticles = async (id?: string) => (await this.queries()).getArticles(id);
  getSources = async () => (await this.queries()).getSources();
  getReports = async () => (await this.queries()).getReports();
  getSourceRecord = async (id: string) => (await this.queries()).getSourceRecord(id);
  getDataStatus = async () => (await this.queries()).getDataStatus();

  /**
   * Ao vivo: consulta INCREMENTAL direta (não usa o recorte com TTL). Índices: (debate_id, seq),
   * analysis(segment_id, created_at desc), (debate_id, ingested_at). Nunca recarrega o debate inteiro.
   */
  getLiveState = async (debateId: string, afterSeq = 0, limit = 200): Promise<LiveState | null> => {
    const sql = this.sql;
    const lim = Math.max(1, Math.min(500, Math.floor(limit)));
    const [deb, rows, totals, recent, ctl, ai] = await Promise.all([
      sql`select d.id, d.title, ds.kind from debate d join dataset ds on ds.id = d.dataset_id where d.id = ${debateId}`,
      sql`select ts.*, ts.start_offset_s::float8 as start_s, ts.end_offset_s::float8 as end_s, ts.asr_confidence::float8 as asr_confidence,
                 sp.kind as speaker_kind, sp.candidate_id as speaker_candidate_id, sp.resolution_source, sp.resolution_confidence,
                 sr.source_id as rec_source_id, sr.provider_id as rec_provider_id, sr.external_id as rec_external_id,
                 a.segment_id as a_segment_id, a.topic, a.subtopic, a.speech_type, a.tone, a.target_candidate_id, a.mentions, a.fact_check,
                 a.confidence::float8 as confidence_f, a.confidence_level, a.relevance_score::float8 as relevance_f, a.relevance_level,
                 a.relevance_method, a.relevance_method_version, a.relevance_features, a.model, a.model_version, a.prompt_version, a.method, a.created_at as a_created_at
          from transcript_segment ts
          join speaker sp on sp.id = ts.speaker_id
          left join source_record sr on sr.id = ts.source_record_id
          left join lateral (select * from analysis x where x.segment_id = ts.id order by x.created_at desc, x.id desc limit 1) a on true
          where ts.debate_id = ${debateId}
            and ts.seq > (case when ${afterSeq}::int >= 0 then ${afterSeq}::int else coalesce((select t2.seq from transcript_segment t2 where t2.debate_id = ${debateId} order by t2.seq desc offset ${lim} limit 1), 0) end)
          order by ts.seq limit ${lim}`,
      sql`select count(*)::int as segments, count(*) filter (where exists (select 1 from analysis a where a.segment_id = ts.id))::int as analyzed
          from transcript_segment ts where ts.debate_id = ${debateId}`,
      sql`select ts.source_mode, ts.source_time, ts.collected_at, ts.ingested_at, ts.start_offset_s::float8 as st, ts.end_offset_s::float8 as en,
                 (select min(a.processed_at) from analysis a where a.segment_id = ts.id) as processed_at
          from transcript_segment ts where ts.debate_id = ${debateId} order by ts.seq desc limit 20`,
      sql`select * from debate_control where id = ${debateId}`,
      sql`select id from source where provider_kind = 'ai' order by id limit 1`,
    ]);
    const d = (deb as Row[])[0];
    if (!d) return null;
    const dataMode: DataMode = d.kind === "demo" || d.kind === "fixture" ? "demo" : "live";
    const segs = (rows as Row[]).map((r) => segmentFromRow(r, dataMode, r.source_record_id ? { recordId: r.source_record_id as string, externalId: r.rec_external_id as string, providerId: r.rec_provider_id as string } : undefined));
    const aiSource = ((ai as Row[])[0]?.id as string) ?? "";
    const cls = (rows as Row[]).filter((r) => r.a_segment_id).map((r) => analysisFromRow({ ...r, segment_id: r.a_segment_id, created_at: r.a_created_at }, aiSource, dataMode));
    const c = (ctl as Row[])[0];
    const control: LiveControlInfo | null = c
      ? { status: c.status as LiveControlInfo["status"], sourceMode: c.source_mode as LiveControlInfo["sourceMode"], speed: c.replay_speed === null ? null : Number(c.replay_speed), startedAt: iso(c.started_at), lastHeartbeatAt: iso(c.last_heartbeat_at), lastErrorAt: iso(c.last_error_at), lastError: (c.last_error as string) ?? null }
      : null;
    const rec = recent as Row[];
    const t = (totals as Row[])[0];
    return {
      debateId,
      title: d.title as string,
      sourceMode: (rec[0]?.source_mode as LiveState["sourceMode"]) ?? control?.sourceMode ?? null,
      control,
      connection: connectionStatus(control, Date.now()),
      totals: { segments: t.segments as number, analyzed: t.analyzed as number },
      latency: computeLatency(
        rec.map((r) => ({
          sourceMode: r.source_mode as LiveState["sourceMode"],
          // fim da fala na fonte = início informado + duração (só quando ambos existem)
          sourceEnd: r.source_time && r.st !== null && r.en !== null ? new Date(Date.parse(iso(r.source_time)!) + (Number(r.en) - Number(r.st)) * 1000).toISOString() : null,
          collectedAt: iso(r.collected_at),
          ingestedAt: iso(r.ingested_at),
          processedAt: iso(r.processed_at),
        })),
      ),
      segments: segs,
      classifications: cls,
      lastSeq: segs.at(-1)?.seq ?? Math.max(0, afterSeq),
      serverTime: new Date().toISOString(),
    };
  };
}
