import { describe, expect, it } from "vitest";
import { MockTranscriptProvider } from "./transcript";
import { MockSocialProvider } from "./social";
import { MockTSEProvider } from "./tse";
import { DEMO_DEBATE_ID } from "@/data/demo/entities";
import { demoReplayOffset, DEMO_REPLAY_MIN_OFFSET } from "@/lib/demo-clock";

describe("providers mock", () => {
  const t = new MockTranscriptProvider();
  it("filtra transcrição por janela no servidor", async () => {
    const all = await t.getTranscript(DEMO_DEBATE_ID);
    const w = await t.getTranscript(DEMO_DEBATE_ID, { from: 1000, to: 2000 });
    expect(w.segments.length).toBeLessThan(all.segments.length);
    expect(w.segments.every((s) => s.endOffset >= 1000 && s.endOffset <= 2000)).toBe(true);
    expect(w.classifications).toHaveLength(w.segments.length);
    expect(w.complete).toBe(false);
  });
  it("retorna vazio para debate sem transcrição", async () => {
    expect((await t.getTranscript("inexistente")).segments).toHaveLength(0);
    expect(await t.getDebate("inexistente")).toBeNull();
  });
  it("social marca limitações das plataformas", async () => {
    const s = new MockSocialProvider();
    expect(s.platforms().find((p) => p.id === "telegram")?.access).toBe("none");
    const r = await s.search({ debateId: DEMO_DEBATE_ID, limit: 5 });
    expect(r.posts.length).toBeLessThanOrEqual(5);
    expect(r.caveats.join()).toMatch(/DEMO/);
  });
  it("TSE mock não fabrica resultados", async () => {
    const tse = new MockTSEProvider();
    expect(await tse.results()).toEqual([]);
    expect((await tse.health()).status).toBe("unavailable");
  });
  it("relógio de replay fica dentro do debate", () => {
    for (const now of [0, 1e12, 1.7e12, 1.9e12 + 12345]) {
      const o = demoReplayOffset(now, 7000);
      expect(o).toBeGreaterThanOrEqual(DEMO_REPLAY_MIN_OFFSET);
      expect(o).toBeLessThan(7000);
    }
  });
});
