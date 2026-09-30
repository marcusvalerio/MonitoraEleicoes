import { describe, expect, it } from "vitest";
import { NormalizationContext } from "./context";
import { normalize } from "./normalizers";
import { NormalizationError } from "@/providers/errors";
import type { RawRecord } from "@/providers/contracts";

function ctx() {
  const c = new NormalizationContext("demo", "2026-10-02T00:00:00.000Z");
  c.parties.set("P91", { id: "P91", acronym: "PDA", name: "Partido Demo Aurora", number: 91 });
  c.candidates.set("FX-101", { id: "FX-101", name: "Helena Duarte", ballotName: "Helena Duarte", partyId: "P91", officeId: "presidente", swatch: "#000", initials: "HD" });
  c.events.set("show-1", { debateId: "show-1", startsAt: "2026-10-02T00:00:00.000Z", blocks: new Map() });
  return c;
}
const raw = <P,>(schema: string, payload: P, over: Partial<RawRecord<P>> = {}): RawRecord<P> => ({ providerId: "p", schema, externalId: "e1", sourceUrl: "https://ex/1", publishedAt: "2026-10-02T00:00:10.000Z", collectedAt: "2026-10-02T00:00:12.000Z", payload, ...over });

describe("normalização", () => {
  it("cue (fixture) → TranscriptSegment, resolvendo orador por NOME e ms → s", () => {
    const n = normalize(raw("fixture.cue/v2", { show_id: "show-1", cue_id: "cue-0007", start_ms: 1500, end_ms: 9000, speaker: "HELENA DUARTE", section: "Bloco A", target: null, caption: "Texto original." }), ctx(), "src-x");
    expect(n.type).toBe("segment");
    if (n.type !== "segment") return;
    expect(n.value).toMatchObject({ speakerId: "FX-101", startOffset: 1.5, endOffset: 9, text: "Texto original.", seq: 7, debateId: "show-1" });
    expect(n.value.provenance).toMatchObject({ nature: "collected", sourceId: "src-x", record: { recordId: "p:e1", externalId: "e1", providerId: "p" } });
  });
  it("moderação é reconhecida em qualquer formato", () => {
    const n = normalize(raw("fixture.cue/v2", { show_id: "show-1", cue_id: "c1", start_ms: 0, end_ms: 10, speaker: "MODERAÇÃO", section: "A", target: "Helena Duarte", caption: "x" }), ctx(), "s");
    expect(n.type === "segment" && n.value.speakerId).toBe("moderador");
  });
  it("rejeita intervalo inválido com campo identificado", () => {
    try {
      normalize(raw("fixture.cue/v2", { show_id: "show-1", cue_id: "c", start_ms: 9000, end_ms: 100, speaker: "HELENA DUARTE", section: "A", target: null, caption: "x" }), ctx(), "s");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(NormalizationError);
      expect((e as NormalizationError).field).toBe("time");
      expect((e as NormalizationError).recordId).toBe("e1");
    }
  });
  it("rejeita orador desconhecido, esquema desconhecido e collectedAt inválido", () => {
    expect(() => normalize(raw("fixture.cue/v2", { show_id: "show-1", cue_id: "c", start_ms: 0, end_ms: 10, speaker: "FULANO", section: "A", target: null, caption: "x" }), ctx(), "s")).toThrow(NormalizationError);
    expect(() => normalize(raw("xpto/v9", {}), ctx(), "s")).toThrow(/sem normalizador/);
    expect(() => normalize(raw("fixture.cue/v2", {}, { collectedAt: "ontem" }), ctx(), "s")).toThrow(/collectedAt/);
  });
  it("regional: UF inválida rejeitada; cidade fora da referência vai para 'Demais municípios'; confiança numérica → nível", () => {
    const base = { show_id: "show-1", window: { start: "2026-10-02T00:05:00.000Z", end: "2026-10-02T00:10:00.000Z" }, count: 10, by_entity: [{ name: "Helena Duarte", count: 4 }, { name: "Ninguém", count: 3 }], by_topic: [{ label: "Economia", count: 6 }] };
    expect(() => normalize(raw("fixture.regional/v2", { ...base, uf: "XX", city: null, geo: { method: "bio", score: 0.9 } }), ctx(), "s")).toThrow(/UF desconhecida/);
    const n = normalize(raw("fixture.regional/v2", { ...base, uf: "RJ", city: "Petrópolis", geo: { method: "mention", score: 0.5 } }), ctx(), "s");
    expect(n.type).toBe("geo_metric");
    if (n.type !== "geo_metric") return;
    expect(n.value.regionKey).toBe("M:RJ:demais-municipios");
    expect(n.value.bucketStart).toBe(300);
    expect(n.value.bucketSize).toBe(300);
    expect(n.value.location).toEqual({ precision: "municipality", source: "text_mention", confidence: "low" });
    expect(n.value.mentionsByCandidate).toEqual({ "FX-101": 4 }); // entidade não resolvida é ignorada, não inventada
    expect(n.value.byTopic).toEqual({ economia: 6 });
  });
  it("contagens negativas são rejeitadas", () => {
    expect(() => normalize(raw("demo.social.count/v1", { event_id: "x", platform: "x", window_start_s: 0, window_s: 60, posts: -1, mentions: {}, topics: {} }), ctx(), "s")).toThrow(/posts/);
  });
  it("partido fixture traz identidade visual com vigência", () => {
    const n = normalize(raw("fixture.party/v2", { code: "P92", short: "PDH", full_name: "Partido Demo Horizonte", ballot_number: "92", brand: { hex: "#123456", since: "2026-01-01", until: null, ref: "manual" } }), ctx(), "s");
    expect(n.type === "party" && n.identity).toEqual({ partyId: "P92", acronym: "PDH", color: "#123456", validFrom: "2026-01-01", validTo: null, source: "manual" });
  });
});
