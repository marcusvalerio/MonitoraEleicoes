#!/usr/bin/env node
/**
 * DEMONSTRAÇÃO (somente teste/dev) — servidor local que imita o sistema de divulgação do TSE servindo o REPLAY da
 * apuração presidencial de 2022 (1º turno) montado por build-replay-2022.mjs a partir de dados OFICIAIS.
 *
 *   etapa 0      → todos os arquivos "não iniciada" (seções totalizadas = 0, como o TSE publica antes da apuração)
 *   etapa k      → UFs liberadas recebem seu total OFICIAL final; BR = soma oficial das UFs liberadas
 *   última etapa → todas as UFs + exterior ⇒ BR totalizado (tf = "s"), situação oficial ("2º TURNO", "NÃO ELEITO")
 * Ordem de liberação: eleitorado crescente (regra da demonstração — NÃO é a ordem/horário real de 2022).
 *
 * Falhas injetadas (para testar o worker): 404 (arquivo ainda não publicado), timeout, 503 temporário e etapas
 * sem alteração de conteúdo. Todo arquivo traz "demonstracao": "...REPLAY...".
 *
 * Uso: node scripts/demo/tse-replay-server.mjs [--port 4600] [--step-seconds 45] [--per-step 3]
 * Controle: GET /__demo/state · POST /__demo/next · POST /__demo/reset
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const PORT = Number(arg("--port", "4600"));
const STEP_S = Number(arg("--step-seconds", "45"));
const PER_STEP = Number(arg("--per-step", "3"));
const D = JSON.parse(readFileSync(path.join(process.cwd(), ".monitora", "demo", "replay-2022", "data.json"), "utf-8"));
const MARK = "DEMONSTRAÇÃO · REPLAY da apuração presidencial de 2022 (1º turno) com totais oficiais do TSE · ambiente de teste";
const UFS = Object.keys(D.totals).filter((u) => u !== "ZZ").sort((a, b) => D.totals[a].te - D.totals[b].te);
const STEPS = [[], ...Array.from({ length: Math.ceil(UFS.length / PER_STEP) }, (_, i) => UFS.slice(i * PER_STEP, (i + 1) * PER_STEP))];
// Etapa extra sem novidade (mesmo conteúdo ⇒ worker deve registrar "sem alteração") antes do exterior + encerramento.
const FINAL = STEPS.length + 1;
let step = 0;
/** Horário de totalização FIXO por abrangência (como o TSE): definido na 1ª vez que o arquivo é servido como final. */
const doneAt = new Map();
let startedAt = Date.now();
const log = [];
const FAULTS = {
  notPublished: { step: 1, uf: UFS[0] }, // 1º arquivo liberado ainda "não publicado" na etapa 1 (404)
  timeout: { step: 2, uf: UFS[3], once: true }, // estoura o timeout do worker (15 s)
  unavailable: { step: 3, uf: UFS[6], once: true }, // HTTP 503 temporário
};
const fired = new Set();

const released = () => {
  const s = new Set(STEPS.slice(0, Math.min(step, STEPS.length - 1) + 1).flat());
  if (step >= FINAL) s.add("ZZ");
  return s;
};
const pad = (n) => String(n).padStart(2, "0");
const brt = (ms) => {
  const d = new Date(ms - 3 * 3600_000);
  return { d: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`, h: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` };
};
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(2).replace(".", ",") : "0,00");
const pctn = (a, b) => (b ? ((a / b) * 100).toFixed(9).replace(".", ",") : "0");

