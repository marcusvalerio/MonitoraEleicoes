#!/usr/bin/env node
/**
 * Importação do histórico eleitoral OFICIAL (TSE · Dados Abertos). Uso:
 *   npm run import:tse -- --env development --year 2022 [--kind candidacies|results|all] [--identity]
 *   npm run import:tse -- --env development --year 2026 --kind polls [--refresh]   # pesquisas registradas (PesqEle)
 *   npm run import:tse -- --env development --year 2026 --kind photos [--ufs BR,SP]  # fotos oficiais (majoritários)
 *   npm run import:tse -- --env development --identity-only
 * Baixa o ZIP oficial para .monitora/tse (gitignored), calcula SHA-256 e lê em streaming (unzip -p).
 * Lê SOMENTE o arquivo *_BRASIL.csv (os arquivos por UF duplicam o conteúdo).
 * CPF/título nunca gravados: HMAC com IDENTITY_HASH_KEY. Produção exige --confirm-production.
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createJiti } from "jiti";
import { loadLocalEnv, URL_VAR } from "./env.mjs";

loadLocalEnv();
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const env = arg("--env");
if (!URL_VAR[env]) {
  console.error("uso: --env development|test|production --year 2014|2018|2022|2026");
  process.exit(2);
}
if (env === "production" && !args.includes("--confirm-production")) {
  console.error("produção exige --confirm-production");
  process.exit(2);
}
const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "scripts/shims/server-only.mjs") } });
const { createSql } = await jiti.import("@/persistence/db");
const tse = await jiti.import("@/elections/tse/importer");
const sql = createSql(process.env[URL_VAR[env]], URL_VAR[env]);
const key = process.env.IDENTITY_HASH_KEY;
if (!key) console.error(JSON.stringify({ level: "warn", msg: "IDENTITY_HASH_KEY ausente: identidades entre ciclos ficarão 'unresolved'" }));

const cacheDir = path.join(root, ".monitora", "tse");
mkdirSync(cacheDir, { recursive: true });
function download(url) {
  const file = path.join(cacheDir, path.basename(url));
  if (!existsSync(file) || args.includes("--refresh")) {
    console.error(JSON.stringify({ msg: "tse.download", url }));
    const r = spawnSync("curl", ["-sSf", "-o", file, url], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`download falhou: ${url}`);
  }
  return file;
}
async function sha256(file) {
  const h = createHash("sha256");
  for await (const c of createReadStream(file)) h.update(c);
  return h.digest("hex");
}
function member(file) {
  const names = spawnSync("unzip", ["-Z1", file], { encoding: "utf8" }).stdout.split("\n");
  const m = names.find((n) => /_BRASIL\.csv$/i.test(n));
  if (!m) throw new Error(`arquivo *_BRASIL.csv não encontrado em ${path.basename(file)}`);
  return spawn("unzip", ["-p", file, m], { stdio: ["ignore", "pipe", "inherit"] }).stdout;
}

const year = Number(arg("--year"));
const kind = arg("--kind", "all");
if (kind === "photos") {
  // Fotos oficiais de candidatura (somente cargos majoritários). Padrão: BR (presidenciáveis); --ufs para governador/senador.
  const ph = await jiti.import("@/elections/tse/photos");
  const wanted = await ph.wantedSqs(sql, year);
  const ufs = (arg("--ufs", "BR") ?? "BR").split(",").map((u) => u.trim().toUpperCase()).filter(Boolean);
  for (const uf of ufs) {
    const url = ph.photosUrl(year, uf);
    const file = download(url);
    const names = spawnSync("unzip", ["-Z1", file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout.split("\n").filter((n) => { const m = ph.MEMBER_RE.exec(n); return m && wanted.has(m[2]); });
    const entries = names.map((n) => ({ member: n, bytes: spawnSync("unzip", ["-p", file, n], { maxBuffer: 4 * 1024 * 1024 }).stdout }));
    console.log(JSON.stringify({ msg: "tse.photos", year, uf, ...(await ph.importPhotos(sql, year, entries, { sourceUrl: url, zipSha256: await sha256(file), wanted })) }));
  }
  process.exit(0);
}
if (kind === "polls") {
  // Pesquisas registradas no TSE: registro, não percentuais. Heartbeat do "worker" de pesquisas.
  const polls = await jiti.import("@/elections/polls/importer");
  const { beat } = await jiti.import("@/infrastructure/heartbeat");
  const t0 = Date.now();
  try {
    const url = polls.pollsUrl(year);
    const file = download(url);
    const cfile = download(polls.pollsUrl(year, "pesquisa_contratante"));
    const r = await polls.importPolls(sql, year, member(file), member(cfile), { url, sha256: await sha256(file) });
    await beat(sql, "pesquisas", { ok: true, durationMs: Date.now() - t0, collected: r.read, changed: r.written, rejected: r.rejected, intervalS: 86_400 });
    console.log(JSON.stringify({ msg: "tse.polls", year, ...r }));
  } catch (e) {
    await beat(sql, "pesquisas", { ok: false, error: e.message, durationMs: Date.now() - t0, intervalS: 86_400 }).catch(() => {});
    throw e;
  }
  process.exit(0);
}
if (!args.includes("--identity-only")) {
  if (![2014, 2018, 2022, 2026].includes(year)) {
    console.error("--year deve ser 2014, 2018, 2022 ou 2026");
    process.exit(2);
  }
  if (kind === "candidacies" || kind === "all") {
    const url = tse.candidaciesUrl(year);
    const file = download(url);
    console.log(JSON.stringify({ msg: "tse.candidacies", year, ...(await tse.importCandidacies(sql, year, member(file), { url, sha256: await sha256(file), hmacKey: key })) }));
  }
  if ((kind === "results" || kind === "all") && year !== 2026) {
    const url = tse.resultsUrl(year);
    const file = download(url);
    const t0 = Date.now();
    const res = await tse.importResults(sql, year, [member(file)], { url, sha256: await sha256(file) });
    console.log(JSON.stringify({ msg: "tse.results", year, ms: Date.now() - t0, ...res }));
  }
  if (year === 2026 && kind !== "candidacies") console.log(JSON.stringify({ msg: "tse.results.not_available", year, note: "TSE ainda não publicou resultados de 2026 (dadosabertos: pacote inexistente)." }));
}
if (args.includes("--identity") || args.includes("--identity-only")) console.log(JSON.stringify({ msg: "tse.identity", ...(await tse.resolveIdentities(sql)) }));
