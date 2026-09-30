import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ingest, type IngestionSources } from "./pipeline";
import type { DataStore } from "./store";
import { FilePressProvider, FileRegistryElectionProvider, FileTranscriptProvider, REAL_DATA_DIR, UnconfiguredSocialProvider } from "@/providers/files";
import { DemoElectionProvider, DemoMediaProvider, DemoSocialProvider, DemoTranscriptProvider } from "@/providers/demo";
import { DemoSpeechClassifier } from "@/providers/demo/classifier";
import { FixtureElectionProvider, FixtureMediaProvider, FixtureSocialProvider, FixtureTranscriptProvider } from "@/providers/fixture";
import { RuleBasedSpeechClassifier } from "@/ai/classifiers";
import { candidateActivity, candidateSpeechDistribution, speechComposition, topicStats, topicTimeline, topicHeatmap, interactionEdges } from "@/analytics/debate";
import { detectEvents } from "@/analytics/events";
import { debateTimeline, timingSummary, transcriptQuality } from "@/analytics/timeline";
import { describeSegment } from "@/analytics/narrative";
import { hasCausalLanguage } from "@/domain/statements";
import { violatesEditorialPolicy } from "@/domain/guards";
import { MODERATOR_SPEAKER_ID, UNKNOWN_SPEAKER_ID, isTimed } from "@/domain/types";

const RJ = "rj-governador-2026-09-29-globo";
const rules = (s: DataStore) => new RuleBasedSpeechClassifier(() => [...s.candidates.values()]);
const live = (root = REAL_DATA_DIR): IngestionSources => ({
  mode: "live",
  election: new FileRegistryElectionProvider(root),
  transcript: new FileTranscriptProvider(root),
  social: new UnconfiguredSocialProvider(),
  media: new FilePressProvider(root),
  classifier: rules,
  aiSourceId: "src-ai-rules",
});

/** EXATAMENTE os mesmos analytics usados pelo DEMO — sem código específico para o RJ. */
function sameAnalytics(store: DataStore, debateId: string) {
  const debate = store.debates.get(debateId)!;
  const segments = store.segments.get(debateId) ?? [];
  const cls = segments.map((s) => store.classifications.get(s.id)!).filter(Boolean);
  const cands = [...store.candidates.values()].filter((c) => debate.participantIds.includes(c.id));
  const name = (id: string) => store.candidates.get(id)?.name ?? "Moderação";
  const topics = topicStats(segments, cls, { excludeModerator: MODERATOR_SPEAKER_ID });
  return {
    topics,
    activity: candidateActivity(cands, segments, cls),
    composition: speechComposition(debate.participantIds, segments, cls),
    distribution: candidateSpeechDistribution(debate.participantIds, segments, cls),
    timeline: topicTimeline(segments, cls),
    heatmap: topicHeatmap(segments, cls, 600, topics.map((t) => t.topic)),
    interactions: interactionEdges(segments, cls, debate.participantIds),
    events: detectEvents({ debateId, segments, classifications: cls, metrics: store.socialMetrics.get(debateId) ?? [], candidates: cands, mode: debate.mode, startsAt: debate.startsAt }),
    speech: debateTimeline(segments, 60),
    timing: timingSummary(segments),
    quality: transcriptQuality(segments, cls, store.reports.find((r) => r.kind === `transcript:segments:${debateId}`) ?? null),
    narratives: segments.map((s) => describeSegment(s, store.classifications.get(s.id)!, name)),
  };
}

