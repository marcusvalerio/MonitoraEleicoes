import { describe, expect, it } from "vitest";
import { getDemoDataset } from "./generate";
import { DEMO_CANDIDATES, DEMO_DEBATE } from "./entities";
import { DEMO_SOURCES } from "./sources";
import { violatesEditorialPolicy } from "@/domain/guards";
import { TEXT_BANK } from "./text-bank";

describe("dataset demo", () => {
  const ds = getDemoDataset();
  it("tem ~100 segmentos, 4 participantes e 12 temas", () => {
    expect(ds.segments.length).toBeGreaterThanOrEqual(95);
    expect(ds.segments.length).toBeLessThanOrEqual(110);
    expect(DEMO_DEBATE.participantIds).toHaveLength(4);
    const topics = new Set(ds.classifications.map((c) => c.topic).filter((t) => t !== "outros"));
    expect(topics.size).toBe(12);
    expect(Object.keys(TEXT_BANK)).toHaveLength(12);
  });
  it("é determinístico", () => {
    expect(getDemoDataset().segments[10].text).toBe(ds.segments[10].text);
  });
  it("segmentos são ordenados e não se sobrepõem", () => {
    for (let i = 1; i < ds.segments.length; i++) expect(ds.segments[i].startOffset).toBeGreaterThanOrEqual(ds.segments[i - 1].endOffset);
  });
  it("toda classificação aponta para um segmento e mantém o RAW separado", () => {
    const ids = new Set(ds.segments.map((s) => s.id));
    expect(ds.classifications.every((c) => ids.has(c.segmentId))).toBe(true);
    expect(ds.classifications.every((c) => c.provenance.nature === "ai" && c.model.model)).toBe(true);
    expect(ds.segments.every((s) => s.provenance.nature === "collected")).toBe(true);
  });
  it("todo dado está marcado como demo", () => {
    expect([...ds.segments, ...ds.classifications, ...ds.metrics, ...ds.posts].every((x) => x.provenance.mode === "demo")).toBe(true);
    expect(DEMO_SOURCES.filter((s) => s.status === "demo").every((s) => s.mode === "demo")).toBe(true);
  });
  it("não contém linguagem editorial proibida", () => {
    for (const t of [...ds.segments.map((s) => s.text), ...ds.posts.map((p) => p.text)]) expect(violatesEditorialPolicy(t)).toBeNull();
  });
  it("cores de candidatos são únicas", () => {
    expect(new Set(DEMO_CANDIDATES.map((c) => c.swatch)).size).toBe(4);
  });
});
