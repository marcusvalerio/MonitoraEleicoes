import { randomUUID } from "node:crypto";
import type { Source, TranscriptSegment } from "@/domain/types";
import { MODERATOR_SPEAKER_ID, TOPICS, UNKNOWN_SPEAKER_ID, isTimed } from "@/domain/types";
import { TOPIC_LABEL } from "@/domain/labels";
import { transcriptQuality } from "@/analytics/timeline";
import { wordCount } from "@/analytics/debate";
import { GEO_REGIONS, slug } from "@/geo/reference";
import type { DataStore, IngestionReport } from "@/ingestion/store";
import { log } from "@/infrastructure/log";
import { databaseEnv, type Sql } from "./db";

/**
 * GRAVADOR IDEMPOTENTE: DataStore (resultado da ingestão) → PostgreSQL.
 *   provider + external_id  → source_record (1 por item de origem)
 *   source_record + hash    → raw_record (nova versão só se o conteúdo mudar)
 *   ids determinísticos     → entidades de domínio (upsert)
 *   (segmento, modelo, versões) → analysis (nunca sobrescreve análises anteriores)
 * Reexecutar a mesma ingestão não cria registros de domínio duplicados.
 *
 * Ordem (segura contra queda no meio): 1) lê hashes já persistidos; 2) grava só o domínio cujo RAW
 * é novo/alterado; 3) grava execuções, RAW e erros POR ÚLTIMO. Se o processo cair antes do passo 3,
 * o RAW não existe e a próxima execução reprocessa (upserts idempotentes) — nada se perde.
 */
export type DatasetKind = "demo" | "fixture" | "validation" | "production";

export interface PersistOptions {
  datasetId: string;
  datasetKind: DatasetKind;
  description: string;
  sources: Source[];
  requestId?: string;
  /** Watch/polling: não guarda execuções ociosas (nada novo, nada rejeitado, sem falha). */
  skipIdleRuns?: boolean;
}

export interface PersistResult {
  runs: { runId: string; providerId: string; kind: string; status: string; received: number; normalized: number; rejected: number; unchanged: number }[];
  counts: Record<string, number>;
}

type Col = [name: string, type: string];

/** INSERT em lote via jsonb_to_recordset (1 ida ao banco por bloco de 500 linhas). */
async function bulk(sql: Sql, table: string, cols: Col[], rows: Record<string, unknown>[], conflict: string, returning = ""): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const names = cols.map((c) => c[0]).join(", ");
  const defs = cols.map(([n, t]) => `${n} ${t}`).join(", ");
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const q = `insert into ${table} (${names}) select ${names} from jsonb_to_recordset($1::jsonb) as x(${defs}) ${conflict}${returning ? ` returning ${returning}` : ""}`;
    const res = (await sql.query(q, [JSON.stringify(chunk)])) as Record<string, unknown>[];
    out.push(...res);
  }
  return out;
}

const RUN_STATUS: Record<IngestionReport["status"], string> = { ok: "completed", partial: "partial", failed: "failed", skipped: "completed" };

export function speakerRowId(seg: TranscriptSegment): string {
  if (seg.speakerId === UNKNOWN_SPEAKER_ID) return `${seg.debateId}:unknown:${slug(seg.speakerName ?? "sem-rotulo") || "sem-rotulo"}`;
  return `${seg.debateId}:${seg.speakerId}`;
}

const envChecked = new WeakMap<Sql, string>();
const referenceSeeded = new WeakSet<Sql>();
const sourcesSeeded = new WeakMap<Sql, string>();

