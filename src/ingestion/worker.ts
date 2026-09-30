import { randomUUID } from "node:crypto";
import type { ModelInfo } from "@/domain/types";
import { RELEVANCE_METHOD } from "@/domain/relevance";
import { ingest, type IngestionSources } from "@/ingestion/pipeline";
import { persistIngestion, type DatasetKind, type PersistResult } from "@/persistence/writer";
import type { Sql } from "@/persistence/db";
import type { Source } from "@/domain/types";
import { log } from "@/infrastructure/log";

/**
 * WORKER DE INGESTÃO: poll → RAW → normalização → análise → persistência.
 * Incremental: retoma dos checkpoints salvos por fluxo e não reclassifica segmentos
 * que já têm análise para o mesmo modelo/versão. Reexecutar é seguro (idempotente).
 */
export interface IngestJob {
  datasetId: string;
  datasetKind: DatasetKind;
  description: string;
  sources: Source[];
  requestId?: string;
  /** Ignora checkpoints: busca tudo de novo (ex.: reanálise com nova versão de modelo). Dedup continua valendo. */
  full?: boolean;
}

export type ProviderSet = Omit<IngestionSources, "startCursor" | "alreadyClassified">;

export async function loadIncrementalState(sql: Sql) {
  const [cps, keys] = await Promise.all([
    sql`select provider_id, stream, cursor from ingestion_checkpoint`,
    sql`select segment_id, model, model_version, prompt_version from analysis where relevance_method_version = ${RELEVANCE_METHOD.version}`,
  ]);
  const cursors = new Map((cps as { provider_id: string; stream: string; cursor: string | null }[]).map((r) => [`${r.provider_id}|${r.stream}`, r.cursor]));
  const analyzed = new Set((keys as { segment_id: string; model: string; model_version: string; prompt_version: string }[]).map((r) => `${r.segment_id}|${r.model}|${r.model_version}|${r.prompt_version}`));
  return { cursors, analyzed };
}

export async function runIngestion(sql: Sql, providers: ProviderSet, job: IngestJob): Promise<PersistResult & { requestId: string }> {
  const requestId = job.requestId ?? randomUUID();
  const t0 = Date.now();
  const loaded = await loadIncrementalState(sql);
  const state = job.full ? { cursors: new Map<string, string | null>(), analyzed: loaded.analyzed } : loaded;
  log("info", "ingestion.start", { request_id: requestId, dataset: job.datasetId, incremental: !job.full, checkpoints: state.cursors.size });
  const store = await ingest({
    ...providers,
    startCursor: (p, s) => state.cursors.get(`${p}|${s}`) ?? null,
    alreadyClassified: (id: string, m: ModelInfo) => state.analyzed.has(`${id}|${m.model}|${m.version}|${m.promptVersion}`),
  });
  const res = await persistIngestion(sql, store, { datasetId: job.datasetId, datasetKind: job.datasetKind, description: job.description, sources: job.sources, requestId });
  log("info", "ingestion.done", { request_id: requestId, dataset: job.datasetId, ms: Date.now() - t0, ...res.counts });
  return { ...res, requestId };
}

// ───────── Fila (requisição ≠ execução) ─────────
export async function enqueueJob(sql: Sql, j: { profile: string; datasetId: string; datasetKind: DatasetKind; requestId?: string }) {
  const id = randomUUID();
  await sql`insert into ingestion_job (id, profile, dataset_id, dataset_kind, request_id) values (${id}, ${j.profile}, ${j.datasetId}, ${j.datasetKind}, ${j.requestId ?? null})`;
  return id;
}

/** Reserva atômica do próximo job (SKIP LOCKED: vários workers não pegam o mesmo job). */
export async function claimJob(sql: Sql) {
  const rows = (await sql`update ingestion_job set status = 'running', started_at = now(), attempts = attempts + 1
    where id = (select id from ingestion_job where status = 'queued' order by requested_at limit 1 for update skip locked)
    returning id, profile, dataset_id, dataset_kind, request_id`) as { id: string; profile: string; dataset_id: string; dataset_kind: DatasetKind; request_id: string | null }[];
  return rows[0] ?? null;
}

export async function finishJob(sql: Sql, id: string, r: { status: "completed" | "partial" | "failed"; error?: string; result?: unknown }) {
  await sql`update ingestion_job set status = ${r.status}, finished_at = now(), error = ${r.error ?? null}, result = ${r.result === undefined ? null : JSON.stringify(r.result)}::jsonb where id = ${id}`;
}

export function jobStatus(res: PersistResult): "completed" | "partial" {
  return res.runs.some((r) => r.status !== "completed") ? "partial" : "completed";
}
