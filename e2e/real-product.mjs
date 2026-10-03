// E2E do PRODUTO REAL (perfil live, SEM MONITORA_ALLOW_SYNTHETIC): nenhuma marca de dado fictício/teste,
// nenhum "0 votos", sem overflow no mobile, sem erros de console, botões com nome acessível, busca por teclado.
// Uso: BASE_URL=http://localhost:3000 node e2e/real-product.mjs   (servidor: DATA_MODE=live, banco dev migrado)
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:3000";
const ROUTES = ["/", "/apuracao", "/login", "/avaliacao", "/ao-vivo", "/eleicoes", "/eleicoes?ano=2026", "/eleicoes?ano=2022&cargo=3&uf=SP", "/candidatos", "/partidos", "/partido/PT", "/pesquisas", "/comparar?partido=PT,PL", "/monitoramento", "/fontes", "/metodologia", "/debates"];
const FORBIDDEN = /fictíci|simulad|\(E2E\)|Demonstração|\b0 votos\b|vencedor|ganhou a eleição|melhor candidat/i;
let fail = 0;
const ok = (c, m) => {
  console.log(c ? "PASS" : "FAIL", m);
  if (!c) fail++;
};
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const m = await b.newPage({ viewport: { width: 390, height: 800 } });
const errs = [];
for (const pg of [p, m]) {
  pg.on("pageerror", (e) => errs.push(String(e)));
  pg.on("console", (x) => x.type() === "error" && errs.push(x.text()));
}
const src = await (await fetch(`${B}/api/sources`)).json();
ok(src.meta.status.profile === "live", "perfil efetivo = live (sem dados sintéticos)");
for (const r of ROUTES) {
  const res = await p.goto(B + r, { waitUntil: "networkidle" });
  const body = (await p.textContent("body")) ?? "";
  ok(res.status() === 200, `${r} 200`);
  ok(!FORBIDDEN.test(body), `${r} sem dado fictício/teste, '0 votos' ou juízo político${FORBIDDEN.test(body) ? ` (achou: ${body.match(FORBIDDEN)[0]})` : ""}`);
  const unnamed = await p.$$eval("button", (bs) => bs.filter((x) => !(x.getAttribute("aria-label") || x.textContent?.trim() || x.getAttribute("title"))).length);
  ok(unnamed === 0, `${r} botões com nome acessível`);
  await m.goto(B + r, { waitUntil: "networkidle" });
  ok((await m.evaluate(() => document.documentElement.scrollWidth)) <= 391, `${r} sem overflow horizontal no mobile`);
}
await p.goto(B + "/", { waitUntil: "networkidle" });
ok(/Não iniciada|Em apuração|Parcial|Totalizada|Não coletada|Dado indisponível/.test(await p.getByTestId("home-modules").innerText()), "home: estado explícito da apuração");
await p.keyboard.press("Control+k");
await p.getByLabel("Termo de busca").fill("São Paulo");
const found = await p.getByRole("dialog").getByText(/Estado · SP|Município/).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
ok(found, "busca global: estados/municípios reais");
await p.keyboard.press("Escape");
// apuração: estado explícito; estrela acompanha sem reordenar a classificação oficial
await p.goto(B + "/apuracao", { waitUntil: "networkidle" });
ok(/não iniciada|ao vivo|encerrada|indisponível/i.test(await p.getByTestId("live-status").innerText()), "apuração: estado explícito");
const order = () => p.$$eval("[data-testid=board-row]", (r) => r.map((x) => x.dataset.sq).join());
const before = await order();
if (before) {
  await p.getByTestId("follow-toggle").last().click();
  await p.waitForTimeout(600);
  ok((await order()) === before, "apuração: acompanhar não altera a ordem oficial");
  ok((await p.getByTestId("followed-panel").locator("li").count()) >= 1, "apuração: SEU ACOMPANHAMENTO mostra a candidatura");
  ok((await p.getByTestId("elected-badge").count()) === 0 || /Totalizada|encerrada/i.test(await p.textContent("body")), "apuração: ELEITO só com totalização oficial");
  await p.getByTestId("follow-toggle").last().click();
}
await m.goto(B + "/", { waitUntil: "networkidle" });
await m.getByTestId("mobile-menu").click();
ok((await m.getByRole("dialog", { name: "Menu" }).getByRole("link").count()) >= 11, "mobile: gaveta com navegação completa (11 itens após ocultar debates)");
ok(errs.length === 0, "sem erros de console: " + errs.slice(0, 3).join(" | "));
await b.close();
process.exit(fail ? 1 : 0);
