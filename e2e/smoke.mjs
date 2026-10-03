import { chromium } from "playwright";
const B = process.env.BASE_URL || "http://localhost:3000", D = process.env.DEBATE_ID || "debate-presidencial-2026-1t";
const EXTRA = process.env.DEBATE_ID ? [] : ["/debates/debate-presidencial-2026-sabatina", "/debates/debate-presidencial-2026-sabatina/analytics"];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
let fail = 0; const ok = (c, m) => { console.log(c ? "PASS" : "FAIL", m); if (!c) fail++; };
for (const r of ["/", "/overview", "/debates", `/debates/${D}`, `/debates/${D}/live`, `/debates/${D}/analytics`, "/social", "/map", "/map?territorio=UF:RJ", "/elections", "/elections/2026/RJ/rio", "/eleicoes", "/analyses", "/sources", "/methodology", "/api/debates", `/api/debates/${D}/transcript?limit=5`, "/api/repercussion?granularity=900", "/api/repercussion/candidates", "/api/elections/2026-geral/results", "/api/sources", ...EXTRA]) {
  const res = await p.goto(B + r, { waitUntil: "networkidle" }); ok(res.status() === 200, `${r} ${res.status()}`);
}
ok((await p.goto(B + "/debates/nope")).status() === 404, "404 debate inexistente");
ok((await (await fetch(`${B}/api/debates/${D}/feed?from=10&to=5`)).status) === 400, "feed janela inválida → 400");
// Live ingestão
await p.goto(`${B}/debates/${D}/live`, { waitUntil: "networkidle" });
const count = () => p.locator("ol[aria-live] > li[id^=seg-]").count();
const c0 = await count(); await p.getByRole("button", { name: "10×" }).click();
// Em 10× uma fala longa pode ocupar a janela inteira: espera até 30 s por uma nova fala concluída.
for (let t = 0; t < 30 && (await count()) <= c0; t++) await p.waitForTimeout(1000);
ok((await count()) > c0, `live ingere novas falas (${c0} → ${await count()})`);
// Mapa: drill-down Brasil → Estado → municípios
await p.goto(`${B}/map`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /^São Paulo:/ }).click();
await p.waitForTimeout(1500);
ok((await p.getByRole("button", { name: /^Campinas:/ }).count()) === 1, "mapa: drill-down SP → municípios");
await p.getByRole("radio", { name: "Tendência" }).click();
await p.waitForTimeout(600);
ok(/Tendência|crescendo/.test((await p.textContent("main")) ?? ""), "mapa: troca de camada");
ok((await (await fetch(`${B}/api/geo?parent=UF:XX&to=100`)).status) === 404, "api geo: território inválido → 404");
// Cobertura geográfica e contratos de API
const geo = await (await fetch(`${B}/api/geo?debate=${D}&parent=BR&to=3000`)).json();
ok(geo.coverage.totalRecords > geo.coverage.geolocatedRecords && geo.coverage.coveragePercentage > 0, `cobertura geo informada (${Math.round(geo.coverage.coveragePercentage * 100)}%)`);
const res = await (await fetch(`${B}/api/elections/2026-geral/results`)).json();
ok(res.meta.status === "not_collected" && res.data.length === 0, "resultados oficiais: not_collected (nunca zero)");
const page = await (await fetch(`${B}/api/debates/${D}/transcript?limit=3`)).json();
ok(page.data.length === 3 && page.meta.hasMore && page.data[0].analysis.model.model && page.data[0].record.externalId, "transcrição paginada com análise e registro de origem");
// Busca
await p.keyboard.press("Control+k"); await p.getByLabel("Termo de busca").fill("Helena"); await p.waitForTimeout(800);
ok((await p.getByRole("dialog").getByText("Helena Duarte").count()) > 0, "busca global encontra candidato");
// Texto proibido
const body = (await p.goto(B + "/overview").then(() => p.textContent("body"))) ?? "";
ok(!/ganhou o debate|vencedor|mais popular|melhor candidat/i.test(body.replace(/“venceu”/g, "")), "overview sem linguagem de juízo político");
ok(errs.filter((e) => !e.includes("404")).length === 0, "sem erros de console: " + errs.join(" | "));
await b.close(); process.exit(fail ? 1 : 0);