/** Monta um arquivo no formato "-u.json" (campos usados pelo normalizador + marca de demonstração). */
function file(abr, ufs, final) {
  const t = { te: 0, ts: 0, st: 0, c: 0, a: 0, vv: 0, vb: 0, vn: 0 };
  const scope = abr === "br" ? [...Object.keys(D.totals)] : [abr.toUpperCase()];
  const votes = {};
  for (const uf of scope) {
    const x = D.totals[uf];
    t.te += x.te;
    t.ts += x.ts;
    if (!ufs.has(uf)) continue;
    t.st += x.ts;
    t.c += x.c; t.a += x.a; t.vv += x.vv; t.vb += x.vb; t.vn += x.vn;
    for (const [id, v] of Object.entries(D.votesByUf[uf] ?? {})) votes[id] = (votes[id] ?? 0) + v;
  }
  const started = t.st > 0;
  const now = brt(Date.now());
  if (final && !doneAt.has(abr)) doneAt.set(abr, Date.now());
  const done = brt(doneAt.get(abr) ?? Date.now());
  const byParty = {};
  for (const c of D.candidates) {
    if (!(c.id in Object.fromEntries(Object.values(D.votesByUf).flatMap((m) => Object.keys(m).map((k) => [k, 1]))))) continue;
    const vap = votes[c.id] ?? 0;
    (byParty[c.sg] ??= []).push({ n: String(c.n), sqcand: c.sq, nm: c.nm, nmu: c.nmu, dvt: "Válido", e: "n", st: final && abr === "br" ? c.st : "", vap: started ? String(vap) : "0", pvap: started ? pct(vap, t.vv) : "0,00", pvapn: started ? pctn(vap, t.vv) : "0" });
  }
  return {
    demonstracao: MARK,
    ele: "544", t: "1", f: "o", tpabr: abr === "br" ? "br" : "uf", cdabr: abr, dg: now.d, hg: now.h,
    dt: final ? done.d : "", ht: final ? done.h : "", tf: final ? "s" : "n",
    s: { ts: String(t.ts), st: String(t.st), pst: pct(t.st, t.ts) },
    e: { te: String(t.te), c: started ? String(t.c) : "0", a: started ? String(t.a) : "0" },
    v: { vv: started ? String(t.vv) : "0", vb: started ? String(t.vb) : "0", vn: started ? String(t.vn) : "0" },
    carg: [{ cd: "1", nmn: "Presidente", agr: Object.entries(byParty).map(([sg, cand]) => ({ par: [{ sg, cand }] })) }],
  };
}

const CONFIG = { demonstracao: MARK, pl: [{ c: "ele2022", e: [{ cd: "544", cdt2: "545", nm: "DEMONSTRAÇÃO · replay Eleição Ordinária 2022 1º Turno", t: "1", tp: "8", abr: [{ cd: "br", cp: [{ cd: "1", ds: "Presidente", tp: "1" }] }] }] }] };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  if (url.pathname === "/__demo/state") return send(200, { step, steps: FINAL, released: [...released()], startedAt, log: log.slice(-50) });
  if (url.pathname === "/__demo/next" && req.method === "POST") return send(200, { step: (step = Math.min(FINAL, step + 1)) });
  if (url.pathname === "/__demo/reset" && req.method === "POST") return (step = 0), fired.clear(), doneAt.clear(), (startedAt = Date.now()), send(200, { step });
  if (url.pathname === "/oficial/comum/config/ele-c.json") return send(200, CONFIG);
  const m = /^\/oficial\/ele2022\/544\/dados\/([a-z]{2})\/([a-z]{2})-c0001-e000544-u\.json$/.exec(url.pathname);
  if (!m || m[1] !== m[2]) return send(404, "not found", "text/plain");
  const abr = m[1];
  const at = new Date().toISOString();
  for (const [kind, f] of Object.entries(FAULTS)) {
    if (f.step !== step || f.uf.toLowerCase() !== abr || (f.once && fired.has(kind))) continue;
    fired.add(kind);
    log.push({ at, step, abr, fault: kind });
    if (kind === "notPublished") return send(404, "not found", "text/plain");
    if (kind === "timeout") return void setTimeout(() => send(200, file(abr, released(), false)), 20_000);
    if (kind === "unavailable") return send(503, "unavailable", "text/plain");
  }
  const rel = released();
  const final = abr === "br" ? step >= FINAL : rel.has(abr.toUpperCase());
  log.push({ at, step, abr, served: final ? "final" : rel.has(abr.toUpperCase()) || abr === "br" ? "parcial" : "nao_iniciada" });
  if (log.length > 2000) log.splice(0, 1000);
  send(200, file(abr, rel, final));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(JSON.stringify({ msg: "demo.tse_replay.listening", port: PORT, steps: FINAL, perStep: PER_STEP, stepSeconds: STEP_S, order: UFS, mark: MARK }));
  if (STEP_S > 0)
    setInterval(() => {
      if (step < FINAL) {
        step++;
        console.log(JSON.stringify({ msg: "demo.step", step, at: new Date().toISOString(), released: [...released()] }));
      }
    }, STEP_S * 1000);
});
