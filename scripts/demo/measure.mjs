#!/usr/bin/env node
/**
 * DEMONSTRAÇÃO — mede o fluxo TSE(replay) → worker → banco(test) → página. Amostra a cada 5 s e grava
 * .monitora/demo/timeline.jsonl. Uso: node scripts/demo/measure.mjs --app http://127.0.0.1:3010 --replay http://127.0.0.1:4600 --minutes 12
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { loadLocalEnv } from "../env.mjs";

loadLocalEnv();
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const APP = arg("--app", "http://127.0.0.1:3010");
const REPLAY = arg("--replay", "http://127.0.0.1:4600");
const END = Date.now() + Number(arg("--minutes", "12")) * 60_000;
const out = path.join(process.cwd(), ".monitora", "demo");
mkdirSync(out, { recursive: true });
const file = path.join(out, "timeline.jsonl");
const sql = neon(process.env.DATABASE_URL_TEST);
const [env] = await sql`select env from monitora_env`;
if (env.env !== "test") throw new Error("measure: somente banco de teste");

while (Date.now() < END) {
  const at = new Date().toISOString();
  const state = await fetch(`${REPLAY}/__demo/state`).then((r) => r.json()).catch(() => null);
  const [snap] = await sql`select s.id, s.phase, s.counted_pct, s.counted_pct_status, s.collected_at, s.source_generated_at,
      (select json_agg(x) from (select ballot_name, votes, pct from count_candidate where snapshot_id = s.id and votes_status = 'value' order by votes desc limit 3) x) as top
    from count_snapshot s where s.year = 2022 and s.office_id = 1 and s.territory_id = 0 order by s.source_generated_at desc, s.id desc limit 1`;
  const [agg] = await sql`select (select count(*)::int from count_snapshot where year = 2022) as snapshots,
      (select count(distinct territory_id)::int from count_snapshot where year = 2022 and phase <> 'not_started' and territory_id <> 0) as ufs_with_data,
      (select count(*)::int from count_candidate cc join count_snapshot s on s.id = cc.snapshot_id where s.year = 2022) as candidate_rows,
      (select count(*)::int from ingestion_run where kind = 'election:count') as runs,
      (select count(*)::int from ingestion_error e join ingestion_run r on r.id = e.ingestion_run_id where r.kind = 'election:count') as errors,
      (select count(*)::int from ingestion_checkpoint where provider_id = 'tse-divulgacao' and stream like 'apuracao:2022:%' and stream not like '%:status') as checkpoints,
      (select cursor from ingestion_checkpoint where provider_id = 'monitora-worker' and stream = 'heartbeat:apuracao') as heartbeat`;
  let page = null;
  try {
    const t0 = Date.now();
    const html = await (await fetch(`${APP}/eleicoes?ano=2022&cargo=1`, { cache: "no-store" })).text();
    const m = /Seções totalizadas:[^%]*?\(([\d,]+)%\)/.exec(html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, ""));
    page = { ms: Date.now() - t0, countedPct: m ? m[1] : null, demoBanner: html.includes("DEMONSTRAÇÃO · ambiente de teste"), zeroVotes: /\b0 votos\b/.test(html) };
  } catch (e) {
    page = { error: String(e) };
  }
  const hb = agg.heartbeat ? JSON.parse(agg.heartbeat) : null;
  const row = { at, step: state?.step ?? null, released: state?.released?.length ?? null, db: snap ? { phase: snap.phase, countedPct: snap.counted_pct_status === "value" ? Number(snap.counted_pct) : null, collectedAt: snap.collected_at, top: snap.top } : null, ...agg, heartbeat: hb && { at: hb.at, lastSuccessAt: hb.lastSuccessAt, lastError: hb.lastError, durationMs: hb.durationMs, collected: hb.collected, changed: hb.changed, rejected: hb.rejected }, page };
  appendFileSync(file, JSON.stringify(row) + "\n");
  console.log(`${at.slice(11, 19)} etapa=${row.step} ufs=${agg.ufs_with_data} db=${row.db?.countedPct ?? "—"}% pág=${page?.countedPct ?? "—"}% runs=${agg.runs} erros=${agg.errors} hb=${hb?.at?.slice(11, 19) ?? "—"}`);
  await new Promise((r) => setTimeout(r, 5000));
}
