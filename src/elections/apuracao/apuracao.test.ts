import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertAllowedUrl, countFileUrl, discoverElections } from "./config";
import { normalizeCountFile, tseDateTime } from "./normalize";
import { TseCountProvider } from "./provider";

/** Fixtures OFICIAIS (baixadas de resultados.tse.jus.br em 2026-10-01, sem edição). */
const FX = path.join(__dirname, "fixtures");
export const fx = (f: string) => readFileSync(path.join(FX, f), "utf-8");
const PRE_2026 = "br-c0001-e006257-u.json"; // Presidente 2026, BR — antes da eleição
const GOV_AC_2026 = "ac-c0003-e006259-u.json"; // Governador 2026, AC — antes da eleição
const FINAL_2024 = "sp71072-c0011-e000619-u.json"; // Prefeito 2024, São Paulo/SP — totalizado

describe("descoberta pela configuração oficial (ele-c.json)", () => {
  const cfg = JSON.parse(fx("ele-c.json"));
  it("2026 · 1º turno: códigos e cargos vêm da configuração, não do código", () => {
    const e = discoverElections(cfg, 2026, 1);
    expect(e.map((x) => x.code)).toEqual([6257, 6259]);
    expect(e[0].offices.map((o) => o.id)).toEqual([1]);
    expect(e[1].offices.map((o) => [o.id, o.system])).toEqual([[3, "majoritario"], [5, "majoritario"], [6, "proporcional"], [7, "proporcional"], [8, "proporcional"]]);
    expect(e[0].round2Code).toBe(6258);
  });
  it("2º turno usa cdt2 e só cargos majoritários", () => {
    const e = discoverElections(cfg, 2026, 2);
    expect(e.map((x) => [x.code, x.offices.map((o) => o.id)])).toEqual([[6258, [1]], [6260, [3, 5]]]);
  });
  it("ano sem eleição geral na configuração ⇒ lista vazia; formato inesperado ⇒ erro", () => {
    expect(discoverElections(cfg, 2030, 1)).toEqual([]);
    expect(() => discoverElections({}, 2026, 1)).toThrow(/formato inesperado/);
  });
  it("URL de arquivo: BR, UF e município", () => {
    const e = discoverElections(cfg, 2026, 1)[0];
    expect(countFileUrl(e, 1, { uf: "BR" })).toBe("https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json");
    expect(countFileUrl(e, 1, { uf: "SP", municipalityTseCode: 71072 })).toBe("https://resultados.tse.jus.br/oficial/ele2026/6257/dados/sp/sp71072-c0001-e006257-u.json");
    expect(() => countFileUrl(e, 1, { uf: "../x" })).toThrow(/UF inválida/);
  });
});

describe("anti-SSRF: só o domínio oficial do TSE", () => {
  it.each(["http://resultados.tse.jus.br/oficial/x", "https://evil.com/oficial/x", "https://resultados.tse.jus.br.evil.com/oficial/x", "https://user:p@resultados.tse.jus.br/oficial/x", "https://resultados.tse.jus.br:8443/oficial/x", "https://resultados.tse.jus.br/admin", "https://169.254.169.254/oficial/x"])("recusa %s", (u) => {
    expect(() => assertAllowedUrl(u)).toThrow();
  });
  it("aceita arquivo oficial", () => expect(assertAllowedUrl("https://resultados.tse.jus.br/oficial/comum/config/ele-c.json").hostname).toBe("resultados.tse.jus.br"));
});