describe("debate real · Governo do RJ · TV Globo · 29/09/2026", () => {
  let store: DataStore;
  const file = JSON.parse(readFileSync(path.join(REAL_DATA_DIR, "rj-governador-2026-09-29", "transcript.press-final-statements.json"), "utf-8"));

  it("ingere pelo mesmo pipeline, sem rejeições", async () => {
    store = await ingest(live());
    expect(store.reports.every((r) => r.status === "ok")).toBe(true);
    const seg = store.reports.find((r) => r.kind === `transcript:segments:${RJ}`)!;
    expect(seg).toMatchObject({ fetched: 5, normalized: 5, rejected: 0 });
  });

  it("debate com metadados reais; fim desconhecido fica nulo (não inventado)", () => {
    const d = store.debates.get(RJ)!;
    expect(d).toMatchObject({ title: "Debate para o Governo do Rio de Janeiro", broadcaster: "TV Globo", jurisdiction: "RJ", officeLabel: "Governador", status: "ended", endsAt: null, mode: "live" });
    expect(d.startsAt).toBe("2026-09-30T01:15:00.000Z");
  });

  it("participantes resolvidos contra entidades Candidate → Party (não por nome solto)", () => {
    const d = store.debates.get(RJ)!;
    expect(d.participantIds).toHaveLength(5);
    const parties = d.participantIds.map((id) => store.parties.get(store.candidates.get(id)!.partyId)!.acronym).sort();
    expect(parties).toEqual(["NOVO", "PL", "PSD", "PSOL", "REPUBLICANOS"]);
    for (const c of store.candidates.values()) expect(c.provenance?.nature).toBe("official");
  });

  it("RAW preservado: texto idêntico ao arquivo; sem timestamps inventados; precisão registrada", () => {
    const segs = store.segments.get(RJ)!;
    expect(segs.map((s) => s.text)).toEqual(file.segments.map((s: { text: string }) => s.text));
    for (const s of segs) {
      expect(s.startOffset).toBeNull();
      expect(s.endOffset).toBeNull();
      expect(s.timing?.precision).toBe("block");
      expect(s.speakerResolution).toBe("press_attribution");
      expect(s.speakerConfidence).toBe("medium");
      expect(s.speakerId).not.toBe(UNKNOWN_SPEAKER_ID);
    }
  });

  it("proveniência aponta para a matéria (URL, publicação, coleta, hash do payload)", () => {
    const s = store.segments.get(RJ)![0];
    const r = store.sourceRecords.get(s.provenance.record!.recordId)!;
    expect(r.sourceUrl).toMatch(/^https:\/\/mancheterio\.com\.br\//);
    expect(r.publishedAt).toBe("2026-09-30T09:18:14.000Z");
    expect(Date.parse(r.collectedAt)).toBeGreaterThan(Date.parse(r.publishedAt!));
    expect(store.articles[0].url).toBe(r.sourceUrl);
  });

  it("classificação pelo classificador existente, com modelo, confiança e critérios de relevância", () => {
    for (const s of store.segments.get(RJ)!) {
      const c = store.classifications.get(s.id)!;
      expect(c.model.model).toBe("rule-based-classifier");
      expect(["high", "medium", "low", "unknown"]).toContain(c.confidenceLevel);
      expect(c.relevanceFeatures.socialLift).toBe(0); // sem repercussão coletada
      expect(c.relevanceScore).toBeGreaterThanOrEqual(0);
    }
  });

  it("mesmos analytics funcionam; o que depende de tempo é 'not_available'", () => {
    const a = sameAnalytics(store, RJ);
    expect(a.topics.length).toBeGreaterThan(0);
    expect(a.activity.every((x) => x.speakingSeconds === null && x.words > 0 && x.untimedSegments === 1)).toBe(true);
    expect(a.distribution.reduce((s, x) => s + x.words, 0)).toBe(764);
    expect(a.speech.kind).toBe("not_available");
    expect(a.timing).toMatchObject({ total: 5, timed: 0, untimed: 5, replayable: false });
    expect(a.timeline).toEqual([]);
    expect(a.events).toEqual([]); // eventos exigem posição temporal; nenhum é inventado
    expect(a.quality).toMatchObject({ received: 5, normalized: 5, rejected: 0, speakersResolved: 5, speakersUnresolved: 0, timestampsAvailable: 0, timestampsMissing: 5 });
    for (const n of a.narratives) {
      expect(violatesEditorialPolicy(n)).toBeNull();
      expect(hasCausalLanguage(n)).toBe(false);
    }
  });
});

describe("arquivo com tempo exato (VTT) — caminho de replay", () => {
  // Arquivos SINTÉTICOS de teste, gravados num diretório temporário. Não são dados reais.
  const root = mkdtempSync(path.join(tmpdir(), "monitora-"));
  const dir = path.join(root, "evento-teste");
  mkdirSync(dir);
  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      debate: { id: "teste-vtt", title: "Evento de teste", broadcaster: "Teste", jurisdiction: "XX", office: "Teste", electionYear: 2026, round: 1, startsAt: "2026-01-01T00:00:00.000Z", endsAt: null, status: "ended", participants: ["Ana Teste", "Beto Teste"], blocks: ["Bloco único"] },
      transcript: { file: "t.vtt", timing: "unknown", speakerAttribution: "source_label", source: { name: "teste", url: null, publishedAt: null, collectedAt: "2026-01-02T00:00:00.000Z", documentSha256: null } },
      speakerMap: { "ANA T.": "Ana Teste" },
    }),
  );
  writeFileSync(
    path.join(dir, "registry.json"),
    JSON.stringify({ election: { office: "Teste" }, source: { collectedAt: "2026-01-02T00:00:00.000Z" }, parties: [{ acronym: "PA", name: "Partido A", number: 1 }], candidates: [{ name: "Ana Teste", party: "PA", ballotNumber: 1, tseId: null }, { name: "Beto Teste", party: "PA", ballotNumber: 2, tseId: null }], partyIdentity: { source: "teste", validFrom: "2026-01-01", colors: { PA: "#3987e5" } } }),
  );
  writeFileSync(path.join(dir, "t.vtt"), "WEBVTT\n\n00:00:05.000 --> 00:00:20.000\n<v ANA T.>Vamos investir 10 bilhões em saúde.</v>\n\n00:00:21.000 --> 00:00:40.000\n<v Beto Teste>Beto Teste responde sobre escolas.</v>\n\n00:00:41.000 --> 00:00:45.000\n<v Pessoa X>Fala de alguém não identificado.</v>\n");

  it("offsets exatos, mapa manual de orador e orador desconhecido (não rejeitado, não assumido)", async () => {
    const store = await ingest(live(root));
    const segs = store.segments.get("teste-vtt")!;
    expect(segs.map((s) => [s.startOffset, s.endOffset])).toEqual([
      [5, 20],
      [21, 40],
      [41, 45],
    ]);
    expect(segs.every(isTimed)).toBe(true);
    expect(segs[0]).toMatchObject({ speakerResolution: "manual_map", speakerConfidence: "high", timing: { precision: "exact" } });
    expect(segs[1]).toMatchObject({ speakerResolution: "source_label", speakerConfidence: "high" });
    expect(segs[2]).toMatchObject({ speakerId: UNKNOWN_SPEAKER_ID, speakerConfidence: "unknown", speakerResolution: "unresolved", speakerName: "Pessoa X" });
    const a = sameAnalytics(store, "teste-vtt");
    expect(a.speech.kind).toBe("value");
    expect(a.timing.replayable).toBe(true);
    expect(a.quality).toMatchObject({ speakersResolved: 2, speakersUnresolved: 1, timestampsAvailable: 3 });
    expect(store.blocks.get("teste-vtt")).toEqual([]); // VTT sem blocos → nenhum bloco inventado
  });
});

