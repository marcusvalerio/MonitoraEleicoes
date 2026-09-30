// E2E g1 · cobertura editorial: admin → cadastrar debate → habilitar g1 → worker → G1 provider → Neon → /ao-vivo.
// NÃO usa a página real do g1: um servidor local serve a fixture determinística (conteúdo fictício).
// Requer o servidor Next com DATA_MODE=live, ADMIN_TOKEN e G1_ALLOWED_HOSTS=127.0.0.1:4599.
// Uso: BASE_URL=http://localhost:3004 ADMIN_TOKEN=… node e2e/g1-editorial.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createJiti } from "jiti";
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:3000";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("ADMIN_TOKEN obrigatório");
  process.exit(2);
}
const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { g1LivePage, FIXTURE_POSTS } = await jiti.import("@/providers/g1/fixtures");

let fail = 0;
const ok = (c, m) => {
  console.log(c ? "PASS" : "FAIL", m);
  if (!c) fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, step = 500) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}
const admin = async (p, init = {}) => {
  const r = await fetch(B + p, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

// Debate fictício com id único por execução (manifesto + registro de fixture em diretório temporário)
const id = `e2e-g1-${Date.now().toString(36)}`;
const dataDir = mkdtempSync(path.join(tmpdir(), "monitora-g1-e2e-"));
cpSync(path.join(root, "e2e/fixtures/g1/data/debate-fixture-g1"), path.join(dataDir, id), { recursive: true });
const mf = path.join(dataDir, id, "manifest.json");
const m = JSON.parse(readFileSync(mf, "utf8"));
m.debate.id = id;
m.debate.startsAt = new Date(Date.parse(FIXTURE_POSTS[0].published) - 5 * 60_000).toISOString();
writeFileSync(mf, JSON.stringify(m));

// "g1" local: a página evolui durante o teste
let posts = FIXTURE_POSTS.slice(0, 3);
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(g1LivePage(posts));
}).listen(4599, "127.0.0.1");
const FIXTURE_URL = "http://127.0.0.1:4599/politica/eleicoes/2026/ao-vivo/debate-ficticio.ghtml";

/** Remove SOMENTE o que este E2E criou (dataset de tipo fixture) para não poluir o banco de desenvolvimento. */
async function cleanup(debateId) {
  const { loadLocalEnv, URL_VAR } = await import("../scripts/env.mjs");
  loadLocalEnv();
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env[URL_VAR[process.env.WORKER_ENV || "development"]]);
  await sql`delete from debate_source where debate_id = ${debateId}`;
  await sql`delete from debate_control where id = ${debateId}`;
  await sql`delete from debate where id = ${debateId} and dataset_id in (select id from dataset where kind = 'fixture')`;
}

let worker = null;
const startWorker = () => {
  worker = spawn(process.execPath, ["scripts/ingest.mjs", "--env", process.env.WORKER_ENV || "development", "--live", "--interval", "1"], {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, MONITORA_LOG: "silent", MONITORA_DATA_DIR: dataDir, MONITORA_DATASET_KIND: "fixture", G1_ALLOWED_HOSTS: "127.0.0.1:4599" },
  });
  worker.stderr.on("data", (d) => process.stderr.write(d));
};
const stopWorker = () =>
  new Promise((r) => {
    if (!worker || worker.exitCode !== null) return r();
    worker.once("exit", r);
    worker.kill("SIGINT");
  });
