#!/usr/bin/env node
/**
 * Worker de ingestão (CLI). Uso:
 *   node scripts/ingest.mjs --env development|test|production [--profile live] [--dataset ID] [--kind validation] [--full]
 *   node scripts/ingest.mjs --env development --enqueue            # só enfileira (requisição)
 *   node scripts/ingest.mjs --env development --drain              # executa jobs da fila
 *   node scripts/ingest.mjs --env development --watch 30           # polling a cada 30 s (perfil inteiro)
 *   node scripts/ingest.mjs --env development --apuracao [--year 2026] [--round 1] [--interval 60] [--once]
 *        [--offices 1,3,5,6,7,8] [--ufs SP,RJ] [--municipios] [--proporcionais-a-cada 5]   # apuração oficial do TSE (incremental, idempotente)
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

if (args.includes("--apuracao")) {
  // Worker da APURAÇÃO OFICIAL: configuração do TSE → arquivos -u.json → RAW → retratos. SIGINT/SIGTERM = parada graciosa.
  if (env === "production" && !args.includes("--confirm-production")) {
    console.error("recusado: apuração em produção exige --confirm-production (e a migration 0008 aplicada com confirmação)");
    process.exit(3);
  }
  const { countTick } = await jiti.import("@/elections/apuracao/worker");
  const { TseCountProvider } = await jiti.import("@/elections/apuracao/provider");
  const { beat } = await jiti.import("@/infrastructure/heartbeat");
  const list = (k) => (arg(k) ? arg(k).split(",").map((x) => x.trim()).filter(Boolean) : undefined);
  const o = { year: Number(arg("--year", "2026")), round: Number(arg("--round", "1")), offices: list("--offices")?.map(Number), ufs: list("--ufs")?.map((u) => u.toUpperCase()), municipalities: args.includes("--municipios"), datasetKind: datasetKind === "fixture" ? "fixture" : "production" };
  const interval = Math.max(30, Number(arg("--interval", "60"))) * 1000;
  const provider = new TseCountProvider();
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stop = true));
  // Proporcionais (arquivos grandes) a cada N passadas; majoritários em todas.
  const propEvery = Math.max(1, Number(arg("--proporcionais-a-cada", "5")));
  const all = o.offices ?? [1, 3, 5, 6, 7, 8];
  let pass = 0;
  do {
    const offices = pass++ % propEvery === 0 ? all : all.filter((x) => [1, 3, 5].includes(x));
    const t0 = Date.now();
    let err = null;
    const r = offices.length ? await countTick(sql, provider, { ...o, offices }).catch((e) => ((err = e.message), console.error(e), null)) : null;
    const failed = err ?? (r && r.errors && !r.newSnapshots && !r.unchanged ? `${r.errors} falhas, nenhum arquivo lido` : null);
    await beat(sql, "apuracao", { ok: !failed, error: failed ?? (r?.errors ? `${r.errors} arquivo(s) com falha` : null), durationMs: Date.now() - t0, collected: r ? r.newSnapshots + r.unchanged : 0, changed: r?.newSnapshots ?? 0, rejected: r?.errors ?? 0, intervalS: interval / 1000 }).catch(() => {});
    if (r) console.log(JSON.stringify({ msg: "apuracao.tick", ...r }));
    if (args.includes("--once")) break;
    for (let t = 0; t < interval && !stop; t += 1000) await new Promise((r) => setTimeout(r, 1000));
  } while (!stop);
  process.exit(0);
}

if (args.includes("--social")) {
  // Worker SOCIAL: monitores ativos (social_monitor) × fontes conectadas. Separado do editorial e do histórico.
  const { runSocialWorker } = await jiti.import("@/ingestion/social-worker");
  const { buildSocialProviders, buildProfile } = await jiti.import("@/providers/registry");
  const { syncSocialSources } = await jiti.import("@/control/social");
  const { LIVE_SOURCES } = await jiti.import("@/providers/files/sources");
  const providers = buildSocialProviders();
  await syncSocialSources(sql, providers);
  const prof = buildProfile("live");
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stop ? process.exit(130) : (stop = true)));
  await runSocialWorker(
    sql,
    { providers, base: { mode: "live", election: prof.election, transcript: { ...prof.transcript, listEvents: async () => ({ items: [], nextCursor: null, hasMore: false }) }, social: prof.social, media: { ...prof.media, info: { ...prof.media.info, capabilities: { ...prof.media.info.capabilities, articles: false } } }, classifier: prof.classifier, aiSourceId: prof.aiSourceId }, sources: LIVE_SOURCES, datasetKind: process.env.MONITORA_DATASET_KIND ?? "production" },
    { intervalMs: Number(arg("--interval", 30)) * 1000, shouldStop: () => stop },
  );
  process.exit(0);
} else if (args.includes("--live")) {
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
      providersFor: (c, editorial) => { const t = Date.now(); return buildControlProviders(c, () => t, editorial); },
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
