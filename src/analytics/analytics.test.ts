import { describe, expect, it } from "vitest";
import { getDemoDataset } from "@/data/demo/generate";
import { DEMO_CANDIDATES, DEMO_DEBATE, MODERATOR_ID } from "@/data/demo/entities";
import { candidateActivity, interactionEdges, speechComposition, topicHeatmap, topicStats, topicTimeline } from "./debate";
import { detectEvents } from "./events";
import { volumeSeries } from "./social";
import { violatesEditorialPolicy } from "@/domain/guards";

const ds = getDemoDataset();
const ids = DEMO_CANDIDATES.map((c) => c.id);

describe("agregações do debate", () => {
  it("participação de temas soma 1", () => {
    const t = topicStats(ds.segments, ds.classifications, { excludeModerator: MODERATOR_ID });
    expect(t.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1);
    expect(t[0].segments).toBeGreaterThanOrEqual(t[t.length - 1].segments);
  });
  it("atividade por candidato bate com os segmentos", () => {
    const act = candidateActivity(DEMO_CANDIDATES, ds.segments, ds.classifications);
    const total = act.reduce((a, x) => a + x.interventions, 0);
    expect(total).toBe(ds.segments.filter((s) => s.speakerId !== MODERATOR_ID).length);
    const asked = act.reduce((a, x) => a + x.questionsAsked, 0);
    expect(asked).toBe(act.reduce((a, x) => a + x.questionsReceived, 0));
  });
  it("composição cobre todas as falas dos candidatos", () => {
    const comp = speechComposition(ids, ds.segments, ds.classifications);
    const total = Object.values(comp).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y, 0), 0);
    expect(total).toBe(ds.segments.filter((s) => s.speakerId !== MODERATOR_ID).length);
  });
  it("heatmap preserva a duração total dos temas", () => {
    const topics = topicStats(ds.segments, ds.classifications).map((t) => t.topic);
    const h = topicHeatmap(ds.segments, ds.classifications, 600, topics);
    const sum = h.grid.flat().reduce((a, b) => a + b, 0);
    const expected = topicStats(ds.segments, ds.classifications).reduce((a, t) => a + t.seconds, 0);
    expect(sum).toBe(expected);
  });
  it("timeline de temas é ordenada", () => {
    const tl = topicTimeline(ds.segments, ds.classifications);
    for (let i = 1; i < tl.length; i++) expect(tl[i].start).toBeGreaterThan(tl[i - 1].start);
  });
  it("interações nunca são auto-referentes", () => {
    const e = interactionEdges(ds.segments, ds.classifications, ids);
    expect(e.length).toBeGreaterThan(0);
    expect(e.every((x) => x.from !== x.to)).toBe(true);
  });
});

describe("event engine", () => {
  const events = detectEvents({ debateId: DEMO_DEBATE.id, segments: ds.segments, classifications: ds.classifications, metrics: ds.metrics, candidates: DEMO_CANDIDATES, mode: "demo" });
  it("gera eventos ordenados com códigos sequenciais", () => {
    expect(events.length).toBeGreaterThan(20);
    events.forEach((e, i) => expect(e.code).toBe(`#${String(i + 1).padStart(3, "0")}`));
    for (let i = 1; i < events.length; i++) expect(events[i].startOffset).toBeGreaterThanOrEqual(events[i - 1].startOffset);
  });
  it("inclui todos os tipos e referencia segmentos existentes", () => {
    const kinds = new Set(events.map((e) => e.kind));
    for (const k of ["mention", "topic_shift", "social_spike"]) expect(kinds.has(k as never)).toBe(true);
    const segIds = new Set(ds.segments.map((s) => s.id));
    expect(events.every((e) => e.segmentIds.every((s) => segIds.has(s)))).toBe(true);
  });
  it("não produz linguagem de juízo político", () => {
    for (const e of events) expect(violatesEditorialPolicy(`${e.title} ${e.description}`)).toBeNull();
  });
  it("não usa dados futuros quando recortado", () => {
    const cut = 3000;
    const partial = detectEvents({ debateId: DEMO_DEBATE.id, segments: ds.segments.filter((s) => s.endOffset <= cut), classifications: ds.classifications, metrics: ds.metrics.filter((m) => m.bucketStart + 60 <= cut), candidates: DEMO_CANDIDATES, mode: "demo" });
    expect(partial.every((e) => e.startOffset <= cut)).toBe(true);
  });
});

describe("social", () => {
  it("série de volume respeita o corte temporal", () => {
    const s = volumeSeries(ds.metrics, 1200);
    expect(s.every((p) => p.t <= 1200)).toBe(true);
  });
});

describe("event engine · janelas incompletas", () => {
  it("não calcula variação social sem a janela posterior completa", () => {
    const cut = 2500;
    const ev = detectEvents({ debateId: DEMO_DEBATE.id, segments: ds.segments.filter((s) => s.endOffset <= cut), classifications: ds.classifications, metrics: ds.metrics.filter((m) => m.bucketStart + 60 <= cut), candidates: DEMO_CANDIDATES, mode: "demo" });
    for (const e of ev) if (e.metrics.some((m) => m.unit === "%")) expect(e.startOffset + 300).toBeLessThanOrEqual(cut + 600);
    const lastChain = ev.filter((e) => e.kind === "mention" || e.kind === "reply_chain").at(-1)!;
    expect(lastChain.metrics).toEqual([]);
  });
});
