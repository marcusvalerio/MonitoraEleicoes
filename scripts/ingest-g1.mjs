#!/usr/bin/env node
/**
 * Teste REAL do g1 · cobertura editorial ao vivo (não depende de fixture).
 *   npm run ingest:g1 -- --dry-run [--debate <id>] [--url <URL>]        # coleta + extrai + classifica; NÃO grava nada
 *   npm run ingest:g1 -- --env development [--debate <id>] [--url <URL>] # uma coleta gravada (registra ingestion_run)
 *   npm run ingest:g1 -- --env production --confirm-production …         # produção exige confirmação explícita
 * URL: --url > debate_source (banco do --env) > manifesto data/real/<debate>/manifest.json. "pending" ⇒ aborta.
 */
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { createJiti } from "jiti";
import { loadLocalEnv, URL_VAR } from "./env.mjs";

loadLocalEnv();
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const dry = args.includes("--dry-run");
const env = arg("--env");
const debateId = arg("--debate", "presidencial-2026-10-01");
if (!dry && !URL_VAR[env]) {
  console.error("uso: --dry-run | --env development|test|production");
  process.exit(2);
}
if (env === "production" && !dry && !args.includes("--confirm-production")) {
  console.error("produção exige --confirm-production (ver docs/G1-PROVIDER.md)");
  process.exit(2);
}
const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "scripts/shims/server-only.mjs") } });
const { buildControlProviders } = await jiti.import("@/providers/registry");
const { LIVE_SOURCES } = await jiti.import("@/providers/files/sources");
const { REAL_DATA_DIR } = await jiti.import("@/providers/files");

const sql = env ? (await jiti.import("@/persistence/db")).createSql(process.env[URL_VAR[env]], URL_VAR[env]) : null;
let url = arg("--url");
if (!url && sql) url = (await sql`select source_url from debate_source where debate_id = ${debateId} and provider_id = 'g1-live-editorial'`)[0]?.source_url ?? null;
if (!url) {
  const mf = path.join(REAL_DATA_DIR, debateId, "manifest.json");
  url = existsSync(mf) ? (JSON.parse(readFileSync(mf, "utf8")).liveSources ?? []).find((s) => s.provider === "g1-live-editorial")?.sourceUrl : null;
}
if (!url || url === "pending") {
  console.error(JSON.stringify({ msg: "g1.url_pending", debate: debateId, note: "URL oficial ainda não configurada. Use --url <URL> ou cadastre em /admin/debates → Fontes." }));
  process.exit(3);
}
const control = { id: debateId, title: debateId, providerId: "manifest-only", sourceMode: "live", replayOf: null, replaySpeed: null, startedAt: null };
const providers = buildControlProviders(control, Date.now, [{ providerId: "g1-live-editorial", sourceUrl: url }]);
const t0 = Date.now();

if (dry) {
  const { ingest } = await jiti.import("@/ingestion/pipeline");
  const store = await ingest(providers);
  const rep = store.reports.find((r) => r.kind === `media:editorial:${debateId}`);
  const snap = store.editorialSnapshots[0]?.snapshot ?? null;
  console.log(JSON.stringify({ msg: "g1.dry_run", url, debate: debateId, ms: Date.now() - t0, status: rep?.status, error: rep?.message ?? rep?.issues?.[0]?.message ?? null, strategy: snap?.strategy ?? null, updates: store.editorial.length, rejected: rep?.rejected ?? null, wrote: "nada (dry-run)" }, null, 1));
  for (const u of store.editorial.slice(0, 15)) {
    const a = store.editorialAnalyses.get(u.id);
    console.log(JSON.stringify({ publishedAt: u.publishedAt, eventType: a?.eventType, topic: a?.topic, actor: a?.actorCandidateId, target: a?.targetCandidateId, mentioned: a?.mentionedCandidateIds, text: u.text.slice(0, 140) }));
  }
  process.exit(rep?.status === "failed" ? 1 : 0);
}
const { runIngestion } = await jiti.import("@/ingestion/worker");
const res = await runIngestion(sql, providers, { datasetId: `live-${debateId}`, datasetKind: "validation", description: `Cobertura editorial ao vivo de ${debateId}`, sources: LIVE_SOURCES });
console.log(JSON.stringify({ msg: "g1.ingest", debate: debateId, ms: Date.now() - t0, request_id: res.requestId, runs: res.runs.map((r) => `${r.kind}:${r.status}:${r.received}/${r.normalized}/${r.rejected}`), counts: res.counts }));
