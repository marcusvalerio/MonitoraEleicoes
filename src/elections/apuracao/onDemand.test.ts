import { describe, expect, it, vi } from "vitest";
import { refreshCountIfStale, takeLease } from "./onDemand";
import type { Sql } from "@/persistence/db";

const fakeSql = (rows: unknown[]) => ({ query: vi.fn(async () => rows) }) as unknown as Sql;

describe("apuração sob demanda", () => {
  it("só fica com a vez quando a concessão de 60 s está vencida", async () => {
    expect(await takeLease(fakeSql([{ ok: 1 }]), 2026, 2)).toBe(true);
    expect(await takeLease(fakeSql([]), 2026, 2)).toBe(false);
  });
  it("sem a vez, não toca no TSE", async () => {
    const provider = { fetchConfig: vi.fn() };
    expect(await refreshCountIfStale(fakeSql([]), 2026, 2, provider as never)).toBeNull();
    expect(provider.fetchConfig).not.toHaveBeenCalled();
  });
});
