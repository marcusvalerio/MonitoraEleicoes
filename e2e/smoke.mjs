import { chromium } from "playwright";
const B = process.env.BASE_URL || "http://localhost:3000", D = "debate-presidencial-2026-1t";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
let fail = 0; const ok = (c, m) => { console.log(c ? "PASS" : "FAIL", m); if (!c) fail++; };
for (const r of ["/", "/overview", "/debates", `/debates/${D}`, `/debates/${D}/live`, `/debates/${D}/analytics`, "/social", "/elections", "/elections/2026/RJ/rio", "/analyses", "/sources", "/methodology", "/debates/debate-presidencial-2026-sabatina", "/debates/debate-presidencial-2026-sabatina/analytics"]) {
  const res = await p.goto(B + r, { waitUntil: "networkidle" }); ok(res.status() === 200, `${r} ${res.status()}`);
}
ok((await p.goto(B + "/debates/nope")).status() === 404, "404 debate inexistente");
ok((await (await fetch(`${B}/api/debates/${D}/feed?from=10&to=5`)).status) === 400, "feed janela inválida → 400");
// Live ingestão
await p.goto(`${B}/debates/${D}/live`, { waitUntil: "networkidle" });
const count = () => p.locator("ol[aria-live] > li[id^=seg-]").count();
const c0 = await count(); await p.getByRole("button", { name: "16×" }).click(); await p.waitForTimeout(9000);
ok((await count()) > c0, `live ingere novas falas (${c0} → ${await count()})`);
// Busca
await p.keyboard.press("Control+k"); await p.getByLabel("Termo de busca").fill("Helena"); await p.waitForTimeout(800);
ok((await p.getByRole("dialog").getByText("Helena Duarte").count()) > 0, "busca global encontra candidato");
// Texto proibido
const body = (await p.goto(B + "/overview").then(() => p.textContent("body"))) ?? "";
ok(!/ganhou o debate|vencedor|mais popular|melhor candidat/i.test(body.replace(/“venceu”/g, "")), "overview sem linguagem de juízo político");
ok(errs.filter((e) => !e.includes("404")).length === 0, "sem erros de console: " + errs.join(" | "));
await b.close(); process.exit(fail ? 1 : 0);
