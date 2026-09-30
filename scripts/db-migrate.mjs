#!/usr/bin/env node
/**
 * Runner de migrations (Neon, HTTP). Uso:
 *   node scripts/db-migrate.mjs --env development|test|production [--status]
 * - Aplica db/migrations/*.sql em ordem, cada arquivo numa transação.
 * - Guarda checksum: migration aplicada NÃO pode ser editada (crie outra).
 * - Grava/verifica o marcador de ambiente (monitora_env): impede apontar testes para produção.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { loadLocalEnv, URL_VAR } from "./env.mjs";

loadLocalEnv();
const args = process.argv.slice(2);
const env = args[args.indexOf("--env") + 1];
if (!URL_VAR[env]) {
  console.error("uso: --env development|test|production");
  process.exit(2);
}
if (env === "production" && !args.includes("--status") && !args.includes("--confirm-production")) {
  console.error("produção exige --confirm-production (faça backup/branch antes; ver docs/DATABASE.md)");
  process.exit(2);
}
const url = process.env[URL_VAR[env]];
if (!url) {
  console.error(`${URL_VAR[env]} não definida (veja docs/DATABASE.md)`);
  process.exit(2);
}
const sql = neon(url);
const log = (msg, extra = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), component: "db-migrate", env, msg, ...extra }));

await sql`create table if not exists schema_migrations (version text primary key, name text not null, checksum text not null, applied_at timestamptz not null default now())`;
await sql`create table if not exists monitora_env (id boolean primary key default true check (id), env text not null check (env in ('development','test','production')), created_at timestamptz not null default now())`;
const [marker] = await sql`select env from monitora_env`;
if (marker && marker.env !== env) {
  console.error(`ABORTADO: o banco está marcado como '${marker.env}', não '${env}'.`);
  process.exit(3);
}
if (!marker) await sql`insert into monitora_env (env) values (${env})`;

const dir = path.join(process.cwd(), "db", "migrations");
const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const applied = new Map((await sql`select version, checksum from schema_migrations`).map((r) => [r.version, r.checksum]));

if (args.includes("--status")) {
  for (const f of files) log("status", { file: f, applied: applied.has(f.slice(0, 4)) });
  process.exit(0);
}

for (const f of files) {
  const version = f.slice(0, 4);
  const content = readFileSync(path.join(dir, f), "utf-8");
  const checksum = createHash("sha256").update(content).digest("hex");
  if (applied.has(version)) {
    if (applied.get(version) !== checksum) {
      console.error(`ABORTADO: ${f} foi alterada após aplicada. Crie uma nova migration.`);
      process.exit(4);
    }
    continue;
  }
  const statements = content
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  const t0 = Date.now();
  await sql.transaction([...statements.map((s) => sql.query(s)), sql.query("insert into schema_migrations (version, name, checksum) values ($1, $2, $3)", [version, f, checksum])]);
  log("applied", { file: f, statements: statements.length, ms: Date.now() - t0 });
}
log("up-to-date", { migrations: files.length });
