import { describe, expect, it } from "vitest";
import { compareRounds, type TerritoryResult } from "./turnos";

const t = (key: string, cands: [string, number, number, number | null][]): TerritoryResult => ({
  key, territoryId: 1, name: key, uf: key, phase: "final", countedPct: 100, validVotes: null, collectedAt: "",
  candidates: cands.map(([sq, number, votes, pct]) => ({ sq, name: `C${number}`, party: null, number, votes, pct })),
});

describe("compareRounds", () => {
  it("casa finalistas pelo nº de urna (sq muda entre turnos) e mantém ausência como null", () => {
    const first = [t("SP", [["a1", 13, 500, 50], ["b1", 22, 300, 30], ["c1", 15, 200, 20]]), t("ZZ", [["a1", 13, 10, 40]])];
    const second = [t("SP", [["a2", 13, 550, 55], ["b2", 22, 450, 45]])];
    const r = compareRounds(first, second, t("BR", [["a2", 13, 1, 55], ["b2", 22, 1, 45]]))!;
    expect(r.finalists.map((f) => f.number)).toEqual([13, 22]);
    const sp = r.rows.find((x) => x.key === "SP")!;
    expect(sp.first.a2).toEqual({ votes: 500, pct: 50 });
    expect(sp.second.b2).toEqual({ votes: 450, pct: 45 });
    const zz = r.rows.find((x) => x.key === "ZZ")!;
    expect(zz.first.b2).toBeNull();
    expect(zz.second.a2).toBeNull();
  });
  it("sem dois finalistas com votos ⇒ null (nada é inventado)", () => {
    expect(compareRounds([], [], null)).toBeNull();
  });
});
