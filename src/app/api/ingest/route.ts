import { timingSafeEqual } from "node:crypto";
import { fail, ok } from "../_lib/respond";
import { getProfile } from "@/providers/registry";
import { createSql } from "@/persistence/db";
import { enqueueJob } from "@/ingestion/worker";
import { log, newRequestId } from "@/infrastructure/log";

/**
 * Requisição de ingestão: APENAS enfileira (ingestion_job). A execução é do worker
 * (`npm run ingest -- --env … --drain`), fora do ciclo da requisição HTTP.
 * Exige INGEST_TOKEN (Authorization: Bearer …); sem token configurado, a rota fica desativada.
 */
export async function POST(req: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return fail(503, "not_configured", "ingestão via API desativada (INGEST_TOKEN ausente)");
  const got = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(token);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return fail(401, "unauthorized", "token inválido");
  const p = getProfile();
  if (p.persistence !== "postgres") return fail(409, "memory_profile", "perfil sem persistência (demo/fixture ingerem em memória)");
  const requestId = req.headers.get("x-request-id") ?? newRequestId();
  const jobId = await enqueueJob(createSql(process.env.DATABASE_URL), { profile: p.id, datasetId: process.env.INGEST_DATASET_ID ?? "validation-rj-2026-09-29", datasetKind: "validation", requestId });
  log("info", "ingestion_job.enqueued", { request_id: requestId, job_id: jobId, profile: p.id });
  return ok({ jobId, status: "queued" }, { requestId });
}
