// E2E da ingestão contínua: admin → worker (processo real) → Neon → Repository → /ao-vivo.
// Requer: servidor com DATA_MODE=live + ADMIN_TOKEN, banco de desenvolvimento migrado e com o debate RJ.
// Uso: BASE_URL=http://localhost:3004 ADMIN_TOKEN=… node e2e/live-ingest.mjs
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:3000";
const TOKEN = process.env.ADMIN_TOKEN;
const ENV = process.env.WORKER_ENV || "development";
const ORIGIN = "rj-governador-2026-09-29-globo";
if (!TOKEN) {
  console.error("ADMIN_TOKEN obrigatório");
  process.exit(2);
}
let fail = 0;
const ok = (c, m) => {
  console.log(c ? "PASS" : "FAIL", m);
  if (!c) fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = (path, init = {}) => fetch(B + path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` } });
const live = async (id, after = 0) => (await fetch(`${B}/api/debates/${id}/live?after=${after}`)).json();
async function until(fn, ms, step = 500) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}
let worker = null;
const startWorker = () => {
  worker = spawn(process.execPath, ["scripts/ingest.mjs", "--env", ENV, "--live", "--interval", "1"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MONITORA_LOG: "silent" } });
  worker.stderr.on("data", (d) => process.stderr.write(d));
};
const stopWorker = () =>
  new Promise((r) => {
    if (!worker || worker.exitCode !== null) return r();
    worker.once("exit", r);
    worker.kill("SIGINT");
  });

const id = `e2e-replay-${Date.now().toString(36)}`;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
try {
  // ── Segurança do admin
  ok((await fetch(`${B}/api/admin/debates`)).status === 401, "admin sem token → 401");
  ok((await fetch(`${B}/api/ingest`, { method: "POST" })).status !== 200, "ingestão via API continua protegida");

  // ── Cadastro por dados + ciclo scheduled → preparing → connecting → (worker) live
  const created = await admin("/api/admin/debates", { method: "POST", body: JSON.stringify({ id, title: "REPLAY · Debate RJ (E2E)", officeLabel: "Governador", jurisdiction: "RJ", scheduledStart: new Date().toISOString(), sourceName: "Replay temporizado", providerId: "replay-transcript", sourceMode: "replay", replayOf: ORIGIN, replaySpeed: 10, candidates: [] }) });
  ok(created.status === 201, "cadastro de debate por dados (201)");
  ok((await admin(`/api/admin/debates/${id}`, { method: "POST", body: JSON.stringify({ to: "live" }) })).status === 409, "transição inválida scheduled → live recusada (409)");
  for (const to of ["preparing", "connecting"]) ok((await admin(`/api/admin/debates/${id}`, { method: "POST", body: JSON.stringify({ to }) })).ok, `transição → ${to}`);

  startWorker();
  const firstSeg = await until(async () => {
    const s = await live(id);
    return s.totals?.segments >= 1 ? s : null;
  }, 40_000);
  ok(!!firstSeg, "worker liberou o 1º segmento: provider → RAW → Neon → Repository");
  ok(firstSeg?.control?.status === "live", "worker moveu connecting → live");

  // ── /ao-vivo: replay identificado, nunca "AO VIVO"
  await p.goto(`${B}/ao-vivo/${id}`, { waitUntil: "networkidle" });
  ok((await p.getByTestId("replay-badge").count()) === 1, "badge REPLAY visível");
  ok((await p.getByText("AO VIVO", { exact: true }).count()) === 0, "não declara AO VIVO para replay");
  ok((await p.getByTestId("replay-note").innerText()).includes("não é transmissão ao vivo"), "nota de replay explícita");
  ok((await p.getByText("horário sintético").count()) >= 1, "horário marcado como sintético");
  const c1 = await p.getByTestId("live-segment").count();

  // ── Worker reiniciado no meio
  await stopWorker();
  ok(worker.exitCode === 0, "worker encerra graciosamente (SIGINT)");
  const mid = (await live(id)).totals.segments;
  await sleep(4000);
  startWorker();

  // ── Atualização incremental na página aberta (sem recarregar)
  const grew = await until(async () => ((await p.getByTestId("live-segment").count()) > c1 ? true : null), 40_000);
  ok(!!grew, `página recebeu novos segmentos por polling incremental (${c1} → ${await p.getByTestId("live-segment").count()})`);
  const lat = await until(async () => {
    const t = await p.getByTestId("live-latency").innerText();
    return /^\d+,\d s$/.test(t) ? t : null;
  }, 20_000);
  ok(!!lat, `latência de processamento exibida (${lat})`);

  // ── Replay termina: todos os segmentos, sem duplicatas
  const done = await until(async () => {
    const s = await live(id);
    return s.control?.status === "finished" ? s : null;
  }, 60_000);
  ok(!!done, "replay concluído → estado 'finished'");
  const all = await live(id, 0);
  const seqs = all.segments.map((s) => s.seq);
  ok(all.totals.segments === 5 && new Set(seqs).size === seqs.length && seqs.length === 5, `5 segmentos sem duplicatas após reinício (antes do reinício: ${mid})`);
  ok(all.totals.analyzed === 5, "todos analisados");
  ok(all.segments.every((s) => s.timing.precision === "synthetic" && s.capture.sourceMode === "replay"), "proveniência de replay em todos os segmentos");

  // ── Refresh: estado vem do banco
  await p.reload({ waitUntil: "networkidle" });
  ok((await p.getByTestId("live-segment").count()) === 5, "refresh da página mantém os 5 segmentos (lidos do Neon)");
  ok((await p.getByTestId("live-connection").innerText()).toLowerCase().includes("encerrado"), "conexão: Encerrado");

  // ── Segmento sem horário (fonte original): '—', nunca horário inventado
  await p.goto(`${B}/ao-vivo/${ORIGIN}`, { waitUntil: "networkidle" });
  const times = await p.getByTestId("seg-time").allInnerTexts();
  ok(times.length === 5 && times.every((t) => t === "—"), "fonte sem horário: '—' em todas as falas");
  ok((await p.getByTestId("replay-badge").count()) === 0 && (await p.getByText("AO VIVO", { exact: true }).count()) === 0, "fonte de arquivo: nem replay nem ao vivo");

  // ── Provider offline: erro registrado e visível (sem inventar estado)
  const bad = `${id}-offline`;
  await admin("/api/admin/debates", { method: "POST", body: JSON.stringify({ id: bad, title: "REPLAY · origem inexistente", officeLabel: "Governador", scheduledStart: new Date().toISOString(), sourceName: "Replay", providerId: "replay-transcript", sourceMode: "replay", replayOf: "nao-existe", replaySpeed: 10 }) });
  for (const to of ["preparing", "connecting"]) await admin(`/api/admin/debates/${bad}`, { method: "POST", body: JSON.stringify({ to }) });
  const errored = await until(async () => {
    const r = await (await admin("/api/admin/debates")).json();
    const c = r.data.find((x) => x.id === bad);
    return c?.lastError ? c : null;
  }, 40_000);
  ok(!!errored, `provider offline: falha registrada no controle (${errored?.lastError?.slice(0, 60)}…)`);
  const hist = await (await admin(`/api/admin/debates/${bad}`)).json();
  ok(hist.data.map((h) => h.to_status).join(">") .startsWith("scheduled>preparing>connecting"), "histórico de transições registrado");
  ok((await fetch(`${B}/api/debates/${bad}/live`)).status === 404, "fonte offline não cria debate fantasma (404 no /live)");
  await admin(`/api/admin/debates/${bad}`, { method: "POST", body: JSON.stringify({ to: "error", reason: "e2e" }) });

  // Limpeza: arquiva os controles criados (dados permanecem como registro)
  await admin(`/api/admin/debates/${id}`, { method: "POST", body: JSON.stringify({ to: "archived" }) });
} finally {
  await stopWorker();
  await b.close();
}
ok(errs.length === 0, "sem erros de página: " + errs.join(" | "));
process.exit(fail ? 1 : 0);