describe("normalizador · value_status (ausência ≠ zero)", () => {
  it("2026 antes da eleição: arquivo publica 0, mas votos são NOT_COLLECTED", () => {
    const n = normalizeCountFile(JSON.parse(fx(PRE_2026)));
    expect(n).toMatchObject({ electionCode: 6257, officeId: 1, round: 1, scopeLevel: "pais", phase: "not_started", totalizedAt: null });
    expect(n.sectionsTotal).toEqual({ value: 499248, status: "value" });
    expect(n.electorate).toEqual({ value: 158745502, status: "value" });
    for (const k of ["turnout", "abstention", "validVotes", "blankVotes", "nullVotes"] as const) expect(n[k]).toEqual({ value: null, status: "not_collected" });
    expect(n.candidates).toHaveLength(13);
    for (const c of n.candidates) {
      expect(c.votes).toEqual({ value: null, status: "not_collected" });
      expect(c.pct.status).toBe("not_collected");
      expect(c.elected).toBeNull();
    }
    expect(n.candidates.find((c) => c.ballotNumber === 13)).toMatchObject({ sqCandidato: 280002542548, ballotName: "LULA", party: "PT" });
    expect(n.generatedAt).toBe(tseDateTime("29/09/2026", "19:25:59"));
  });
  it("Governador AC 2026 (UF) — mesmo tratamento", () => {
    const n = normalizeCountFile(JSON.parse(fx(GOV_AC_2026)));
    expect(n).toMatchObject({ officeId: 3, electionCode: 6259, scopeLevel: "uf", phase: "not_started" });
    expect(n.candidates.every((c) => c.votes.status === "not_collected")).toBe(true);
  });
  it("2024 totalizado (São Paulo): valores reais publicados, incluindo destino do voto e eleito", () => {
    const n = normalizeCountFile(JSON.parse(fx(FINAL_2024)));
    expect(n).toMatchObject({ phase: "final", scopeLevel: "municipio", municipalityTseCode: 71072, officeId: 11 });
    expect(n.sectionsCounted).toEqual({ value: 26513, status: "value" });
    expect(n.countedPct).toEqual({ value: 100, status: "value" });
    expect(n.turnout).toEqual({ value: 6773587, status: "value" });
    expect(n.validVotes).toEqual({ value: 6108218, status: "value" });
    const sum = n.candidates.filter((c) => c.voteDestination === "Válido").reduce((a, c) => a + (c.votes.value ?? 0), 0);
    expect(sum).toBe(6108218); // soma dos válidos = votos válidos publicados
    const annulled = n.candidates.find((c) => c.sqCandidato === 250002355541)!;
    expect(annulled).toMatchObject({ voteDestination: "Anulado", votes: { value: 833, status: "value" }, elected: false });
    expect(n.totalizedAt).toBe(tseDateTime("03/12/2024", "10:21:35"));
  });
  it("parcial: seções > 0 e tf ≠ 's' ⇒ partial (arquivo derivado do oficial; números de teste)", () => {
    const j = JSON.parse(fx(PRE_2026));
    j.s.st = "1000";
    j.s.pst = "0,20";
    j.e.c = "300000";
    j.carg[0].agr[0].par[0].cand[0].vap = "0"; // zero REAL após o início da totalização
    const n = normalizeCountFile(j);
    expect(n.phase).toBe("partial");
    expect(n.turnout).toEqual({ value: 300000, status: "value" });
    expect(n.candidates[0].votes).toEqual({ value: 0, status: "value" });
    expect(n.countedPct).toEqual({ value: 0.2, status: "value" });
  });
  it("campo ilegível ⇒ not_available (nunca 0)", () => {
    const j = JSON.parse(fx(FINAL_2024));
    j.e.c = "";
    j.carg[0].agr[0].par[0].cand[0].vap = "abc";
    const n = normalizeCountFile(j);
    expect(n.turnout).toEqual({ value: null, status: "not_available" });
    expect(n.candidates[0].votes).toEqual({ value: null, status: "not_available" });
  });
  it("hash do conteúdo ignora republicação (dg/hg/idg) e muda com números", () => {
    const j = JSON.parse(fx(PRE_2026));
    const a = normalizeCountFile(j).contentHash;
    j.dg = "30/09/2026";
    j.hg = "08:00:00";
    j.idg = "999";
    expect(normalizeCountFile(j).contentHash).toBe(a);
    j.s.st = "1";
    expect(normalizeCountFile(j).contentHash).not.toBe(a);
  });
  it("formato inesperado ⇒ erro explícito", () => {
    expect(() => normalizeCountFile({})).toThrow(/formato inesperado/);
    expect(() => normalizeCountFile({ carg: [{}] })).toThrow(/cargo\/eleição/);
  });
});

describe("provider", () => {
  const res = (status: number, body = "{}") => new Response(body, { status });
  it("404 ⇒ not_published (não é erro nem zero)", async () => {
    const p = new TseCountProvider(async () => res(404));
    expect(await p.get("https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json")).toMatchObject({ status: "not_published", httpStatus: 404 });
  });
  it("5xx ⇒ retentativa e depois erro", async () => {
    let calls = 0;
    const p = new TseCountProvider(async () => (calls++, res(503)), { retries: 2, sleep: async () => {} });
    await expect(p.get("https://resultados.tse.jus.br/oficial/x.json")).rejects.toThrow(/HTTP 503/);
    expect(calls).toBe(3);
  });
  it("200 ⇒ corpo, JSON e sha256; host fora da allowlist nunca é requisitado", async () => {
    let calls = 0;
    const p = new TseCountProvider(async () => (calls++, res(200, fx(PRE_2026))));
    const r = await p.get("https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json");
    expect(r.status === "ok" && r.sha256.length).toBe(64);
    await expect(p.get("https://example.com/oficial/x")).rejects.toThrow(/fora do domínio/);
    expect(calls).toBe(1);
  });
});
