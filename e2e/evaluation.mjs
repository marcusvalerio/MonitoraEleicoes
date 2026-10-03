// E2E — autenticação, RBAC e Avaliação (banco de TESTE preparado por e2e/evaluation-seed.mjs).
// Fluxo: ADMIN login → troca obrigatória → cria campanhas → cria usuários → define OWNER → OWNER login → Avaliação →
// investimento único e recorrente → totais → filtros → timeline → resultado oficial (fixture ⇒ DEMONSTRAÇÃO) →
// estado sem resultado → ADMIN visualiza → usuário de outra campanha é NEGADO → mobile.
// Uso: BASE_URL=http://127.0.0.1:3020 node e2e/evaluation.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://127.0.0.1:3020";
const ADMIN = JSON.parse(readFileSync(".monitora/e2e-admin.json", "utf-8"));
const NEWPW = () => `nova-senha-${Math.random().toString(36).slice(2, 10)}-ok`;
let fail = 0;
const ok = (c, m) => {
  console.log(c ? "PASS" : "FAIL", m);
  if (!c) fail++;
};
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errs = [];
const ctx = async (vp = { width: 1440, height: 900 }) => {
  const c = await b.newContext({ viewport: vp });
  const p = await c.newPage();
  p.on("pageerror", (e) => errs.push(String(e)));
  return p;
};

async function login(p, email, password) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await p.goto(`${B}/login`, { waitUntil: "networkidle" });
    await p.fill("#email", email);
    await p.fill("#password", password);
    await p.click("button[type=submit]");
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(600);
    // limite de tentativas do provedor (proteção real contra força bruta): aguarda a janela e tenta de novo
    const msg = (await p.getByTestId("login-error").textContent({ timeout: 300 }).catch(() => "")) ?? "";
    if (!/Muitas tentativas/.test(msg)) {
      if (!msg) await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 8000 }).catch(() => {});
      return;
    }
    await p.waitForTimeout(11_000);
  }
}
async function forcedChange(p, current) {
  await p.waitForURL(/\/conta\/senha/, { timeout: 15000 });
  const pw = NEWPW();
  await p.fill("#current", current);
  await p.fill("#next", pw);
  await p.fill("#confirm", pw);
  await p.click("button[type=submit]");
  await p.waitForLoadState("networkidle");
  return pw;
}

// ── Proteção sem sessão
const anon = await ctx();
await anon.goto(`${B}/avaliacao`);
ok(anon.url().includes("/login?next=%2Favaliacao"), "sem sessão: /avaliacao → /login");
await anon.goto(`${B}/admin/usuarios`);
ok(anon.url().includes("/login"), "sem sessão: /admin → /login");
const r401 = await fetch(`${B}/api/auth/admin/list-users`);
ok(r401.status === 401 || r401.status === 403, `API admin do provedor sem sessão é recusada (${r401.status})`);
await login(anon, ADMIN.email, "senha-errada-123456789");
ok(await anon.getByTestId("login-error").waitFor({ timeout: 8000 }).then(() => true, () => false), "login inválido é recusado com mensagem");

// ── ADMIN
const admin = await ctx();
await login(admin, ADMIN.email, ADMIN.password);
ADMIN.password = await forcedChange(admin, ADMIN.password);
ok(admin.url().endsWith("/admin") || admin.url().includes("/admin/campanhas"), "ADMIN: troca obrigatória da senha inicial → /admin");
await admin.goto(`${B}/admin/campanhas`, { waitUntil: "networkidle" });
ok(admin.url().includes("/admin/campanhas"), `ADMIN: sessão mantida após trocar a senha (${admin.url()})`);
async function newCampaign(name, search, year, pickText) {
  await admin.fill("#c-name", name);
  await admin.selectOption('select[aria-label="Ano da eleição"]', String(year));
  await admin.fill("#cand-q", search);
  await admin.getByRole("listbox").getByText(pickText).first().click();
  await admin.getByRole("button", { name: "Criar campanha" }).click();
  await admin.getByText(`Campanha “${name}” criada`).waitFor({ timeout: 10000 });
}
await newCampaign("Campanha E2E A", "HELENA", 2022, "Governador");
await newCampaign("Campanha E2E B", "HELENA", 2026, "Presidente");
await admin.reload({ waitUntil: "networkidle" });
ok((await admin.getByTestId("campaign-list").locator("li").count()) === 2, "ADMIN: duas campanhas criadas");
await admin.goto(`${B}/admin/usuarios`, { waitUntil: "networkidle" });
async function newUser(name, email) {
  await admin.reload({ waitUntil: "networkidle" });
  await admin.fill("#u-name", name);
  await admin.fill("#u-email", email);
  await admin.getByRole("button", { name: "Criar acesso" }).click();
  const box = admin.getByTestId("temp-password");
  await box.waitFor({ timeout: 10000 });
  return (await box.locator("code").innerText()).trim();
}
const ownerEmail = `owner-${Date.now()}@teste.invalid`;
const otherEmail = `outro-${Date.now()}@teste.invalid`;
const ownerTmp = await newUser("Owner A", ownerEmail);
const otherTmp = await newUser("Owner B", otherEmail);
ok(ownerTmp.length >= 16, "ADMIN: senha temporária aleatória exibida uma vez");
await admin.reload({ waitUntil: "networkidle" });
async function link(campaign, email, role) {
  await admin.selectOption("#m-campaign", { label: campaign });
  await admin.selectOption("#m-user", { label: email });
  await admin.selectOption("#m-role", role);
  await admin.getByRole("button", { name: "Vincular" }).click();
  await admin.getByText("Acesso atualizado.").waitFor({ timeout: 10000 });
  await admin.reload({ waitUntil: "networkidle" });
}
await link("Campanha E2E A", ownerEmail, "owner");
await link("Campanha E2E B", otherEmail, "owner");
ok((await admin.getByTestId("user-list").innerText()).includes("Campanha E2E A · Responsável (owner)"), "ADMIN: OWNER definido");