const live = async (eafter = 0) => (await fetch(`${B}/api/debates/${id}/live?eafter=${eafter}`)).json();

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
try {
  // ── Admin: cadastrar debate (manifesto) e fonte g1 por dados
  ok((await admin("/api/admin/debates", { method: "POST", body: JSON.stringify({ id, title: m.debate.title, officeLabel: "Presidente", jurisdiction: "BR", scheduledStart: m.debate.startsAt, sourceName: "g1 · cobertura editorial", providerId: "manifest-only", sourceMode: "live" }) })).status === 201, "admin cadastra debate (manifest-only)");
  ok((await admin(`/api/admin/debates/${id}/sources`, { method: "POST", body: JSON.stringify({ providerId: "g1-live-editorial", sourceUrl: null, pollingIntervalMs: 5000 }) })).status === 201, "fonte g1 cadastrada com URL pendente");
  const pending = (await admin(`/api/admin/debates/${id}/sources`)).body.data[0];
  ok(pending.records === null && pending.lastCollectedAt === null, "sem coleta: registros = não coletado (null), nunca 0");
  ok((await admin(`/api/admin/sources/${pending.id}`, { method: "POST", body: JSON.stringify({ action: "enable" }) })).body.error?.includes("pendente"), "fonte com URL pendente não pode ser ativada");
  ok((await admin(`/api/admin/debates/${id}/sources`, { method: "POST", body: JSON.stringify({ providerId: "g1-live-editorial", sourceUrl: "https://evil.example/ao-vivo/x", pollingIntervalMs: 5000 }) })).status === 400, "URL fora da allowlist recusada (SSRF)");
  ok((await admin(`/api/admin/debates/${id}/sources`, { method: "POST", body: JSON.stringify({ providerId: "g1-live-editorial", sourceUrl: FIXTURE_URL, pollingIntervalMs: 5000 }) })).status === 201, "URL configurada sem mudar código");
  const test = (await admin(`/api/admin/sources/${pending.id}`, { method: "POST", body: JSON.stringify({ action: "test" }) })).body.data;
  ok(test?.ok === true && test.updates === 3 && test.strategy === "json-ld", `testar conexão: ${test?.updates} atualizações via ${test?.strategy}`);
  for (const to of ["preparing", "connecting"]) ok((await admin(`/api/admin/debates/${id}`, { method: "POST", body: JSON.stringify({ to }) })).status === 200, `debate → ${to}`);
  ok((await admin(`/api/admin/sources/${pending.id}`, { method: "POST", body: JSON.stringify({ action: "enable" }) })).status === 200, "iniciar ingestão (ativar fonte)");

  // ── Worker → g1 provider → Neon → Repository
  startWorker();
  const first = await until(async () => {
    const s = await live();
    return s.editorialTotal >= 3 ? s : null;
  }, 40_000);
  ok(!!first, "worker coletou 3 atualizações e persistiu no Neon");
  ok(first?.editorial.every((i) => i.update.providerId === "g1-live-editorial" && i.update.publishedAt), "proveniência g1 com horário da fonte");

  // ── /ao-vivo
  await p.goto(`${B}/ao-vivo/${id}`, { waitUntil: "networkidle" });
  ok((await p.getByTestId("editorial-item").count()) === 3, "evento aparece em /ao-vivo");
  ok((await p.getByText("g1 · cobertura editorial").count()) >= 1 && (await p.getByText("Atualização editorial").count()) >= 3, "fonte claramente identificada: g1 · cobertura editorial / Atualização editorial");
  const itemsText = (await p.getByTestId("editorial-feed").innerText()).toLowerCase();
  ok(!itemsText.includes("transcri") && !itemsText.includes("disse exatamente"), "nenhuma atualização apresentada como transcrição");
  const agora = await p.getByTestId("agora-sentence").innerText();
  ok(/^Helena Duarte \(PFA\) questionou Rafael Monteiro \(PFB\) sobre segurança\.$/.test(agora), `AGORA usa o último evento editorial confiável ("${agora}")`);
  ok((await p.getByTestId("editorial-marker").count()) === 3, "linha do tempo com marcadores da cobertura");
  await p.getByTestId("editorial-marker").nth(1).click();
  ok((await p.getByTestId("editorial-marker-detail").innerText()).includes(FIXTURE_POSTS[1].text), "marcador abre horário, evento, tema, candidatos, fonte e texto original");
  ok((await p.getByTestId("editorial-analytics").innerText()).includes("Helena Duarte"), "analytics da cobertura (candidatos citados)");
  ok((await p.getByText("não indicam apoio").count()) >= 1, "aviso explícito: menção ≠ apoio");

  // ── Nova atualização + edição chegam sem recarregar
  posts = [...FIXTURE_POSTS.slice(0, 2), { ...FIXTURE_POSTS[2], text: FIXTURE_POSTS[2].text + " (atualizado)", modified: "2026-10-02T00:20:00.000Z" }, FIXTURE_POSTS[3]];
  const grew = await until(async () => ((await p.getByTestId("editorial-item").count()) === 4 && (await p.getByText("editado pela fonte (v2)").count()) === 1 ? true : null), 30_000);
  ok(!!grew, "nova atualização e edição aparecem por polling incremental (sem recarregar)");

  // ── Worker reiniciado: retoma sem duplicar
  await stopWorker();
  ok(worker.exitCode === 0, "worker encerra graciosamente");
  const before = (await live()).editorial.length;
  posts = FIXTURE_POSTS;
  startWorker();
  const after = await until(async () => {
    const s = await live();
    return s.editorialTotal === 5 ? s : null;
  }, 40_000);
  ok(!!after && after.editorial.length === before + 1 && new Set(after.editorial.map((i) => i.update.id)).size === after.editorial.length, `reinício sem duplicatas (${before} → ${after?.editorial.length})`);

  // ── Interromper ingestão pelo admin
  ok((await admin(`/api/admin/sources/${pending.id}`, { method: "POST", body: JSON.stringify({ action: "disable" }) })).status === 200, "interromper ingestão (desativar fonte)");
  await sleep(1500);
  posts = [...FIXTURE_POSTS, { id: "a0000000-0000-4000-8000-000000000099", text: "Fim do debate.", published: "2026-10-02T01:40:00.000Z" }];
  await sleep(8000);
  ok((await live()).editorialTotal === 5, "fonte desativada não coleta");

  // ── Refresh mantém tudo (vem do Neon); Fontes mostra o estado
  await p.reload({ waitUntil: "networkidle" });
  ok((await p.getByTestId("editorial-item").count()) === 5, "refresh mantém as 5 atualizações");
  await p.goto(`${B}/sources`, { waitUntil: "networkidle" });
  const row = await p.getByTestId(`editorial-source-${id}:g1-live-editorial`).innerText();
  ok(/desativada/i.test(row) && /\t5\t|\s5\s/.test(row) && !/Não coletado/.test(row), `Fontes: estado, registros e latência da fonte g1 (${row.replace(/\s+/g, " ")})`);
} finally {
  await stopWorker();
  await cleanup(id);
  server.close();
  await b.close();
  rmSync(dataDir, { recursive: true, force: true });
}
ok(errs.length === 0, "sem erros de página: " + errs.join(" | "));
process.exit(fail ? 1 : 0);
