import { describe, expect, it } from "vitest";
import { aggregateGeo, geoSeries, nextLevel } from "./aggregate";
import { GEO_REGIONS, ancestorsOf, childrenOf, descendantsAt, isWithin } from "./reference";
import { getDemoGeoMetrics } from "@/data/demo/geo";
import { StaticGeoProvider } from "@/providers/mock/geo";

const metrics = getDemoGeoMetrics();
const end = Math.max(...metrics.map((m) => m.bucketStart + m.bucketSize));

describe("referência territorial", () => {
  it("tem 5 regiões e 27 UFs", () => {
    expect(childrenOf("BR")).toHaveLength(5);
    expect(descendantsAt("BR", "uf")).toHaveLength(27);
  });
  it("hierarquia e ancestrais", () => {
    expect(ancestorsOf("M:RJ:niteroi").map((r) => r.key)).toEqual(["BR", "R:SE", "UF:RJ", "M:RJ:niteroi"]);
    expect(isWithin("M:RJ:niteroi", "R:SE")).toBe(true);
    expect(isWithin("M:RJ:niteroi", "R:S")).toBe(false);
  });
  it("pesos dos municípios somam o peso da UF", () => {
    for (const uf of GEO_REGIONS.filter((r) => r.level === "uf")) {
      const s = childrenOf(uf.key).reduce((a, m) => a + m.weight, 0);
      expect(s).toBeCloseTo(uf.weight, 1);
    }
  });
});

describe("agregação e drill-down", () => {
  const br = aggregateGeo(metrics, { parentKey: "BR", childLevel: "uf", from: 0, to: end });
  it("soma dos filhos é consistente em todos os níveis", () => {
    const total = br.reduce((a, r) => a + r.posts, 0);
    const regions = aggregateGeo(metrics, { parentKey: "BR", childLevel: "regiao", from: 0, to: end });
    expect(regions.reduce((a, r) => a + r.posts, 0)).toBe(total);
    const rj = br.find((r) => r.key === "UF:RJ")!;
    const muns = aggregateGeo(metrics, { parentKey: "UF:RJ", childLevel: "municipio", from: 0, to: end });
    expect(muns.reduce((a, r) => a + r.posts, 0)).toBe(rj.posts);
    expect(br.reduce((a, r) => a + r.shareOfParent, 0)).toBeCloseTo(1);
  });
  it("respeita a janela temporal", () => {
    const early = aggregateGeo(metrics, { parentKey: "BR", childLevel: "uf", from: 0, to: 1800 });
    expect(early.reduce((a, r) => a + r.posts, 0)).toBeLessThan(br.reduce((a, r) => a + r.posts, 0));
  });
  it("filtro por tema reduz o volume e define participação", () => {
    const t = aggregateGeo(metrics, { parentKey: "BR", childLevel: "uf", from: 0, to: end, topic: "economia" });
    expect(t.every((r, i) => r.topicPosts <= br[i].posts)).toBe(true);
    expect(t.reduce((a, r) => a + r.topicPosts, 0)).toBeGreaterThan(0);
  });
  it("predominância e tendência são coerentes", () => {
    for (const r of br) {
      if (r.predominantCandidateId) expect(r.predominantShare).toBeGreaterThan(0.25 - 1e-9);
      expect(r.predominantShare).toBeLessThanOrEqual(1);
      if (r.trend !== null) expect(Number.isFinite(r.trend)).toBe(true);
    }
  });
  it("série nacional = soma das folhas", () => {
    const s = geoSeries(metrics, "BR");
    expect(s.reduce((a, p) => a + p.v, 0)).toBe(metrics.reduce((a, m) => a + m.posts, 0));
  });
  it("próximo nível suportado", () => {
    expect(nextLevel("pais")).toBe("uf");
    expect(nextLevel("uf")).toBe("municipio");
    expect(nextLevel("municipio")).toBeNull();
  });
  it("dados geo são demo", () => {
    expect(metrics.every((m) => m.provenance.mode === "demo")).toBe(true);
  });
});

describe("GeoProvider", () => {
  const p = new StaticGeoProvider();
  it("contornos de 27 UFs; município sem geometria", async () => {
    const uf = await p.boundaries("uf");
    expect(uf?.boundaries).toHaveLength(27);
    expect(new Set(uf!.boundaries.map((b) => b.key)).has("UF:SP")).toBe(true);
    const reg = await p.boundaries("regiao");
    expect(new Set(reg!.boundaries.map((b) => b.key)).size).toBe(5);
    expect(await p.boundaries("municipio")).toBeNull();
  });
  it("não retorna dados futuros", async () => {
    const m = await p.metrics("debate-presidencial-2026-1t", { to: 1200 });
    expect(m.every((x) => x.bucketStart + x.bucketSize <= 1200)).toBe(true);
  });
});