// ── OWNER da campanha A
const owner = await ctx();
await login(owner, ownerEmail, ownerTmp);
await forcedChange(owner, ownerTmp);
ok(owner.url().includes("/avaliacao"), "OWNER: troca obrigatória → /avaliacao");
ok(await owner.getByTestId("evaluation-empty").getByText("Comece registrando os investimentos da campanha.").isVisible(), "Avaliação: estado vazio elegante com CTA");

async function register(p, { name, category, amount, freq, start, end, territory, pick }) {
  await p.goto(`${B}/avaliacao/investimentos/novo`, { waitUntil: "networkidle" });
  await p.fill("#f-name", name);
  await p.fill("#f-cat", category);
  await p.fill("#f-amount", amount);
  await p.locator("label", { hasText: freq }).click();
  await p.fill("#f-start", start);
  if (end) await p.fill("#f-end", end);
  await p.fill("#f-terr", territory);
  await p.getByTestId("territory-options").getByText(pick).first().click();
  const preview = await p.getByTestId("preview-total").innerText();
  await p.getByRole("button", { name: "Registrar investimento" }).click();
  await p.waitForURL(/\/avaliacao\/investimentos\/[0-9a-f-]{36}/, { timeout: 15000 });
  return preview.replace(/\s/g, " ");
}
await register(owner, { name: "Evento de abertura", category: "Eventos", amount: "1.500,00", freq: "Único", start: "2026-09-05", territory: "rio de janeiro", pick: "RIO DE JANEIRO · RJ" });
ok((await owner.getByTestId("detail-total").innerText()).replace(/\s/g, " ").includes("R$ 1.500,00"), "investimento único: total R$ 1.500,00");
const prev = await register(owner, { name: "Material de campanha", category: "Material", amount: "800", freq: "Semanal", start: "2026-09-01", end: "2026-09-30", territory: "niter", pick: "NITERÓI" });
ok(prev.includes("R$ 4.000,00"), `recorrente: prévia R$ 800 × 5 semanas = R$ 4.000,00 (${prev})`);
ok(/\b5$/.test((await owner.getByTestId("detail-occurrences").innerText()).trim()), "recorrente: 5 ocorrências (01, 08, 15, 22, 29/09) — uma única regra");
ok((await owner.getByTestId("occurrence-list").locator("li").count()) === 5, "detalhe: timeline das ocorrências");
await register(owner, { name: "Transporte de equipe", category: "Transporte", amount: "250", freq: "Mensal", start: "2026-08-31", end: "2026-10-31", territory: "são paulo", pick: "São Paulo · UF" });

await owner.goto(`${B}/avaliacao`, { waitUntil: "networkidle" });
const kt = (await owner.getByTestId("kpi-total").innerText()).replace(/\s/g, " ");
ok(kt.includes("R$ 6.250,00"), `dashboard: investimento total = 1.500 + 4.000 + 3×250 (${kt})`);
ok((await owner.getByTestId("kpi-actions").innerText()).includes("3"), "dashboard: 3 ações registradas");
ok(await owner.getByTestId("evaluation-timeline").locator("svg").isVisible(), "timeline do investimento visível");
await owner.getByTestId("evaluation-timeline").getByRole("radio", { name: "Mensal" }).click();
ok((await owner.getByTestId("evaluation-timeline").locator("svg path").count()) === 3, "timeline mensal: ago, set, out");
const obs = owner.getByTestId("observed-result");
ok((await obs.innerText()).includes("1.500 votos"), "resultado observado: Rio de Janeiro 1.500 votos (fixture oficial)");
ok(await obs.getByTestId("demo-label").isVisible(), "fixture identificada como DEMONSTRAÇÃO");
ok((await obs.innerText()).includes("Sem correspondência no resultado oficial"), "território sem correspondência explícito (UF de outra disputa)");
ok((await owner.getByTestId("no-causality").innerText()).includes("Não representa causalidade"), "aviso: comparação descritiva, sem causalidade");
ok(!/gerou|causou|graças a|ROI/i.test(await owner.textContent("main")), "nenhuma linguagem causal/ROI na página");
await owner.selectOption("#base", { label: "2018 · Governador" });
await owner.getByRole("button", { name: "Comparar" }).first().click();
await owner.waitForLoadState("networkidle");
ok((await obs.innerText()).includes("Período sem comparação possível"), "base sem resultado oficial ⇒ sem comparação possível (nunca inventa)");
const terrSel = owner.locator('select[name="territorio"]').first();
const niteroi = await terrSel.locator("option", { hasText: "NITERÓI" }).getAttribute("value");
await owner.goto(`${B}/avaliacao?territorio=${niteroi}`, { waitUntil: "networkidle" });
ok((await owner.getByTestId("investment-row").count()) === 1 && (await owner.getByTestId("row-total").innerText()).replace(/\s/g, " ").includes("R$ 4.000,00"), "filtro por território: 1 registro (Niterói)");
const invA = owner.url();
const firstId = await owner.getByTestId("investment-row").locator("a").first().getAttribute("href");

