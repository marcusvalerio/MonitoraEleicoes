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
 */
export type DatasetKind = "demo" | "fixture" | "validation" | "production";

export interface PersistOptions {
  datasetId: string;
  datasetKind: DatasetKind;
  description: string;
  sources: Source[];
  requestId?: string;
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

export async function persistIngestion(sql: Sql, store: DataStore, o: PersistOptions): Promise<PersistResult> {
  const env = await databaseEnv(sql);
  if (!env) throw new Error("banco sem marcador de ambiente — rode as migrations (npm run db:migrate)");
  if (env === "production" && (o.datasetKind === "demo" || o.datasetKind === "fixture")) {
    throw new Error(`recusado: dataset '${o.datasetKind}' não pode ser gravado em produção`);
  }
  const ds = o.datasetId;
  const counts: Record<string, number> = {};
  const count = (k: string, n: number) => (counts[k] = (counts[k] ?? 0) + n);

  await sql`insert into dataset (id, kind, description) values (${ds}, ${o.datasetKind}, ${o.description})
            on conflict (id) do update set description = excluded.description`;
  const kindRows = (await sql`select kind from dataset where id = ${ds}`) as { kind: string }[];
  if (kindRows[0].kind !== o.datasetKind) throw new Error(`dataset '${ds}' já existe com tipo '${kindRows[0].kind}'`);

  // Referência (idempotente)
  await bulk(sql, "topic", [["id", "text"], ["label", "text"]], TOPICS.map((t) => ({ id: t, label: TOPIC_LABEL[t] })), "on conflict (id) do nothing");
  await bulk(sql, "geo_entity", [["key", "text"], ["level", "text"], ["name", "text"], ["parent_key", "text"]], GEO_REGIONS.map((r) => ({ key: r.key, level: r.level, name: r.name, parent_key: r.parentKey })), "on conflict (key) do nothing");

  // Fontes
  await bulk(
    sql,
    "source",
    [["id", "text"], ["dataset_id", "text"], ["name", "text"], ["type", "text"], ["provider", "text"], ["provider_id", "text"], ["provider_kind", "text"], ["url", "text"], ["status", "text"], ["description", "text"], ["license", "text"]],
    o.sources.map((s) => ({ id: s.id, dataset_id: ds, name: s.name, type: s.type, provider: s.provider, provider_id: s.providerId ?? null, provider_kind: s.providerKind ?? null, url: s.url, status: s.status, description: s.description, license: s.license ?? null })),
    "on conflict (id) do update set name = excluded.name, status = excluded.status, description = excluded.description, updated_at = now()",
  );

  // Execuções de ingestão (uma por etapa de provider)
  const runIds = store.reports.map(() => randomUUID());
  await bulk(
    sql,
    "ingestion_run",
    [["id", "uuid"], ["dataset_id", "text"], ["provider_id", "text"], ["source_id", "text"], ["kind", "text"], ["request_id", "text"], ["status", "text"], ["started_at", "timestamptz"]],
    store.reports.map((r, i) => ({ id: runIds[i], dataset_id: ds, provider_id: r.providerId, source_id: r.sourceId, kind: r.kind, request_id: o.requestId ?? null, status: "running", started_at: r.startedAt })),
    "",
  );

  // Proveniência: source_record (1 por provider+external_id) e raw_record (1 por versão de conteúdo)
  const raws = [...store.raws.entries()];
  await bulk(
    sql,
    "source_record",
    [["id", "text"], ["dataset_id", "text"], ["source_id", "text"], ["provider_id", "text"], ["external_id", "text"], ["schema", "text"], ["source_url", "text"], ["published_at", "timestamptz"], ["collected_at", "timestamptz"], ["content_hash", "text"]],
    raws.map(([id, x]) => ({ id, dataset_id: ds, source_id: x.sourceId, provider_id: x.raw.providerId, external_id: x.raw.externalId, schema: x.raw.schema, source_url: x.raw.sourceUrl, published_at: x.raw.publishedAt, collected_at: x.raw.collectedAt, content_hash: x.hash })),
    "on conflict (provider_id, external_id) do update set content_hash = excluded.content_hash, collected_at = excluded.collected_at, source_url = excluded.source_url",
  );
  const inserted = await bulk(
    sql,
    "raw_record",
    [["source_record_id", "text"], ["ingestion_run_id", "uuid"], ["schema_version", "text"], ["provider_version", "text"], ["payload", "jsonb"], ["hash", "text"]],
    raws.map(([id, x]) => ({ source_record_id: id, ingestion_run_id: runIds[x.reportIndex], schema_version: x.raw.schema, provider_version: x.raw.providerId, payload: x.raw.payload, hash: x.hash })),
    "on conflict (source_record_id, hash) do nothing",
    "source_record_id",
  );
  const newIds = new Set(inserted.map((r) => r.source_record_id as string));
  const unchangedByReport = new Map<number, number>();
  for (const [id, x] of raws) if (!newIds.has(id)) unchangedByReport.set(x.reportIndex, (unchangedByReport.get(x.reportIndex) ?? 0) + 1);
  count("raw_record.new", newIds.size);
  count("raw_record.unchanged", raws.length - newIds.size);

  // Erros de ingestão (todos, vinculados ao raw correspondente)
  if (store.rejections.length) {
    const ids = store.rejections.map((r) => r.recordId).filter((x): x is string => !!x);
    const rawIdRows = ids.length ? ((await sql.query("select distinct on (source_record_id) id, source_record_id from raw_record where source_record_id = any($1::text[]) order by source_record_id, received_at desc", [ids])) as { id: string; source_record_id: string }[]) : [];
    const rawId = new Map(rawIdRows.map((r) => [r.source_record_id, r.id]));
    await bulk(
      sql,
      "ingestion_error",
      [["ingestion_run_id", "uuid"], ["raw_record_id", "bigint"], ["external_id", "text"], ["field", "text"], ["code", "text"], ["message", "text"]],
      store.rejections.map((r) => ({ ingestion_run_id: runIds[r.reportIndex], raw_record_id: r.recordId ? (rawId.get(r.recordId) ?? null) : null, external_id: r.externalId, field: r.field, code: r.code, message: r.message })),
      "",
    );
    count("ingestion_error", store.rejections.length);
  }

  // Entidades eleitorais
  const recId = (p?: { record?: { recordId: string } }) => p?.record?.recordId ?? null;
  await bulk(
    sql,
    "party",
    [["id", "text"], ["dataset_id", "text"], ["acronym", "text"], ["name", "text"], ["number", "int"], ["source_record_id", "text"]],
    [...store.parties.values()].map((p) => ({ id: p.id, dataset_id: ds, acronym: p.acronym, name: p.name, number: p.number, source_record_id: recId(p.provenance) })),
    "on conflict (id) do update set acronym = excluded.acronym, name = excluded.name, number = excluded.number",
  );
  await bulk(
    sql,
    "party_visual_identity",
    [["party_id", "text"], ["acronym", "text"], ["color", "text"], ["valid_from", "date"], ["valid_to", "date"], ["source", "text"]],
    store.identities.filter((i) => store.parties.has(i.partyId)).map((i) => ({ party_id: i.partyId, acronym: i.acronym, color: i.color, valid_from: i.validFrom, valid_to: i.validTo, source: i.source })),
    "on conflict (party_id, valid_from) do update set color = excluded.color, source = excluded.source",
  );
  await bulk(
    sql,
    "candidate",
    [["id", "text"], ["dataset_id", "text"], ["name", "text"], ["ballot_name", "text"], ["party_id", "text"], ["office_id", "text"], ["initials", "text"], ["source_record_id", "text"]],
    [...store.candidates.values()].map((c) => ({ id: c.id, dataset_id: ds, name: c.name, ballot_name: c.ballotName, party_id: c.partyId, office_id: c.officeId, initials: c.initials, source_record_id: recId(c.provenance) })),
    "on conflict (id) do update set name = excluded.name, party_id = excluded.party_id",
  );
  // Identificadores externos (provider + external_id → entidade)
  const idents = [
    ...[...store.candidates.values()].map((c) => ({ entity_type: "candidate", entity_id: c.id, provider: c.provenance?.record?.providerId, external_id: c.provenance?.record?.externalId, source_record_id: recId(c.provenance) })),
    ...[...store.parties.values()].map((p) => ({ entity_type: "party", entity_id: p.id, provider: p.provenance?.record?.providerId, external_id: p.provenance?.record?.externalId, source_record_id: recId(p.provenance) })),
  ].filter((x) => x.provider && x.external_id);
  await bulk(sql, "entity_identifier", [["entity_type", "text"], ["entity_id", "text"], ["provider", "text"], ["external_id", "text"], ["source_record_id", "text"]], idents, "on conflict (provider, entity_type, external_id) do update set entity_id = excluded.entity_id");

  // Debates, blocos, participantes
  const debates = [...store.debates.values()];
  const debateRecord = (id: string) => [...store.raws.entries()].find(([, x]) => x.accepted && (x.raw.schema.endsWith(".manifest/v1") || x.raw.schema.includes("event") || x.raw.schema.includes("show")) && x.raw.externalId === id)?.[0] ?? null;
  await bulk(
    sql,
    "debate",
    [["id", "text"], ["dataset_id", "text"], ["title", "text"], ["broadcaster", "text"], ["jurisdiction", "text"], ["office_label", "text"], ["election_year", "int"], ["round", "int"], ["starts_at", "timestamptz"], ["ends_at", "timestamptz"], ["status", "text"], ["source_record_id", "text"]],
    debates.map((d) => ({ id: d.id, dataset_id: ds, title: d.title, broadcaster: d.broadcaster, jurisdiction: d.jurisdiction ?? null, office_label: d.officeLabel, election_year: d.electionYear, round: d.round, starts_at: d.startsAt, ends_at: d.endsAt, status: d.status, source_record_id: debateRecord(d.id) })),
    "on conflict (id) do update set title = excluded.title, status = excluded.status, ends_at = excluded.ends_at, updated_at = now()",
  );
  await bulk(
    sql,
    "debate_block",
    [["debate_id", "text"], ["id", "text"], ["label", "text"], ["ord", "int"], ["start_offset_s", "numeric"], ["end_offset_s", "numeric"]],
    debates.flatMap((d) => (store.blocks.get(d.id) ?? []).map((b, i) => ({ debate_id: d.id, id: b.id, label: b.label, ord: i, start_offset_s: b.startOffset, end_offset_s: b.endOffset }))),
    "on conflict (debate_id, id) do update set label = excluded.label, start_offset_s = excluded.start_offset_s, end_offset_s = excluded.end_offset_s",
  );
  await bulk(
    sql,
    "debate_participant",
    [["debate_id", "text"], ["candidate_id", "text"], ["podium", "int"]],
    debates.flatMap((d) => d.participantIds.map((c, i) => ({ debate_id: d.id, candidate_id: c, podium: i + 1 }))),
    "on conflict (debate_id, candidate_id) do nothing",
  );

  // Oradores (orador ≠ candidato) e segmentos
  const segs = [...store.segments.values()].flat();
  const speakers = new Map<string, Record<string, unknown>>();
  for (const s of segs) {
    const id = speakerRowId(s);
    if (speakers.has(id)) continue;
    const kind = s.speakerId === MODERATOR_SPEAKER_ID ? "moderator" : s.speakerId === UNKNOWN_SPEAKER_ID ? "unknown" : "candidate";
    speakers.set(id, { id, debate_id: s.debateId, label: s.speakerName ?? null, kind, candidate_id: kind === "candidate" ? s.speakerId : null, resolution_source: s.speakerResolution ?? (o.datasetKind === "demo" || o.datasetKind === "fixture" ? "demo" : "source_label"), resolution_confidence: s.speakerConfidence ?? "unknown" });
  }
  await bulk(
    sql,
    "speaker",
    [["id", "text"], ["debate_id", "text"], ["label", "text"], ["kind", "text"], ["candidate_id", "text"], ["resolution_source", "text"], ["resolution_confidence", "text"]],
    [...speakers.values()],
    "on conflict (id) do update set candidate_id = excluded.candidate_id, resolution_source = excluded.resolution_source, resolution_confidence = excluded.resolution_confidence",
  );
  const startsAt = new Map(debates.map((d) => [d.id, Date.parse(d.startsAt)]));
  const abs = (debateId: string, off: number | null) => (off === null ? null : new Date(startsAt.get(debateId)! + off * 1000).toISOString());
  await bulk(
    sql,
    "transcript_segment",
    [["id", "text"], ["dataset_id", "text"], ["debate_id", "text"], ["external_id", "text"], ["seq", "int"], ["speaker_id", "text"], ["speaker_label", "text"], ["start_offset_s", "numeric"], ["end_offset_s", "numeric"], ["started_at", "timestamptz"], ["ended_at", "timestamptz"], ["timestamp_precision", "text"], ["block_id", "text"], ["addressed_to_candidate_id", "text"], ["text", "text"], ["word_count", "int"], ["source_record_id", "text"]],
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
    })),
    // RAW imutável: texto só muda se a origem mudar (nova versão em raw_record)
    "on conflict (id) do update set text = excluded.text, word_count = excluded.word_count, speaker_id = excluded.speaker_id, start_offset_s = excluded.start_offset_s, end_offset_s = excluded.end_offset_s, started_at = excluded.started_at, ended_at = excluded.ended_at, timestamp_precision = excluded.timestamp_precision, updated_at = now() where transcript_segment.text is distinct from excluded.text or transcript_segment.start_offset_s is distinct from excluded.start_offset_s",
  );
  count("transcript_segment", segs.length);

  // Análises (versionadas; conflito = mesma análise já persistida → ignorada)
  const analyses = [...store.classifications.values()];
  const method = (m: string) => (m.startsWith("demo") ? "demo" : m.startsWith("rule") ? "rules" : m.startsWith("human") ? "human" : "llm");
  const insertedA = await bulk(
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
  );
  await bulk(sql, "segment_topic", [["analysis_id", "bigint"], ["topic", "text"], ["subtopic", "text"]], insertedA.map((a) => ({ analysis_id: a.id, topic: a.topic, subtopic: a.subtopic })), "on conflict do nothing");
  count("analysis.new", insertedA.length);

  // Repercussão e geografia (quando houver)
  for (const [debateId, ms] of store.socialMetrics) {
    await bulk(
      sql,
      "social_metric",
      [["dataset_id", "text"], ["debate_id", "text"], ["platform", "text"], ["bucket_start_s", "numeric"], ["bucket_size_s", "numeric"], ["posts", "int"], ["mentions_by_candidate", "jsonb"], ["by_topic", "jsonb"], ["source_id", "text"], ["source_record_id", "text"]],
      ms.map((m) => ({ dataset_id: ds, debate_id: debateId, platform: m.platform, bucket_start_s: m.bucketStart, bucket_size_s: m.bucketSize, posts: m.posts, mentions_by_candidate: m.mentionsByCandidate, by_topic: m.byTopic, source_id: m.provenance.sourceId, source_record_id: recId(m.provenance) })),
      "on conflict (debate_id, platform, bucket_start_s, bucket_size_s) do update set posts = excluded.posts, mentions_by_candidate = excluded.mentions_by_candidate, by_topic = excluded.by_topic",
    );
    count("social_metric", ms.length);
  }
  for (const [debateId, posts] of store.socialPosts) {
    await bulk(
      sql,
      "social_post",
      [["id", "text"], ["dataset_id", "text"], ["debate_id", "text"], ["platform", "text"], ["external_id", "text"], ["author", "text"], ["published_at", "timestamptz"], ["collected_at", "timestamptz"], ["offset_s", "numeric"], ["text", "text"], ["url", "text"], ["source_record_id", "text"]],
      posts.map((p) => {
        const r = p.provenance.record ? store.raws.get(p.provenance.record.recordId)?.raw : undefined;
        return { id: p.id, dataset_id: ds, debate_id: debateId, platform: p.platform, external_id: p.provenance.record?.externalId ?? p.id, author: p.authorHandle, published_at: r?.publishedAt ?? null, collected_at: r?.collectedAt ?? new Date().toISOString(), offset_s: p.offset, text: p.text, url: p.url, source_record_id: recId(p.provenance) };
      }),
      "on conflict (platform, external_id) do nothing",
    );
  }
  if (store.candidateMentions.length) {
    await bulk(sql, "social_mention", [["post_id", "text"], ["kind", "text"], ["candidate_id", "text"], ["method", "text"], ["confidence", "text"]], store.candidateMentions.map((m) => ({ post_id: m.postId, kind: "candidate", candidate_id: m.candidateId, method: m.method, confidence: m.confidence })), "on conflict do nothing");
    await bulk(sql, "social_mention", [["post_id", "text"], ["kind", "text"], ["party_id", "text"], ["method", "text"], ["confidence", "text"]], store.partyMentions.map((m) => ({ post_id: m.postId, kind: "party", party_id: m.partyId, method: m.method, confidence: m.confidence })), "on conflict do nothing");
  }
  for (const [debateId, gs] of store.geoMetrics) {
    await bulk(
      sql,
      "geo_observation",
      [["dataset_id", "text"], ["debate_id", "text"], ["region_key", "text"], ["bucket_start_s", "numeric"], ["bucket_size_s", "numeric"], ["posts", "int"], ["mentions_by_candidate", "jsonb"], ["by_topic", "jsonb"], ["geo_precision", "text"], ["geo_source", "text"], ["geo_confidence", "text"], ["source_id", "text"], ["source_record_id", "text"]],
      gs.map((g) => ({ dataset_id: ds, debate_id: debateId, region_key: g.regionKey, bucket_start_s: g.bucketStart, bucket_size_s: g.bucketSize, posts: g.posts, mentions_by_candidate: g.mentionsByCandidate, by_topic: g.byTopic, geo_precision: g.location.precision, geo_source: g.location.source, geo_confidence: g.location.confidence, source_id: g.provenance.sourceId, source_record_id: recId(g.provenance) })),
      "on conflict (debate_id, region_key, bucket_start_s, bucket_size_s) do update set posts = excluded.posts",
    );
  }
  await bulk(
    sql,
    "media_asset",
    [["id", "text"], ["dataset_id", "text"], ["kind", "text"], ["outlet", "text"], ["title", "text"], ["url", "text"], ["published_at", "timestamptz"], ["debate_id", "text"], ["source_record_id", "text"]],
    store.articles.map((a) => ({ id: a.id, dataset_id: ds, kind: "article", outlet: a.outlet, title: a.title, url: a.url, published_at: a.publishedAt, debate_id: a.debateId && store.debates.has(a.debateId) ? a.debateId : null, source_record_id: recId(a.provenance) })),
    "on conflict (id) do update set title = excluded.title",
  );

  // Relatório de qualidade por debate (calculado do que foi persistido nesta execução)
  for (const d of debates) {
    const idx = store.reports.findIndex((r) => r.kind === `transcript:segments:${d.id}`);
    if (idx < 0) continue;
    const all = (await sql`select count(*)::int as n from transcript_segment where debate_id = ${d.id}`) as { n: number }[];
    const dSegs = store.segments.get(d.id) ?? [];
    if (!dSegs.length) continue; // execução incremental sem segmentos novos: relatório anterior permanece
    const report = transcriptQuality(dSegs, dSegs.map((s) => store.classifications.get(s.id)).filter((c) => !!c), store.reports[idx]);
    await sql`insert into data_quality_report (debate_id, ingestion_run_id, report) values (${d.id}, ${runIds[idx]}, ${JSON.stringify({ ...report, persistedSegments: all[0].n })}::jsonb)`;
  }

  // Checkpoints de ingestão incremental
  for (const [key, cursor] of store.cursors) {
    const [provider, stream] = key.split("|");
    await sql`insert into ingestion_checkpoint (provider_id, stream, cursor) values (${provider}, ${stream}, ${cursor})
              on conflict (provider_id, stream) do update set cursor = excluded.cursor, updated_at = now()`;
  }

  // Encerramento das execuções
  const runs: PersistResult["runs"] = [];
  for (const [i, r] of store.reports.entries()) {
    const unchanged = unchangedByReport.get(i) ?? 0;
    await sql`update ingestion_run set status = ${RUN_STATUS[r.status]}, finished_at = ${r.finishedAt || new Date().toISOString()},
              received_count = ${r.fetched}, normalized_count = ${r.normalized}, rejected_count = ${r.rejected},
              unchanged_count = ${unchanged}, error_count = ${r.status === "failed" ? 1 : r.rejected}, message = ${r.message ?? null}
              where id = ${runIds[i]}`;
    runs.push({ runId: runIds[i], providerId: r.providerId, kind: r.kind, status: RUN_STATUS[r.status], received: r.fetched, normalized: r.normalized, rejected: r.rejected, unchanged });
    log(r.status === "failed" ? "error" : "info", "ingestion_run.finished", { request_id: o.requestId, ingestion_run_id: runIds[i], provider: r.providerId, kind: r.kind, status: RUN_STATUS[r.status], received: r.fetched, rejected: r.rejected, unchanged });
  }
  return { runs, counts };
}
