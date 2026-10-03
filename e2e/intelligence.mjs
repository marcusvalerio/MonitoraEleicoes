// E2E de inteligência (fixture, banco de TESTE): TSE fixture → admin cria monitor → worker (YouTube simulado)
// → Neon → analytics → dashboards → filtros. Nunca toca dev/produção.
// Servidor: DATABASE_URL=$DATABASE_URL_TEST DATA_MODE=live ADMIN_TOKEN=… YOUTUBE_API_KEY=fixture next start
// Uso: BASE_URL=http://localhost:3005 ADMIN_TOKEN=… node e2e/intelligence.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { chromium } from "playwright";
import { loadLocalEnv } from "../scripts/env.mjs";

loadLocalEnv();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "scripts/shims/server-only.mjs") } });
const B = process.env.BASE_URL || "http://localhost:3000";
const TOKEN = process.env.ADMIN_TOKEN;
const URL_TEST = process.env.DATABASE_URL_TEST;
if (!TOKEN || !URL_TEST) {
  console.error("ADMIN_TOKEN e DATABASE_URL_TEST obrigatórios");
  process.exit(2);
}
let fail = 0;
const ok = (c, m) => {
  console.log(c ? "PASS" : "FAIL", m);
  if (!c) fail++;
};
const admin = async (body) => {
  const r = await fetch(`${B}/api/admin/intelligence`, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` } });
  return { status: r.status, body: await r.json() };
};
const seed = await jiti.import(path.join(root, "e2e/fixtures/intel-seed.ts"));

// 1) dados eleitorais (fixture TSE)
const ids = await seed.seedElections(URL_TEST);
const helena = ids["280000000001"];
const rafael = ids["280000000003"];

// 2) admin: fontes e monitor
let r = await admin();
ok(r.status === 200 && r.body.data.sources.length >= 7, "admin: fontes sincronizadas");
ok(r.body.data.sources.find((s) => s.id === "tiktok").accessStatus === "unsupported", "admin: TikTok sem API adequada (unsupported)");
r = await admin({ action: "source_enable", id: "x", enabled: true });
ok(r.status === 409, "admin: fonte sem acesso não pode ser ativada");
r = await admin({ action: "source_enable", id: "youtube", enabled: true });
ok(r.status === 200, "admin: YouTube ativado");
r = await admin({ action: "monitor_upsert", monitor: { id: "e2e-presidente", name: "Presidente 2026 (E2E)", electionYear: 2026, officeIds: [1], candidacyIds: [helena.id, rafael.id], parties: [], ufs: [], terms: ["debate presidencial", "Helena Duarte"], platforms: ["youtube", "x"], intervalS: 3600, status: "draft", debateId: null } });
ok(r.status === 200, "admin: monitor criado");
r = await admin({ action: "monitor_upsert", monitor: { id: "bad", name: "x", electionYear: 2026, officeIds: [], candidacyIds: [], parties: [], ufs: [], terms: [], platforms: ["youtube"], intervalS: 10, status: "draft", debateId: null } });
ok(r.status === 400, "admin: monitor inválido recusado");
ok((await admin({ action: "monitor_status", id: "e2e-presidente", status: "active" })).status === 200, "admin: monitor ativado");

// 3) workers (social + apuração com arquivos oficiais do TSE)
await seed.runWorker(URL_TEST);
const count = await seed.runCount(URL_TEST);
ok(count.newSnapshots === 2 && count.notPublished === 1 && count.errors === 0, "apuração: 2 arquivos oficiais coletados, 1 não publicado");

// 4) dashboards
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const PERIOD = "periodo=custom&de=2026-10-02T00:00:00.000Z&ate=2026-10-02T02:00:00.000Z";
const main = async (u) => {
  const res = await p.goto(B + u, { waitUntil: "networkidle" });
  return { status: res.status(), body: (await p.textContent("main")) ?? "" };
};

let t = await main(`/monitoramento?${PERIOD}`);
ok(t.status === 200 && (await p.getByTestId("coverage-youtube").count()) === 1, "monitoramento: cobertura do YouTube");
ok(/requer autorização/i.test(await p.getByTestId("coverage-x").innerText()), "monitoramento: X marcado como requer autorização");
ok(/6/.test(await p.getByTestId("funnel").innerText()), "monitoramento: funil com 6 conteúdos coletados");
ok(/RAFAEL MONTEIRO/.test(t.body) && /HELENA DUARTE/.test(t.body), "monitoramento: candidatos mencionados");
ok(!/vencedor|ganhou|mais popular|melhor candidat/i.test(t.body), "monitoramento: sem juízo político");
await p.getByTestId("series-chart").locator("svg").hover();
ok((await p.getByTestId("series-tooltip").count()) === 1, "série: tooltip ao passar o mouse");

t = await main(`/monitoramento?${PERIOD}&plataforma=x`);
ok(/Não coletado/.test(t.body), "filtro plataforma X ⇒ 'Não coletado' (não 0)");
t = await main(`/monitoramento?${PERIOD}&tipo=reply`);
ok(/1/.test(await p.getByTestId("funnel").innerText()), "filtro tipo=resposta");
t = await main(`/monitoramento?periodo=custom&de=2026-09-01T00:00:00.000Z&ate=2026-09-02T00:00:00.000Z`);
ok(/Não coletado/.test(t.body), "período sem coleta ⇒ 'Não coletado'");

t = await main("/eleicoes?ano=2022&cargo=3&uf=RJ");
ok(/HELENA/.test(await p.getByTestId("results-table").innerText()), "eleições: resultado fixture 2022 Governador RJ");
t = await main("/eleicoes?ano=2026");
ok(/não publicados/.test(t.body), "eleições 2026: resultados não publicados (sem números)");
t = await main("/eleicoes?ano=2026");
ok((await p.getByTestId("count-view").getByTestId("count-state").getAttribute("data-state")) === "nao_iniciada", "apuração 2026: 'Não iniciada' (arquivo oficial publicado, totalização não começou)");
ok(/Não coletado/.test(await p.getByTestId("count-table").innerText()) && !/\b0 votos\b/.test(t.body), "apuração 2026: votos 'Não coletado', nunca '0 votos'");
t = await main("/eleicoes?ano=2026&cargo=1&uf=SP");
ok((await p.getByTestId("count-view").getByTestId("count-state").getAttribute("data-state")) === "nao_coletada", "apuração 2026 (SP): 'Não coletada'");
t = await main("/eleicoes?ano=2026&cargo=1&uf=AC");
ok((await p.getByTestId("count-view").getByTestId("count-state").getAttribute("data-state")) === "indisponivel", "apuração 2026 (AC, arquivo 404): 'Dado indisponível'");
t = await main("/eleicoes?ano=2022&cargo=3&uf=RJ");
ok((await p.getByTestId("election-map").count()) === 1, "eleições: camada eleitoral no MapCanvas");
t = await main("/comparar?cargo=3&uf=RJ&partido=PFA,PFB");
ok(/2\.500/.test(await p.getByTestId("compare-cycles").innerText()) && /não publicado/.test(await p.getByTestId("compare-cycles").innerText()), "comparar: ciclos no mesmo recorte; 2026 'não publicado'");
t = await main(`/comparar?pessoa=${helena.personId}`);
ok(/Deputado Federal/.test(await p.getByTestId("compare-people").innerText()), "comparar: trajetória por identidade");
const r307 = await fetch(B + "/elections?ano=2018", { redirect: "manual" });
ok(r307.status === 307 && /\/eleicoes\?ano=2018$/.test(r307.headers.get("location") ?? ""), "rota antiga /elections redireciona preservando filtros");
t = await main(`/candidatos/${helena.personId}`);
const hist = await p.getByTestId("person-history").innerText();
ok(["2014", "2018", "2022", "2026"].every((y) => hist.includes(y)), "perfil: trajetória em 4 ciclos por vínculo de identidade");
t = await main(`/comparar?c=${helena.id},${rafael.id}&${PERIOD}`);
ok((await p.getByTestId("compare-grid").locator("section, div > p").count()) > 0 && /RAFAEL MONTEIRO/.test(t.body), "comparador lado a lado");
t = await main("/admin/inteligencia");
ok(t.status === 200, "admin/inteligência 200");

ok(errs.length === 0, "sem erros de console: " + errs.join(" | "));
await b.close();
process.exit(fail ? 1 : 0);