// ── Outro OWNER (campanha B) — isolamento
const other = await ctx();
await login(other, otherEmail, otherTmp);
await forcedChange(other, otherTmp);
await register(other, { name: "Ação nacional", category: "Comunicação", amount: "10.000", freq: "Único", start: "2026-09-15", territory: "brasil", pick: "Brasil" });
await other.goto(`${B}/avaliacao`, { waitUntil: "networkidle" });
ok((await other.getByTestId("observed-result").innerText()).includes("Resultado oficial ainda não disponível."), "campanha 2026: 'Resultado oficial ainda não disponível.'");
ok(!(await other.textContent("main")).includes("Material de campanha"), "isolamento: B não vê investimentos de A");
const deny = await other.goto(`${B}/avaliacao?campanha=campanha-e2e-a`);
ok(deny.status() === 403 && (await other.getByTestId("forbidden").isVisible()), "B tentando abrir campanha A ⇒ 403 ACESSO NEGADO");
const deny2 = await other.goto(`${B}${firstId}`);
ok(deny2.status() === 404, "B abrindo investimento de A por URL ⇒ não encontrado (RLS)");
const deny3 = await other.goto(`${B}/admin/campanhas`);
ok(deny3.status() === 403, "não-ADMIN em /admin ⇒ 403");
void invA;

// ── ADMIN visualiza a campanha A (somente leitura)
await admin.goto(`${B}/avaliacao?campanha=campanha-e2e-a`, { waitUntil: "networkidle" });
ok((await admin.getByTestId("kpi-total").innerText()).replace(/\s/g, " ").includes("R$ 6.250,00"), "ADMIN visualiza investimentos da campanha A");
ok((await admin.getByTestId("new-investment").count()) === 0, "ADMIN sem vínculo: somente leitura (sem CTA de registro)");

// ── Logout
await owner.goto(`${B}/avaliacao`, { waitUntil: "networkidle" });
await owner.getByTestId("user-menu").locator("summary").click();
await owner.getByTestId("logout").click();
await owner.waitForURL(/\/login/, { timeout: 10000 });
await owner.goto(`${B}/avaliacao`);
ok(owner.url().includes("/login"), "logout: sessão encerrada, rota protegida volta ao login");

// ── Mobile (várias larguras)
const ownerM = await b.newContext({ viewport: { width: 390, height: 844 } });
const pm = await ownerM.newPage();
await login(pm, ADMIN.email, ADMIN.password);
for (const w of [375, 390, 430, 768, 1024, 1440]) {
  await pm.setViewportSize({ width: w, height: 900 });
  for (const path of ["/avaliacao?campanha=campanha-e2e-a", "/admin/usuarios", "/login"]) {
    await pm.goto(B + path, { waitUntil: "networkidle" });
    const over = await pm.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 1, `${w}px ${path}: sem rolagem horizontal (${over})`);
  }
}
await pm.setViewportSize({ width: 390, height: 844 });
await pm.goto(`${B}/avaliacao?campanha=campanha-e2e-a`, { waitUntil: "networkidle" });
const cards = await pm.getByTestId("investment-card").count();
ok(cards === 3, `mobile: tabela vira cards (${cards} · ${pm.url()})`);
ok(await pm.locator("details summary", { hasText: "Filtros" }).isVisible(), "mobile: filtros em gaveta");
await pm.screenshot({ path: ".monitora/e2e-avaliacao-mobile.png", fullPage: true });
await admin.setViewportSize({ width: 1440, height: 900 });
await admin.screenshot({ path: ".monitora/e2e-avaliacao-desktop.png", fullPage: true });

ok(errs.length === 0, `sem erros de página${errs.length ? `: ${errs.slice(0, 3).join(" | ")}` : ""}`);
await b.close();
console.log(fail ? `\n${fail} falha(s)` : "\nE2E avaliação: OK");
process.exit(fail ? 1 : 0);
