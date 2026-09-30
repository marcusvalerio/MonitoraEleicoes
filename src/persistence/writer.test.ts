import { describe, expect, it } from "vitest";
import { DataStore } from "@/ingestion/store";
import { persistIngestion } from "./writer";
import { assertTestDatabase, type Sql } from "./db";

/** Banco falso que só responde ao marcador de ambiente e registra qualquer outra escrita. */
function fakeDb(env: string) {
  const writes: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    const q = strings.join("?");
    if (/from monitora_env/.test(q)) return Promise.resolve([{ env }]);
    writes.push(q);
    return Promise.resolve([]);
  }) as unknown as Sql;
  (sql as unknown as { query: () => Promise<unknown[]> }).query = async () => (writes.push("query"), []);
  return { sql, writes };
}

describe("proteções do gravador", () => {
  it.each(["demo", "fixture"] as const)("recusa dataset %s em produção antes de qualquer escrita", async (kind) => {
    const db = fakeDb("production");
    await expect(persistIngestion(db.sql, new DataStore(), { datasetId: "x", datasetKind: kind, description: "", sources: [] })).rejects.toThrow(/produção/);
    expect(db.writes).toHaveLength(0);
  });
  it("testes destrutivos só em banco marcado 'test'", async () => {
    await expect(assertTestDatabase(fakeDb("production").sql)).rejects.toThrow();
    await expect(assertTestDatabase(fakeDb("development").sql)).rejects.toThrow();
    await expect(assertTestDatabase(fakeDb("test").sql)).resolves.toBeUndefined();
  });
});
