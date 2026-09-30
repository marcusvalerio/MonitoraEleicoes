import { describe, expect, it } from "vitest";
import { ingest, type IngestionSources } from "./pipeline";
import type { DataStore } from "./store";
import { DemoElectionProvider, DemoMediaProvider, DemoSocialProvider, DemoTranscriptProvider } from "@/providers/demo";
import { DemoSpeechClassifier } from "@/providers/demo/classifier";
import { FixtureElectionProvider, FixtureMediaProvider, FixtureSocialProvider, FixtureTranscriptProvider } from "@/providers/fixture";
import { RuleBasedSpeechClassifier } from "@/ai/classifiers";
import { ProviderUnavailable } from "@/providers/errors";
import { detectEvents } from "@/analytics/events";
import { topicStats } from "@/analytics/debate";
import { aggregateGeo } from "@/geo/aggregate";
import { geoCoverage } from "@/analytics/coverage";
import { hasCausalLanguage } from "@/domain/statements";
import { violatesEditorialPolicy } from "@/domain/guards";
import { MODERATOR_SPEAKER_ID } from "@/domain/types";

const demo: IngestionSources = { mode: "demo", election: new DemoElectionProvider(), transcript: new DemoTranscriptProvider(), social: new DemoSocialProvider(), media: new DemoMediaProvider(), classifier: () => new DemoSpeechClassifier(), aiSourceId: "src-demo-ai" };
const fixture: IngestionSources = { mode: "demo", election: new FixtureElectionProvider(), transcript: new FixtureTranscriptProvider(), social: new FixtureSocialProvider(), media: new FixtureMediaProvider(), classifier: (s) => new RuleBasedSpeechClassifier(() => [...s.candidates.values()]), aiSourceId: "src-fixture-ai" };

/** Mesmo código de analytics aplicado a qualquer store — prova de desacoplamento. */
function runAnalytics(store: DataStore) {
  const debate = [...store.debates.values()].find((d) => d.status === "live")!;
  const segments = store.segments.get(debate.id)!;
  const classifications = segments.map((s) => store.classifications.get(s.id)!);
  const metrics = store.socialMetrics.get(debate.id)!;
  const geo = store.geoMetrics.get(debate.id)!;
  const end = Math.max(...geo.map((m) => m.bucketStart + m.bucketSize));
  return {
    debate,
    events: detectEvents({ debateId: debate.id, segments, classifications, metrics, candidates: [...store.candidates.values()], mode: "demo", startsAt: debate.startsAt }),
    topics: topicStats(segments, classifications, { excludeModerator: MODERATOR_SPEAKER_ID }),
    geo: aggregateGeo(geo, { parentKey: "BR", childLevel: "uf", from: 0, to: end }),
    coverage: geoCoverage(metrics, geo, { from: 0, to: end, providers: [] }),
  };
}

describe.each([
  ["demo", demo],
  ["fixture", fixture],
] as const)("aceitação · provider %s → normalização → domínio → analytics", (name, src) => {
  let store: DataStore;
  it("ingere sem falhas de provider", async () => {
    store = await ingest(src);
    expect(store.reports.every((r) => r.status !== "failed")).toBe(true);
    expect(store.debates.size).toBeGreaterThan(0);
    expect(store.candidates.size).toBe(4);
  });
  it("todas as falas classificadas; RAW preservado e separado da IA", () => {
    const segs = [...store.segments.values()].flat();
    expect(segs.length).toBe(101);
    for (const s of segs) {
      const c = store.classifications.get(s.id)!;
      expect(c).toBeDefined();
      expect(c.provenance.nature).toBe("ai");
      expect(c.model.model).toBeTruthy();
      expect(c.model.promptVersion).toBeTruthy();
      expect(["high", "medium", "low", "unknown"]).toContain(c.confidenceLevel);
      expect(s.provenance.nature).toBe("collected");
      expect((c as unknown as { text?: string }).text).toBeUndefined();
    }
  });
  it("proveniência: toda entidade aponta para um SourceRecord com externalId e datas coerentes", () => {
    const withRecords = [...[...store.segments.values()].flat(), ...[...store.socialMetrics.values()].flat(), ...[...store.geoMetrics.values()].flat(), ...store.candidates.values()];
    for (const e of withRecords) {
      const ref = e.provenance!.record!;
      const sr = store.sourceRecords.get(ref.recordId)!;
      expect(sr, ref.recordId).toBeDefined();
      expect(sr.externalId).toBe(ref.externalId);
      expect(sr.payloadHash).toMatch(/^[0-9a-f]{8}$/);
      if (sr.publishedAt) expect(Date.parse(sr.collectedAt)).toBeGreaterThanOrEqual(Date.parse(sr.publishedAt));
    }
  });
  it("cor do candidato vem da identidade partidária (dados), não de componentes", () => {
    for (const c of store.candidates.values()) {
      const id = store.identities.find((i) => i.partyId === c.partyId)!;
      expect(c.swatch).toBe(id.color);
    }
  });
  it("mesmo analytics produz resultados válidos", () => {
    const a = runAnalytics(store);
    expect(a.events.length).toBeGreaterThan(5);
    expect(a.topics.length).toBeGreaterThan(3);
    expect(a.geo).toHaveLength(27);
    expect(a.coverage.coveragePercentage).toBeGreaterThan(0.3);
    expect(a.coverage.coveragePercentage).toBeLessThan(0.5);
    for (const e of a.events) {
      expect(e.statements.length).toBeGreaterThan(0);
      for (const st of e.statements) {
        expect(hasCausalLanguage(st.text), st.text).toBe(false);
        expect(violatesEditorialPolicy(st.text)).toBeNull();
      }
    }
  });
  if (name === "fixture") {
    it("registros inválidos são rejeitados e contabilizados (não corrigidos)", () => {
      const seg = store.reports.find((r) => r.kind.startsWith("transcript:segments"))!;
      expect(seg).toMatchObject({ rejected: 1, status: "partial" });
      expect(seg.issues[0]).toMatchObject({ externalId: "cue-broken", field: "time" });
      const geo = store.reports.find((r) => r.kind.startsWith("social:regional"))!;
      expect(geo.rejected).toBe(3);
    });
    it("provider sem capability não é consultado; mídia não configurada fica fora", () => {
      expect(store.socialPosts.size).toBe(0);
      expect(store.articles).toHaveLength(0);
    });
  }
});

describe("desacoplamento", () => {
  it("demo e fixture diferem em IDs e cores, mas produzem o mesmo domínio", async () => {
    const [a, b] = await Promise.all([ingest(demo), ingest(fixture)]);
    const ids = (s: DataStore) => [...s.candidates.keys()].sort();
    expect(ids(a)).not.toEqual(ids(b));
    const color = (s: DataStore, name: string) => [...s.candidates.values()].find((c) => c.name === name)!.swatch;
    expect(color(a, "Helena Duarte")).not.toBe(color(b, "Helena Duarte"));
    const txt = (s: DataStore) => [...s.segments.values()].flat().map((x) => x.text);
    expect(txt(a)).toEqual(txt(b));
  });
  it("falha de um provider não derruba os demais (dados parciais)", async () => {
    const broken = new DemoSocialProvider();
    broken.fetchCounts = async () => {
      throw new ProviderUnavailable("demo-social");
    };
    const store = await ingest({ ...demo, social: broken, sleep: async () => {} });
    const r = store.reports.find((x) => x.kind.startsWith("social:counts"))!;
    expect(r.status).toBe("failed");
    expect([...store.segments.values()].flat().length).toBe(101);
    expect(store.socialMetrics.size).toBe(0);
  });
});
