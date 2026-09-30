#!/usr/bin/env node
/**
 * Controle de debates por dados (mesma lógica de /admin/debates). Uso:
 *   node scripts/debate-control.mjs --env development list
 *   node scripts/debate-control.mjs --env development create-replay <id> <debate-de-origem> <velocidade 1|2|5|10> ["Título"]
 *   node scripts/debate-control.mjs --env development set <id> <status> ["motivo"]
 */
import path from "node:path";
import { createJiti } from "jiti";
import { loadLocalEnv, URL_VAR } from "./env.mjs";

loadLocalEnv();
const args = process.argv.slice(2);
const env = args[args.indexOf("--env") + 1];
if (!URL_VAR[env]) {
  console.error("uso: --env development|test|production <comando>");
  process.exit(2);
}
const rest = args.filter((_, i) => i !== args.indexOf("--env") && i !== args.indexOf("--env") + 1);
const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "scripts/shims/server-only.mjs") } });
const { createSql } = await jiti.import("@/persistence/db");
const ctl = await jiti.import("@/control/debates");
const sql = createSql(process.env[URL_VAR[env]], URL_VAR[env]);
const [cmd, ...a] = rest;
if (cmd === "list") {
  for (const c of await ctl.listControls(sql)) console.log(JSON.stringify({ id: c.id, status: c.status, mode: c.sourceMode, speed: c.replaySpeed, startedAt: c.startedAt }));
} else if (cmd === "create-replay") {
  const [id, replayOf, speed, title] = a;
  const [o] = await sql`select title, office_label, jurisdiction from debate where id = ${replayOf}`;
  if (!o) throw new Error(`debate de origem não está no banco: ${replayOf} (rode a ingestão antes)`);
  const cands = (await sql`select c.name from debate_participant p join candidate c on c.id = p.candidate_id where p.debate_id = ${replayOf} order by p.podium`).map((r) => r.name);
  await ctl.createControl(sql, { id, title: title ?? `REPLAY · ${o.title}`, officeLabel: o.office_label, jurisdiction: o.jurisdiction, scheduledStart: new Date().toISOString(), sourceName: "Replay temporizado de transcrição importada", sourceUrl: null, providerId: "replay-transcript", sourceMode: "replay", replayOf, replaySpeed: Number(speed), candidates: cands });
  console.log(JSON.stringify({ msg: "created", id }));
} else if (cmd === "set") {
  const c = await ctl.transition(sql, a[0], a[1], a[2] ?? "cli");
  console.log(JSON.stringify({ msg: "transition", id: c.id, status: c.status }));
} else {
  console.error("comandos: list | create-replay | set");
  process.exit(2);
}
