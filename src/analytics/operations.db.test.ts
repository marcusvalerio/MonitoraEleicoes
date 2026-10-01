import { beforeAll, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../../scripts/env.mjs";
import { assertTestDatabase, createSql, type Sql } from "@/persistence/db";
import { resetTestDatabase } from "@/persistence/testing";
import { beat, readHeartbeats, workerState } from "@/infrastructure/heartbeat";
import { operationsStatus } from "./operations";

loadLocalEnv();
const DB = process.env.DATABASE_URL_TEST;
const T = Date.parse("2026-10-04T22:00:00Z");
const at = (ms: number) => new Date(T + ms).toISOString();

describe.skipIf(!DB)("observabilidade: heartbeat e estado das fontes", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = createSql(DB, "DATABASE_URL_TEST");
    await assertTestDatabase(sql);
    await resetTestDatabase(sql);
  });

  it("nada registrado ⇒ sem sinal / não configurada (nunca 'operacional' presumido)", async () => {
    const ops = await operationsStatus(sql, T);
    const by = Object.fromEntries(ops.map((o) => [o.id, o.state]));
    expect(by["tse-apuracao"]).toBe("sem_sinal");
    expect(by["tse-historico"]).toBe("nao_configurada");
    expect(by["g1"]).toBe("sem_sinal");
    expect(by["pesquisas"]).toBe("nao_configurada");
  });

  it("heartbeat: operacional → com erro (guarda último sucesso) → atrasado sem batimento", async () => {
    await beat(sql, "apuracao", { ok: true, durationMs: 1200, collected: 82, changed: 3, rejected: 0, intervalS: 60, at: at(0) });
    let [h] = await readHeartbeats(sql);
    expect(workerState(h, T + 30_000)).toBe("operacional");
    await beat(sql, "apuracao", { ok: false, error: "HTTP 503", at: at(60_000) });
    [h] = await readHeartbeats(sql);
    expect(h).toMatchObject({ lastSuccessAt: at(0), lastErrorAt: at(60_000), lastError: "HTTP 503", intervalS: 60 });
    expect(workerState(h, T + 90_000)).toBe("com_erro");
    expect(workerState(h, T + 60 * 60_000)).toBe("atrasado");
    await beat(sql, "apuracao", { ok: true, at: at(120_000) });
    [h] = await readHeartbeats(sql);
    expect(workerState(h, T + 130_000)).toBe("operacional");
    expect((await operationsStatus(sql, T + 130_000)).find((o) => o.id === "tse-apuracao")!.state).toBe("operacional");
  });
});
