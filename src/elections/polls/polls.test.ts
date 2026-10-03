import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { tseRows } from "@/elections/tse/csv";
import { parseOffices } from "./importer";

describe("CSV do TSE com campos multilinha (metodologia de pesquisas)", () => {
  it("junta linhas enquanto as aspas estão abertas; aspas escapadas preservadas", async () => {
    const csv = '"A";"B";"C"\r\n"1";"linha 1\r\nlinha 2 com ""aspas""";"x"\r\n"2";"simples";"y"\r\n';
    const rows = [];
    for await (const r of tseRows(Readable.from([Buffer.from(csv, "latin1")]))) rows.push(r);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ A: "1", B: 'linha 1\nlinha 2 com "aspas"', C: "x" });
    expect(rows[1].B).toBe("simples");
  });
});

describe("cargos do registro", () => {
  it("lista textual → ids oficiais (sem duplicatas; desconhecido ignorado)", () => {
    expect(parseOffices("Governador, Senador, Deputado Federal, Deputado Estadual")).toEqual([3, 5, 6, 7]);
    expect(parseOffices("Presidente")).toEqual([1]);
    expect(parseOffices("Prefeito, Vereador, Outro")).toEqual([11, 13]);
    expect(parseOffices(null)).toEqual([]);
  });
});