describe("tabela de aceitação · mesmos analytics em todos os perfis", () => {
  const profiles: [string, IngestionSources][] = [
    ["DEMO", { mode: "demo", election: new DemoElectionProvider(), transcript: new DemoTranscriptProvider(), social: new DemoSocialProvider(), media: new DemoMediaProvider(), classifier: () => new DemoSpeechClassifier(), aiSourceId: "src-demo-ai" }],
    ["FIXTURE", { mode: "demo", election: new FixtureElectionProvider(), transcript: new FixtureTranscriptProvider(), social: new FixtureSocialProvider(), media: new FixtureMediaProvider(), classifier: rules, aiSourceId: "src-fixture-ai" }],
    ["REAL RJ", live()],
  ];
  it.each(profiles)("%s: ingestão → classificação → analytics → timeline", async (_name, src) => {
    const store = await ingest(src);
    const debate = [...store.debates.values()].find((d) => (store.segments.get(d.id) ?? []).length > 0)!;
    const segs = store.segments.get(debate.id)!;
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.every((s) => store.classifications.has(s.id))).toBe(true); // Classification ✓
    const a = sameAnalytics(store, debate.id); // Analytics ✓
    expect(a.topics.length).toBeGreaterThan(0);
    expect(["value", "not_available"]).toContain(a.speech.kind); // Timeline ✓ (ou ausência explícita)
    expect(a.quality.normalized).toBe(segs.length);
  });
});
