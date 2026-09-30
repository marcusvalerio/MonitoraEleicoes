#!/usr/bin/env node
/**
 * Worker de ingestão (CLI). Uso:
 *   node scripts/ingest.mjs --env development|test|production [--profile live] [--dataset ID] [--kind validation] [--full]
 *   node scripts/ingest.mjs --env development --enqueue            # só enfileira (requisição)
 *   node scripts/ingest.mjs --env development --drain              # executa jobs da fila
 *   node scripts/ingest.mjs --env development --watch 30           # polling a cada 30 s (ao vivo)
 * Conexão exclusivamente por variável de ambiente (DATABASE_URL / _TEST / _PRODUCTION).
 */
import path from "node:path";
import { createJiti } from "jiti";
import { loadLocalEnv, URL_VAR } from "./env.mjs";

loadLocalEnv();
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const env = arg("--env");
if (!URL_VAR[env]) {
  console.error("uso: --env development|test|production");
  process.exit(2);
}
const profileId = arg("--profile", "live");
const DEFAULT_KIND = { demo: "demo", fixture: "fixture", live: "validation" };
const DEFAULT_DATASET = { demo: "demo", fixture: "fixture", live: "validation-rj-2026-09-29" };
const datasetKind = arg("--kind", DEFAULT_KIND[profileId]);
const datasetId = arg("--dataset", DEFAULT_DATASET[profileId]);
if (env === "production" && (datasetKind === "demo" || datasetKind === "fixture")) {
  console.error(`recusado: dataset '${datasetKind}' não pode ir para produção`);
  process.exit(3);
}

const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "scripts/shims/server-only.mjs") } });
const { createSql } = await jiti.import("@/persistence/db");
const { buildProfile } = await jiti.import("@/providers/registry");
const worker = await jiti.import("@/ingestion/worker");

const sql = createSql(process.env[URL_VAR[env]], URL_VAR[env]);

async function execute(p, dsId, kind, requestId) {
  const prof = buildProfile(p);
  return worker.runIngestion(
    sql,
    { mode: prof.mode, election: prof.election, transcript: prof.transcript, social: prof.social, media: prof.media, classifier: prof.classifier, aiSourceId: prof.aiSourceId },
    { datasetId: dsId, datasetKind: kind, description: `${prof.label} (${p})`, sources: prof.sources, requestId, full: args.includes("--full") },
  );
}

if (args.includes("--enqueue")) {
  const id = await worker.enqueueJob(sql, { profile: profileId, datasetId, datasetKind });
  console.log(JSON.stringify({ msg: "job.enqueued", job_id: id }));
} else if (args.includes("--drain")) {
  for (let job = await worker.claimJob(sql); job; job = await worker.claimJob(sql)) {
    try {
      const r = await execute(job.profile, job.dataset_id, job.dataset_kind, job.request_id ?? undefined);
      await worker.finishJob(sql, job.id, { status: worker.jobStatus(r), result: { runs: r.runs.length, counts: r.counts } });
    } catch (e) {
      await worker.finishJob(sql, job.id, { status: "failed", error: String(e?.message ?? e) });
      console.error(JSON.stringify({ level: "error", msg: "job.failed", job_id: job.id, error: String(e?.message ?? e) }));
    }
  }
} else {
  const every = Number(arg("--watch", 0));
  do {
    const r = await execute(profileId, datasetId, datasetKind);
    console.log(JSON.stringify({ msg: "ingest.summary", request_id: r.requestId, runs: r.runs.map((x) => `${x.kind}:${x.status}:${x.received}/${x.normalized}/${x.rejected}/unchanged=${x.unchanged}`), counts: r.counts }));
    if (every > 0) await new Promise((res) => setTimeout(res, every * 1000));
  } while (every > 0);
}
