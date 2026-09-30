import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER, effectiveUfs, parseFilters, periodWindow, toSearchParams } from "./filters";
import { REGIONS } from "@/elections/reference";

describe("filtro global", () => {
  it("combina eleição + cargo + UF + candidato + período (ida e volta pela URL)", () => {
    const { filter, errors } = parseFilters(new URLSearchParams("ano=2026&cargo=1&uf=rj&q=Helena&periodo=24h&plataforma=youtube,x&sentimento=negativo"));
    expect(errors).toEqual([]);
    expect(filter).toMatchObject({ year: 2026, offices: [1], ufs: ["RJ"], candidateQuery: "Helena", period: { preset: "24h" }, platforms: ["youtube", "x"], sentiments: ["negativo"] });
    expect(parseFilters(toSearchParams(filter)).filter).toEqual(filter);
  });
  it("valores inválidos são apontados, não silenciosamente aceitos", () => {
    const { errors } = parseFilters(new URLSearchParams("ano=2010&uf=XX&periodo=custom&de=2026-10-02&ate=2026-10-01"));
    expect(errors).toHaveLength(3);
  });
  it("região expande para UFs; período 'hoje' começa 00:00 BRT", () => {
    expect(effectiveUfs({ ...DEFAULT_FILTER, regions: [4], ufs: ["RJ"] }, REGIONS).sort()).toEqual(["PR", "RJ", "RS", "SC"]);
    const w = periodWindow({ preset: "today" }, Date.parse("2026-10-01T15:00:00Z"));
    expect(w.from).toBe("2026-10-01T03:00:00.000Z");
    expect(periodWindow({ preset: "7d" }, Date.parse("2026-10-08T00:00:00Z")).from).toBe("2026-10-01T00:00:00.000Z");
  });
});