export async function persistIngestion(sql: Sql, store: DataStore, o: PersistOptions): Promise<PersistResult> {
  const env = envChecked.get(sql) ?? (await databaseEnv(sql));
  if (!env) throw new Error("banco sem marcador de ambiente — rode as migrations (npm run db:migrate)");
  envChecked.set(sql, env);
  if (env === "production" && (o.datasetKind === "demo" || o.datasetKind === "fixture")) {
    throw new Error(`recusado: dataset '${o.datasetKind}' não pode ser gravado em produção`);
  }
  const ds = o.datasetId;
  const counts: Record<string, number> = {};
  const count = (k: string, n: number) => (counts[k] = (counts[k] ?? 0) + n);
  const recId = (p?: { record?: { recordId: string } }) => p?.record?.recordId ?? null;

  // 1 · Estado atual: quais versões de conteúdo já existem (e seus ids, para vincular erros)
  const raws = [...store.raws.entries()];
  const existing = raws.length ? ((await sql.query("select id, source_record_id, hash from raw_record where source_record_id = any($1::text[])", [raws.map(([id]) => id)])) as { id: string; source_record_id: string; hash: string }[]) : [];
  const have = new Map(existing.map((r) => [`${r.source_record_id}|${r.hash}`, r.id]));
  const changed = new Set(raws.filter(([id, x]) => !have.has(`${id}|${x.hash}`)).map(([id]) => id));
  const isNew = (p?: { record?: { recordId: string } }) => !p?.record || changed.has(p.record.recordId);

  const [dsRow] = (await sql`insert into dataset (id, kind, description) values (${ds}, ${o.datasetKind}, ${o.description})
            on conflict (id) do update set description = excluded.description returning kind`) as { kind: string }[];
  if (dsRow.kind !== o.datasetKind) throw new Error(`dataset '${ds}' já existe com tipo '${dsRow.kind}'`);

  // Referência e fontes (idempotentes; uma vez por processo/conteúdo)
  const pre: Promise<unknown>[] = [];
  if (!referenceSeeded.has(sql)) {
    pre.push(bulk(sql, "topic", [["id", "text"], ["label", "text"]], TOPICS.map((t) => ({ id: t, label: TOPIC_LABEL[t] })), "on conflict (id) do nothing"));
    pre.push(bulk(sql, "geo_entity", [["key", "text"], ["level", "text"], ["name", "text"], ["parent_key", "text"]], GEO_REGIONS.map((r) => ({ key: r.key, level: r.level, name: r.name, parent_key: r.parentKey })), "on conflict (key) do nothing"));
  }
  const srcRows = o.sources.map((s) => ({ id: s.id, dataset_id: ds, name: s.name, type: s.type, provider: s.provider, provider_id: s.providerId ?? null, provider_kind: s.providerKind ?? null, url: s.url, status: s.status, description: s.description, license: s.license ?? null }));
  const srcKey = `${ds}:${JSON.stringify(srcRows)}`;
  if (sourcesSeeded.get(sql) !== srcKey) {
    pre.push(bulk(sql, "source", [["id", "text"], ["dataset_id", "text"], ["name", "text"], ["type", "text"], ["provider", "text"], ["provider_id", "text"], ["provider_kind", "text"], ["url", "text"], ["status", "text"], ["description", "text"], ["license", "text"]], srcRows, "on conflict (id) do update set name = excluded.name, status = excluded.status, description = excluded.description, updated_at = now()"));
  }
  // source_record só para conteúdo novo/alterado (metadados do item na origem)
  pre.push(
    bulk(
      sql,
      "source_record",
      [["id", "text"], ["dataset_id", "text"], ["source_id", "text"], ["provider_id", "text"], ["external_id", "text"], ["schema", "text"], ["source_url", "text"], ["published_at", "timestamptz"], ["collected_at", "timestamptz"], ["content_hash", "text"]],
      raws.filter(([id]) => changed.has(id)).map(([id, x]) => ({ id, dataset_id: ds, source_id: x.sourceId, provider_id: x.raw.providerId, external_id: x.raw.externalId, schema: x.raw.schema, source_url: x.raw.sourceUrl, published_at: x.raw.publishedAt, collected_at: x.raw.collectedAt, content_hash: x.hash })),
      "on conflict (provider_id, external_id) do update set content_hash = excluded.content_hash, collected_at = excluded.collected_at, source_url = excluded.source_url",
    ),
  );
  await Promise.all(pre);
  referenceSeeded.add(sql);
  sourcesSeeded.set(sql, srcKey);

  // 2 · Domínio (somente o que mudou), em níveis de dependência paralelos
  const parties = [...store.parties.values()].filter((p) => isNew(p.provenance));
  const partyChanged = new Set(parties.map((p) => p.id));
  const candidates = [...store.candidates.values()].filter((c) => isNew(c.provenance));
  await bulk(sql, "party", [["id", "text"], ["dataset_id", "text"], ["acronym", "text"], ["name", "text"], ["number", "int"], ["source_record_id", "text"]], parties.map((p) => ({ id: p.id, dataset_id: ds, acronym: p.acronym, name: p.name, number: p.number, source_record_id: recId(p.provenance) })), "on conflict (id) do update set acronym = excluded.acronym, name = excluded.name, number = excluded.number");

  const debates = [...store.debates.values()];
  const debateRecord = (id: string) => [...store.raws.entries()].find(([, x]) => x.accepted && (x.raw.schema.endsWith(".manifest/v1") || x.raw.schema.includes("event") || x.raw.schema.includes("show")) && x.raw.externalId === id)?.[0] ?? null;
  const debatesChanged = debates.filter((d) => {
    const r = debateRecord(d.id);
    return !r || changed.has(r);
  });
  const idents = [
    ...candidates.map((c) => ({ entity_type: "candidate", entity_id: c.id, provider: c.provenance?.record?.providerId, external_id: c.provenance?.record?.externalId, source_record_id: recId(c.provenance) })),
    ...parties.map((p) => ({ entity_type: "party", entity_id: p.id, provider: p.provenance?.record?.providerId, external_id: p.provenance?.record?.externalId, source_record_id: recId(p.provenance) })),
  ].filter((x) => x.provider && x.external_id);
  await Promise.all([
    bulk(sql, "party_visual_identity", [["party_id", "text"], ["acronym", "text"], ["color", "text"], ["valid_from", "date"], ["valid_to", "date"], ["source", "text"]], store.identities.filter((i) => partyChanged.has(i.partyId)).map((i) => ({ party_id: i.partyId, acronym: i.acronym, color: i.color, valid_from: i.validFrom, valid_to: i.validTo, source: i.source })), "on conflict (party_id, valid_from) do update set color = excluded.color, source = excluded.source"),
    bulk(sql, "candidate", [["id", "text"], ["dataset_id", "text"], ["name", "text"], ["ballot_name", "text"], ["party_id", "text"], ["office_id", "text"], ["initials", "text"], ["source_record_id", "text"]], candidates.map((c) => ({ id: c.id, dataset_id: ds, name: c.name, ballot_name: c.ballotName, party_id: c.partyId, office_id: c.officeId, initials: c.initials, source_record_id: recId(c.provenance) })), "on conflict (id) do update set name = excluded.name, party_id = excluded.party_id"),
    bulk(sql, "debate", [["id", "text"], ["dataset_id", "text"], ["title", "text"], ["broadcaster", "text"], ["jurisdiction", "text"], ["office_label", "text"], ["election_year", "int"], ["round", "int"], ["starts_at", "timestamptz"], ["ends_at", "timestamptz"], ["status", "text"], ["source_record_id", "text"]], debatesChanged.map((d) => ({ id: d.id, dataset_id: ds, title: d.title, broadcaster: d.broadcaster, jurisdiction: d.jurisdiction ?? null, office_label: d.officeLabel, election_year: d.electionYear, round: d.round, starts_at: d.startsAt, ends_at: d.endsAt, status: d.status, source_record_id: debateRecord(d.id) })), "on conflict (id) do update set title = excluded.title, status = excluded.status, ends_at = excluded.ends_at, updated_at = now()"),
  ]);

  // Oradores (orador ≠ candidato) e segmentos novos
  const segs = [...store.segments.values()].flat().filter((s) => isNew(s.provenance));
  const segDebates = new Set(segs.map((s) => s.debateId));
  const speakers = new Map<string, Record<string, unknown>>();
  for (const s of segs) {
    const id = speakerRowId(s);
    if (speakers.has(id)) continue;
    const kind = s.speakerId === MODERATOR_SPEAKER_ID ? "moderator" : s.speakerId === UNKNOWN_SPEAKER_ID ? "unknown" : "candidate";
    speakers.set(id, { id, debate_id: s.debateId, label: s.speakerName ?? null, kind, candidate_id: kind === "candidate" ? s.speakerId : null, resolution_source: s.speakerResolution ?? (o.datasetKind === "demo" || o.datasetKind === "fixture" ? "demo" : "source_label"), resolution_confidence: s.speakerConfidence ?? "unknown" });
  }
  await Promise.all([
    bulk(sql, "entity_identifier", [["entity_type", "text"], ["entity_id", "text"], ["provider", "text"], ["external_id", "text"], ["source_record_id", "text"]], idents, "on conflict (provider, entity_type, external_id) do update set entity_id = excluded.entity_id"),
    bulk(sql, "debate_block", [["debate_id", "text"], ["id", "text"], ["label", "text"], ["ord", "int"], ["start_offset_s", "numeric"], ["end_offset_s", "numeric"]], debates.filter((d) => debatesChanged.includes(d) || segDebates.has(d.id)).flatMap((d) => (store.blocks.get(d.id) ?? []).map((b, i) => ({ debate_id: d.id, id: b.id, label: b.label, ord: i, start_offset_s: b.startOffset, end_offset_s: b.endOffset }))), "on conflict (debate_id, id) do update set label = excluded.label, start_offset_s = least(debate_block.start_offset_s, excluded.start_offset_s), end_offset_s = greatest(debate_block.end_offset_s, excluded.end_offset_s)"),
    bulk(sql, "debate_participant", [["debate_id", "text"], ["candidate_id", "text"], ["podium", "int"]], debatesChanged.flatMap((d) => d.participantIds.map((c, i) => ({ debate_id: d.id, candidate_id: c, podium: i + 1 }))), "on conflict (debate_id, candidate_id) do nothing"),
    bulk(sql, "speaker", [["id", "text"], ["debate_id", "text"], ["label", "text"], ["kind", "text"], ["candidate_id", "text"], ["resolution_source", "text"], ["resolution_confidence", "text"]], [...speakers.values()], "on conflict (id) do update set candidate_id = excluded.candidate_id, resolution_source = excluded.resolution_source, resolution_confidence = excluded.resolution_confidence"),
  ]);
  const startsAt = new Map(debates.map((d) => [d.id, Date.parse(d.startsAt)]));
  const abs = (debateId: string, off: number | null) => (off === null || !startsAt.has(debateId) ? null : new Date(startsAt.get(debateId)! + off * 1000).toISOString());
  await bulk(
    sql,
    "transcript_segment",
    [["id", "text"], ["dataset_id", "text"], ["debate_id", "text"], ["external_id", "text"], ["seq", "int"], ["speaker_id", "text"], ["speaker_label", "text"], ["start_offset_s", "numeric"], ["end_offset_s", "numeric"], ["started_at", "timestamptz"], ["ended_at", "timestamptz"], ["timestamp_precision", "text"], ["block_id", "text"], ["addressed_to_candidate_id", "text"], ["text", "text"], ["word_count", "int"], ["source_record_id", "text"], ["source_mode", "text"], ["source_time", "timestamptz"], ["collected_at", "timestamptz"], ["asr_confidence", "numeric"]],
    segs.map((s) => ({
      id: s.id,
      dataset_id: ds,
      debate_id: s.debateId,
      external_id: s.provenance.record?.externalId ?? s.id,
      seq: s.seq,
      speaker_id: speakerRowId(s),
      speaker_label: s.speakerName ?? null,
      start_offset_s: s.startOffset,
      end_offset_s: s.endOffset,
      started_at: abs(s.debateId, s.startOffset),
      ended_at: abs(s.debateId, s.endOffset),
      timestamp_precision: s.timing?.precision ?? (isTimed(s) ? "exact" : "unknown"),
      block_id: s.blockId,
      addressed_to_candidate_id: s.addressedToId,
      text: s.text,
      word_count: wordCount(s.text),
      source_record_id: recId(s.provenance),
      source_mode: s.capture?.sourceMode ?? "file",
      source_time: s.capture?.sourceTime ?? null,
      collected_at: s.capture?.collectedAt ?? (s.provenance.record ? (store.raws.get(s.provenance.record.recordId)?.raw.collectedAt ?? null) : null),
      asr_confidence: s.capture?.asrConfidence ?? null,
    })),
    // RAW imutável: texto só muda se a origem mudar (nova versão em raw_record)
    "on conflict (id) do update set text = excluded.text, word_count = excluded.word_count, speaker_id = excluded.speaker_id, start_offset_s = excluded.start_offset_s, end_offset_s = excluded.end_offset_s, started_at = excluded.started_at, ended_at = excluded.ended_at, timestamp_precision = excluded.timestamp_precision, updated_at = now() where transcript_segment.text is distinct from excluded.text or transcript_segment.start_offset_s is distinct from excluded.start_offset_s",
  );
  count("transcript_segment", segs.length);

  // Análises (versionadas; conflito = mesma análise já persistida → ignorada) + demais coleções
  const analyses = [...store.classifications.values()];
  const method = (m: string) => (m.startsWith("demo") ? "demo" : m.startsWith("rule") ? "rules" : m.startsWith("human") ? "human" : "llm");
  const posts = [...store.socialPosts.entries()].flatMap(([debateId, ps]) => ps.filter((p) => isNew(p.provenance)).map((p) => ({ debateId, p })));
  const postIds = new Set(posts.map((x) => x.p.id));
  const [insertedA] = await Promise.all([
    bulk(
      sql,
      "analysis",
      [["segment_id", "text"], ["method", "text"], ["model", "text"], ["model_version", "text"], ["prompt_version", "text"], ["topic", "text"], ["subtopic", "text"], ["speech_type", "text"], ["tone", "text"], ["target_candidate_id", "text"], ["mentions", "text[]"], ["fact_check", "text"], ["confidence", "numeric"], ["confidence_level", "text"], ["relevance_score", "numeric"], ["relevance_level", "text"], ["relevance_method", "text"], ["relevance_method_version", "text"], ["relevance_features", "jsonb"], ["created_at", "timestamptz"]],
      analyses.map((c) => ({
        segment_id: c.segmentId,
        method: method(c.model.model),
        model: c.model.model,
        model_version: c.model.version,
        prompt_version: c.model.promptVersion,
        topic: c.topic,
        subtopic: c.subtopic,
        speech_type: c.speechType,
        tone: c.tone,
        target_candidate_id: c.targetId,
        mentions: c.mentions,
        fact_check: c.factCheck,
        confidence: c.confidence,
        confidence_level: c.confidenceLevel,
        relevance_score: c.relevanceScore,
        relevance_level: c.relevance,
        relevance_method: c.relevanceMethod?.method ?? "criteria-sum",
        relevance_method_version: c.relevanceMethod?.version ?? "1",
        relevance_features: c.relevanceFeatures,
        created_at: c.classifiedAt,
      })),
      "on conflict (segment_id, model, model_version, prompt_version, relevance_method_version) do nothing",
      "id, segment_id, topic, subtopic",
    ),
    ...[...store.socialMetrics.entries()].map(([debateId, ms]) =>
      bulk(sql, "social_metric", [["dataset_id", "text"], ["debate_id", "text"], ["platform", "text"], ["bucket_start_s", "numeric"], ["bucket_size_s", "numeric"], ["posts", "int"], ["mentions_by_candidate", "jsonb"], ["by_topic", "jsonb"], ["source_id", "text"], ["source_record_id", "text"]], ms.filter((m) => isNew(m.provenance)).map((m) => ({ dataset_id: ds, debate_id: debateId, platform: m.platform, bucket_start_s: m.bucketStart, bucket_size_s: m.bucketSize, posts: m.posts, mentions_by_candidate: m.mentionsByCandidate, by_topic: m.byTopic, source_id: m.provenance.sourceId, source_record_id: recId(m.provenance) })), "on conflict (debate_id, platform, bucket_start_s, bucket_size_s) do update set posts = excluded.posts, mentions_by_candidate = excluded.mentions_by_candidate, by_topic = excluded.by_topic"),
    ),
    ...[...store.geoMetrics.entries()].map(([debateId, gs]) =>
      bulk(sql, "geo_observation", [["dataset_id", "text"], ["debate_id", "text"], ["region_key", "text"], ["bucket_start_s", "numeric"], ["bucket_size_s", "numeric"], ["posts", "int"], ["mentions_by_candidate", "jsonb"], ["by_topic", "jsonb"], ["geo_precision", "text"], ["geo_source", "text"], ["geo_confidence", "text"], ["source_id", "text"], ["source_record_id", "text"]], gs.filter((g) => isNew(g.provenance)).map((g) => ({ dataset_id: ds, debate_id: debateId, region_key: g.regionKey, bucket_start_s: g.bucketStart, bucket_size_s: g.bucketSize, posts: g.posts, mentions_by_candidate: g.mentionsByCandidate, by_topic: g.byTopic, geo_precision: g.location.precision, geo_source: g.location.source, geo_confidence: g.location.confidence, source_id: g.provenance.sourceId, source_record_id: recId(g.provenance) })), "on conflict (debate_id, region_key, bucket_start_s, bucket_size_s) do update set posts = excluded.posts"),
    ),
    bulk(sql, "social_post", [["id", "text"], ["dataset_id", "text"], ["debate_id", "text"], ["platform", "text"], ["external_id", "text"], ["author", "text"], ["published_at", "timestamptz"], ["collected_at", "timestamptz"], ["offset_s", "numeric"], ["text", "text"], ["url", "text"], ["source_record_id", "text"]], posts.map(({ debateId, p }) => {
      const r = p.provenance.record ? store.raws.get(p.provenance.record.recordId)?.raw : undefined;
      return { id: p.id, dataset_id: ds, debate_id: debateId, platform: p.platform, external_id: p.provenance.record?.externalId ?? p.id, author: p.authorHandle, published_at: r?.publishedAt ?? null, collected_at: r?.collectedAt ?? new Date().toISOString(), offset_s: p.offset, text: p.text, url: p.url, source_record_id: recId(p.provenance) };
    }), "on conflict (platform, external_id) do nothing"),
    bulk(sql, "media_asset", [["id", "text"], ["dataset_id", "text"], ["kind", "text"], ["outlet", "text"], ["title", "text"], ["url", "text"], ["published_at", "timestamptz"], ["debate_id", "text"], ["source_record_id", "text"]], store.articles.filter((a) => isNew(a.provenance)).map((a) => ({ id: a.id, dataset_id: ds, kind: "article", outlet: a.outlet, title: a.title, url: a.url, published_at: a.publishedAt, debate_id: a.debateId && store.debates.has(a.debateId) ? a.debateId : null, source_record_id: recId(a.provenance) })), "on conflict (id) do update set title = excluded.title"),
  ]);
  const mentionWrites: Promise<unknown>[] = [bulk(sql, "segment_topic", [["analysis_id", "bigint"], ["topic", "text"], ["subtopic", "text"]], insertedA.map((a) => ({ analysis_id: a.id, topic: a.topic, subtopic: a.subtopic })), "on conflict do nothing")];
  const cm = store.candidateMentions.filter((m) => postIds.has(m.postId));
  const pm = store.partyMentions.filter((m) => postIds.has(m.postId));
  if (cm.length) mentionWrites.push(bulk(sql, "social_mention", [["post_id", "text"], ["kind", "text"], ["candidate_id", "text"], ["method", "text"], ["confidence", "text"]], cm.map((m) => ({ post_id: m.postId, kind: "candidate", candidate_id: m.candidateId, method: m.method, confidence: m.confidence })), "on conflict do nothing"));
  if (pm.length) mentionWrites.push(bulk(sql, "social_mention", [["post_id", "text"], ["kind", "text"], ["party_id", "text"], ["method", "text"], ["confidence", "text"]], pm.map((m) => ({ post_id: m.postId, kind: "party", party_id: m.partyId, method: m.method, confidence: m.confidence })), "on conflict do nothing"));
  await Promise.all(mentionWrites);
  count("analysis.new", insertedA.length);

  // 3 · Execuções, RAW e erros (por último)
  const runIds = store.reports.map(() => randomUUID());
  const newByReport = new Map<number, number>();
  const unchangedByReport = new Map<number, number>();
  for (const [id, x] of raws) {
    const m = changed.has(id) ? newByReport : unchangedByReport;
    m.set(x.reportIndex, (m.get(x.reportIndex) ?? 0) + 1);
  }
  const keep = store.reports.map((r, i) => !o.skipIdleRuns || r.status === "failed" || r.status === "partial" || r.rejected > 0 || (newByReport.get(i) ?? 0) > 0 || (r.kind === "ai:classification" && insertedA.length > 0));
  const runRows = store.reports
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => keep[i])
    .map(({ r, i }) => ({ id: runIds[i], dataset_id: ds, provider_id: r.providerId, source_id: r.sourceId, kind: r.kind, request_id: o.requestId ?? null, status: RUN_STATUS[r.status], started_at: r.startedAt, finished_at: r.finishedAt || new Date().toISOString(), received_count: r.fetched, normalized_count: r.normalized, rejected_count: r.rejected, unchanged_count: unchangedByReport.get(i) ?? 0, error_count: r.status === "failed" ? 1 : r.rejected, message: r.message ?? null }));
  await bulk(sql, "ingestion_run", [["id", "uuid"], ["dataset_id", "text"], ["provider_id", "text"], ["source_id", "text"], ["kind", "text"], ["request_id", "text"], ["status", "text"], ["started_at", "timestamptz"], ["finished_at", "timestamptz"], ["received_count", "int"], ["normalized_count", "int"], ["rejected_count", "int"], ["unchanged_count", "int"], ["error_count", "int"], ["message", "text"]], runRows, "");

  const newRaws = raws.filter(([id]) => changed.has(id));
  const inserted = await bulk(
    sql,
    "raw_record",
    [["source_record_id", "text"], ["ingestion_run_id", "uuid"], ["schema_version", "text"], ["provider_version", "text"], ["payload", "jsonb"], ["hash", "text"]],
    newRaws.map(([id, x]) => ({ source_record_id: id, ingestion_run_id: keep[x.reportIndex] ? runIds[x.reportIndex] : null, schema_version: x.raw.schema, provider_version: x.raw.providerId, payload: x.raw.payload, hash: x.hash })),
    "on conflict (source_record_id, hash) do nothing",
    "id, source_record_id",
  );
  const rawId = new Map<string, string>([...existing.map((r) => [r.source_record_id, r.id] as [string, string]), ...inserted.map((r) => [r.source_record_id as string, String(r.id)] as [string, string])]);
  count("raw_record.new", inserted.length);
  count("raw_record.unchanged", raws.length - inserted.length);

  // Toda rejeição de conteúdo NOVO (ou falha de provider) vira ingestion_error — sem repetir a cada polling
  const errs = store.rejections.filter((r) => keep[r.reportIndex] && (!r.recordId || changed.has(r.recordId)));
  const tail: Promise<unknown>[] = [];
  if (errs.length) {
    tail.push(bulk(sql, "ingestion_error", [["ingestion_run_id", "uuid"], ["raw_record_id", "bigint"], ["external_id", "text"], ["field", "text"], ["code", "text"], ["message", "text"]], errs.map((r) => ({ ingestion_run_id: runIds[r.reportIndex], raw_record_id: r.recordId ? (rawId.get(r.recordId) ?? null) : null, external_id: r.externalId, field: r.field, code: r.code, message: r.message })), ""));
    count("ingestion_error", errs.length);
  }
  // Relatório de qualidade por debate com segmentos novos
  for (const d of debates) {
    const idx = store.reports.findIndex((r) => r.kind === `transcript:segments:${d.id}`);
    const dSegs = segs.filter((s) => s.debateId === d.id);
    if (idx < 0 || !dSegs.length || !keep[idx]) continue;
    const report = transcriptQuality(dSegs, dSegs.map((s) => store.classifications.get(s.id)).filter((c) => !!c), store.reports[idx]);
    tail.push(sql`insert into data_quality_report (debate_id, ingestion_run_id, report)
      select ${d.id}, ${runIds[idx]}, ${JSON.stringify(report)}::jsonb || jsonb_build_object('persistedSegments', (select count(*) from transcript_segment where debate_id = ${d.id}))`);
  }
  // Checkpoints de ingestão incremental (após o RAW: só avançam depois de gravado)
  const cps = [...store.cursors.entries()].map(([key, cursor]) => {
    const [provider_id, stream] = key.split("|");
    return { provider_id, stream, cursor };
  });
  await Promise.all(tail);
  await bulk(sql, "ingestion_checkpoint", [["provider_id", "text"], ["stream", "text"], ["cursor", "text"]], cps, "on conflict (provider_id, stream) do update set cursor = excluded.cursor, updated_at = now()");

  const runs: PersistResult["runs"] = runRows.map((r) => ({ runId: r.id, providerId: r.provider_id, kind: r.kind, status: r.status, received: r.received_count, normalized: r.normalized_count, rejected: r.rejected_count, unchanged: r.unchanged_count }));
  for (const r of runs) log(r.status === "failed" ? "error" : "info", "ingestion_run.finished", { request_id: o.requestId, ingestion_run_id: r.runId, provider: r.providerId, kind: r.kind, status: r.status, received: r.received, rejected: r.rejected, unchanged: r.unchanged });
  return { runs, counts };
}
