import { describe, expect, it } from "vitest";
import { byTerritory, byUf, fmtBRL, occurrences, outermost, parseMoneyToCents, ppDiff, safeDiv, statusOf, summarize, timeline, totalCents, valuePerVoteCents, variation, type Investment } from "./model";

const inv = (o: Partial<Investment>): Investment => ({ id: "x", name: "Ação", category: "Material", amountCents: 80000, frequency: "weekly", start: "2026-09-01", end: "2026-09-30", territoryId: 1, territoryName: "São Paulo", territoryLevel: "municipio", territoryUf: "SP", notes: null, ...o });

describe("recorrência (regra única ⇒ ocorrências derivadas)", () => {
  it("único: uma ocorrência na data inicial", () => {
    expect(occurrences({ frequency: "once", start: "2026-09-10", end: "2026-09-30" })).toEqual(["2026-09-10"]);
  });
  it("diário: inclui início e fim", () => {
    const d = occurrences({ frequency: "daily", start: "2026-09-01", end: "2026-09-05" });
    expect(d).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
  });
  it("semanal: R$ 800/semana de 01/09 a 30/09 ⇒ 01, 08, 15, 22, 29 (nada além do fim)", () => {
    const r = { frequency: "weekly" as const, start: "2026-09-01", end: "2026-09-30", amountCents: 80000 };
    expect(occurrences(r)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]);
    expect(totalCents(r)).toBe(400000);
  });
  it("quinzenal: a cada 14 dias", () => {
    expect(occurrences({ frequency: "biweekly", start: "2026-09-01", end: "2026-09-30" })).toEqual(["2026-09-01", "2026-09-15", "2026-09-29"]);
  });
  it("mensal: mesmo dia, ajustado ao último dia do mês (31/01 → 28/02 → 31/03)", () => {
    expect(occurrences({ frequency: "monthly", start: "2026-01-31", end: "2026-04-15" })).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(occurrences({ frequency: "monthly", start: "2026-11-15", end: "2027-01-15" })).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
  });
  it("período parcial e datas inválidas", () => {
    expect(occurrences({ frequency: "weekly", start: "2026-09-01", end: "2026-09-07" })).toEqual(["2026-09-01"]);
    expect(occurrences({ frequency: "weekly", start: "2026-09-10", end: "2026-09-01" })).toEqual([]);
    expect(occurrences({ frequency: "daily", start: "2026-02-30", end: "2026-03-01" })).toEqual([]);
  });
  it("status: agendado / ativo / encerrado", () => {
    const r = { start: "2026-09-01", end: "2026-09-30" };
    expect(statusOf(r, "2026-08-31")).toBe("agendado");
    expect(statusOf(r, "2026-09-01")).toBe("ativo");
    expect(statusOf(r, "2026-09-30")).toBe("ativo");
    expect(statusOf(r, "2026-10-01")).toBe("encerrado");
  });
});

describe("agregações", () => {
  const items = [inv({ id: "a" }), inv({ id: "b", frequency: "once", amountCents: 150000, start: "2026-09-10", end: "2026-09-10", territoryId: 2, territoryName: "Campinas" })];
  it("total, valor por ocorrência, médias", () => {
    const s = summarize(items);
    expect(s).toMatchObject({ totalCents: 550000, actions: 2, occurrences: 6, territories: 2, period: { start: "2026-09-01", end: "2026-09-30" } });
    expect(s.avgPerActionCents).toBe(275000);
    expect(s.avgPerTerritoryCents).toBe(275000);
  });
  it("recorte de período limita as ocorrências", () => {
    expect(summarize(items, "2026-09-09", "2026-09-16").totalCents).toBe(80000 + 150000);
  });
  it("sem registros: zero registrado, médias indisponíveis (divisão por zero ⇒ null)", () => {
    const s = summarize([]);
    expect(s).toMatchObject({ totalCents: 0, actions: 0, period: null, avgPerActionCents: null, avgPerTerritoryCents: null });
    expect(safeDiv(10, 0)).toBeNull();
    expect(valuePerVoteCents(4250000, 0)).toBeNull();
    expect(valuePerVoteCents(4250000, null)).toBeNull();
    expect(valuePerVoteCents(4250000, 12842)).toBeCloseTo(330.94, 1);
  });
  it("timeline semanal (segunda-feira) e mensal", () => {
    const w = timeline(items, "week");
    expect(w[0]).toEqual({ start: "2026-08-31", cents: 80000 });
    expect(w.reduce((a, x) => a + x.cents, 0)).toBe(550000);
    expect(timeline(items, "month")).toEqual([{ start: "2026-09-01", cents: 550000 }]);
    expect(timeline([], "day")).toEqual([]);
  });
  it("por território e por UF (Brasil não entra em UF)", () => {
    const t = byTerritory([...items, inv({ id: "c", territoryId: 0, territoryName: "Brasil", territoryLevel: "pais", territoryUf: null, frequency: "once", end: "2026-09-01" })]);
    expect(t.map((x) => x.name)).toEqual(["São Paulo", "Campinas", "Brasil"]);
    expect(byUf(items).get("SP")).toBe(550000);
  });
  it("associação territorial: não conta votos em dobro (Brasil ⊃ UF ⊃ município)", () => {
    expect(outermost([{ id: 3550308, level: "municipio" as const, uf: "SP" }, { id: 35, level: "uf" as const, uf: "SP" }, { id: 3304557, level: "municipio" as const, uf: "RJ" }]).map((t) => t.id)).toEqual([35, 3304557]);
    expect(outermost([{ id: 0, level: "pais" as const, uf: null }, { id: 35, level: "uf" as const, uf: "SP" }]).map((t) => t.id)).toEqual([0]);
  });
});

describe("comparações descritivas", () => {
  it("variação absoluta e relativa; base zero ⇒ relativa indisponível", () => {
    expect(variation(100, 150)).toEqual({ abs: 50, rel: 0.5 });
    expect(variation(0, 150)).toEqual({ abs: 150, rel: null });
    expect(variation(null, 150)).toEqual({ abs: null, rel: null });
  });
  it("p.p. só com ambas as participações oficiais", () => {
    expect(ppDiff(0.414, 0.482)).toBeCloseTo(6.8, 5);
    expect(ppDiff(null, 0.482)).toBeNull();
  });
  it("moeda", () => {
    expect(parseMoneyToCents("R$ 1.500,50")).toBe(150050);
    expect(parseMoneyToCents("1500")).toBe(150000);
    expect(parseMoneyToCents("10.000")).toBe(1000000);
    expect(parseMoneyToCents("1500.5")).toBe(150050);
    expect(parseMoneyToCents("0")).toBeNull();
    expect(parseMoneyToCents("-3")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(fmtBRL(150050).replace(/\s/g, " ")).toBe("R$ 1.500,50");
    expect(fmtBRL(null)).toBe("—");
  });
});
