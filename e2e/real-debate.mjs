// E2E do perfil REAL (DATA_MODE=live): debate do Governo do RJ (TV Globo, 29/09/2026).
import { chromium } from "playwright";

const B = process.env.BASE_URL || "http://localhost:3000";
const D = "rj-governador-2026-09-29-globo";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
let fail = 0;
const ok = (c, m) => {
  console.log(c ? "PASS" : "FAIL", m);
  if (!c) fail++;
};
const text = async (path) => {
  const r = await p.goto(B + path, { waitUntil: "networkidle" });
  return { status: r.status(), body: (await p.textContent("main")) ?? "" };
};
const api = async (path) => (await fetch(B + path)).json();

for (const r of ["/", "/overview", "/debates", `/debates/${D}`, `/debates/${D}/live`, `/debates/${D}/analytics`, "/social", "/map", "/sources", "/methodology", "/elections"]) {
  ok((await p.goto(B + r, { waitUntil: "networkidle" })).status() === 200, `${r} 200`);
}

let t = await text("/debates");
ok(/Debate para o Governo do Rio de Janeiro/.test(t.body) && /TV Globo/.test(t.body) && /Replay/.test(t.body), "/debates lista o debate real com REPLAY");

t = await text(`/debates/${D}/live`);
ok(/Replay indisponível/.test(t.body) && /nenhum horário foi estimado/.test(t.body), "live: sem horários na fonte → replay indisponível, sem estimativa");
ok(/5 falas · mais recentes primeiro/.test(t.body), "live: 5 falas reais exibidas");
for (const n of ["EDUARDO PAES", "DOUGLAS RUAS", "ANTHONY GAROTINHO", "WILLIAM SIRI", "ANDRÉ MARINHO"]) ok(t.body.toUpperCase().includes(n), `live: orador ${n}`);
ok(/relevância .* conf\. \d/.test(t.body), "live: relevância e confiança por fala");

t = await text(`/debates/${D}/analytics`);
ok(/Sem marcação de tempo/.test(t.body) && /Repercussão não coletada/.test(t.body), "analytics: ausências explicadas (não zeradas)");

t = await text("/overview");
ok(/Repercussão não coletada/.test(t.body) && /ÚLTIMA FALA NA FONTE/.test(t.body), "overview: sem zeros para dados não coletados; bloco histórico");
ok(!/ganhou o debate|vencedor|mais popular|melhor candidat/i.test(t.body), "overview sem juízo político");

t = await text("/sources");
ok(/Manchete Rio/.test(t.body) && /5 recebidos · 5 normalizados · 0 rejeitados/.test(t.body) && /0 com horário · 5 sem horário/.test(t.body), "fontes: proveniência e relatório de qualidade do debate");

const q = await api(`/api/debates/${D}/quality`);
ok(q.data.speakersResolved === 5 && q.data.timestampsMissing === 5, "api quality");
const tl = await api(`/api/debates/${D}/timeline?granularity=300`);
ok(tl.data.kind === "not_available" && tl.meta.timing.untimed === 5, "api timeline: not_available (sem horários)");
const tr = await api(`/api/debates/${D}/transcript?limit=2`);
ok(tr.data.length === 2 && tr.meta.hasMore && /mancheterio\.com\.br/.test(tr.data[0].record.sourceUrl) && tr.data[0].segment.startOffset === null, "api transcript: proveniência e startOffset nulo");
const res = await api("/api/elections/2026-geral/results");
ok(res.meta.status === "not_collected", "resultados oficiais: not_collected");

await p.goto(B + "/overview", { waitUntil: "networkidle" });
await p.keyboard.press("Control+k");
await p.getByLabel("Termo de busca").fill("Paes");
await p.waitForTimeout(800);
ok((await p.getByRole("dialog").getByText("Eduardo Paes").count()) > 0, "busca encontra candidato real");

ok(errs.length === 0, "sem erros de console: " + errs.join(" | "));
await b.close();
process.exit(fail ? 1 : 0);
