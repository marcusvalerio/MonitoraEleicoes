#!/usr/bin/env node
/**
 * Worker de ingestão (CLI). Uso:
 *   node scripts/ingest.mjs --env development|test|production [--profile live] [--dataset ID] [--kind validation] [--full]
 *   node scripts/ingest.mjs --env development --enqueue            # só enfileira (requisição)
 *   node scripts/ingest.mjs --env development --drain              # executa jobs da fila
 *   node scripts/ingest.mjs --env development --watch 30           # polling a cada 30 s (perfil inteiro)
 *   node scripts/ingest.mjs --env development --live [--interval 2] # worker contínuo dos debates em connecting/live
 *                                                                     (debate_control); SIGINT/SIGTERM = parada graciosa
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

if (args.includes("--live")) {
  const { runLiveWorker } = await jiti.import("@/ingestion/live-worker");
  const { buildControlProviders } = await jiti.import("@/providers/registry");
  const { LIVE_SOURCES } = await jiti.import("@/providers/files/sources");
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => {
    if (stop) process.exit(130);
    stop = true;
    console.log(JSON.stringify({ msg: "live_worker.stopping", signal: sig, note: "termina após o ciclo atual" }));
  });
  const intervalMs = Number(arg("--interval", 2)) * 1000;
  await runLiveWorker(
    sql,
    {
      // relógio congelado por ciclo: status do evento e progresso usam o mesmo instante
      providersFor: (c) => { const t = Date.now(); return buildControlProviders(c, () => t); },
      sources: LIVE_SOURCES,
      spoolDir: path.join(root, ".monitora", "spool"),
    },
    { intervalMs, shouldStop: () => stop, sleep: (ms) => new Promise((r) => { const t = setTimeout(r, ms); const iv = setInterval(() => { if (stop) { clearTimeout(t); clearInterval(iv); r(); } }, 200); setTimeout(() => clearInterval(iv), ms + 10); }) },
  );
  process.exit(0);
} else if (args.includes("--enqueue")) {
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
