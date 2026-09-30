import { describe, expect, it } from "vitest";
import { getDemoDataset } from "@/data/demo/generate";
import { DEMO_CANDIDATES, DEMO_PARTIES } from "@/data/demo/entities";
import { candidateMentions, conversationVolume, GRANULARITIES, parseGranularity, partyMentions, platformDistribution, topicTrend } from "./temporal";
import { geoCoverage } from "./coverage";
import { getDemoGeoMetrics } from "@/data/demo/geo";

const m = getDemoDataset().metrics;
const total = m.reduce((a, x) => a + x.posts, 0);

describe("agregação temporal", () => {
  it.each(GRANULARITIES)("granularidade %s preserva o total", (g) => {
    const v = conversationVolume(m, g);
    expect(v.reduce((a, b) => a + b.posts, 0)).toBe(total);
    if (g === "debate") expect(v).toHaveLength(1);
  });
  it("janelas maiores ⇒ menos buckets", () => {
    expect(conversationVolume(m, 60).length).toBeGreaterThan(conversationVolume(m, 900).length);
  });
  it("parse de granularidade com fallback", () => {
    expect(parseGranularity("900")).toBe(900);
    expect(parseGranularity("debate")).toBe("debate");
    expect(parseGranularity("7")).toBe(60);
  });
  it("tendência de temas soma os temas", () => {
    const t = topicTrend(m, "debate")[0].value;
    const sum = m.reduce((a, x) => a + Object.values(x.byTopic).reduce((p, q) => p + (q ?? 0), 0), 0);
    expect(Object.values(t).reduce((a, b) => a + (b ?? 0), 0)).toBe(sum);
  });
  it("distribuição por plataforma soma 1", () => {
    const d = platformDistribution(m);
    expect(d.reduce((a, x) => a + (x.share ?? 0), 0)).toBeCloseTo(1);
    expect(platformDistribution([])).toEqual([]);
  });
  it("menções a partidos = soma das menções de seus candidatos (método explícito)", () => {
    const c = candidateMentions(m, DEMO_CANDIDATES);
    const p = partyMentions(m, DEMO_CANDIDATES, DEMO_PARTIES);
    expect(p.reduce((a, x) => a + x.mentions, 0)).toBe(c.reduce((a, x) => a + x.mentions, 0));
    expect(p.every((x) => x.method === "via_candidate")).toBe(true);
  });
});

describe("cobertura geográfica", () => {
  it("informa total, geolocalizados, % e precisão", () => {
    const cov = geoCoverage(m, getDemoGeoMetrics(), { from: 0, to: 3600, providers: ["demo"] });
    expect(cov.geolocatedRecords).toBeLessThan(cov.totalRecords);
    expect(cov.coveragePercentage).toBeCloseTo(cov.geolocatedRecords / cov.totalRecords);
    expect(cov.byPrecision.municipality).toBe(cov.geolocatedRecords);
    expect(cov.platforms.length).toBeGreaterThan(3);
  });
  it("sem registros ⇒ cobertura desconhecida (null), não 0%", () => {
    expect(geoCoverage([], [], { from: 0, to: 10, providers: [] }).coveragePercentage).toBeNull();
  });
});
