import { describe, expect, it } from "vitest";
import { FallbackClassifier, LlmSpeechClassifier, type LlmClient } from "./llm";
import { RuleBasedSpeechClassifier, RULES_MODEL } from "./classifiers";
import type { Candidate, TranscriptSegment } from "@/domain/types";
import { ingest } from "@/ingestion/pipeline";
import { FixtureElectionProvider, FixtureMediaProvider, FixtureSocialProvider, FixtureTranscriptProvider } from "@/providers/fixture";

const cands: Candidate[] = [
  { id: "c1", name: "Ana Lima", ballotName: "Ana", partyId: "p", officeId: "x", swatch: "#000", initials: "AL" },
  { id: "c2", name: "Bruno Reis", ballotName: "Bruno", partyId: "p", officeId: "x", swatch: "#000", initials: "BR" },
];
const seg: TranscriptSegment = { id: "s1", debateId: "d", seq: 1, speakerId: "c1", startOffset: null, endOffset: null, text: "Vamos ampliar o policiamento nas escolas.", blockId: "b", addressedToId: null, provenance: { nature: "collected", sourceId: "x", mode: "live" } };
const ctx = { candidates: cands, triggersReply: false, socialLift: 0 };
const good = { speaker: "c1", topic: "seguranca", subtopic: "Policiamento", speech_type: "proposta", tone: "propositivo", target: null, mentions: [], relevance: "media", fact_check_required: false, confidence: 0.8 };
const client = (out: unknown, model = "llm-x"): LlmClient => ({ complete: async () => ({ text: typeof out === "string" ? out : JSON.stringify(out), model }) });
const llm = (out: unknown, model?: string) => new LlmSpeechClassifier(client(out, model), { model: "llm-x", version: "2026-09" });

describe("classificador LLM: saída estruturada → esquema → domínio", () => {
  it("aceita saída válida e versiona modelo/prompt", async () => {
    const c = llm(good);
    expect(await c.classify(seg, ctx)).toMatchObject({ topic: "seguranca", subtopic: "Policiamento" });
    expect(c.model).toEqual({ model: "llm-x", version: "2026-09", promptVersion: "llm-structured-v1" });
    expect(c.methodologyVersion).toBe("criteria-sum@2");
  });
  it.each([
    ["não-JSON", "Claro! Aqui está"],
    ["tema fora do enum", { ...good, topic: "vencedor" }],
    ["confiança fora de [0,1]", { ...good, confidence: 1.4 }],
    ["campo extra", { ...good, winner: "c1" }],
    ["troca de orador", { ...good, speaker: "c2" }],
    ["menção desconhecida", { ...good, mentions: ["c9"] }],
    ["alvo = orador", { ...good, target: "c1" }],
    ["juízo político no subtema", { ...good, subtopic: "venceu o debate" }],
  ])("rejeita %s", async (_n, out) => {
    await expect(llm(out).classify(seg, ctx)).rejects.toThrow();
  });
  it("rejeita resposta de modelo diferente do declarado", async () => {
    await expect(llm(good, "outro-modelo").classify(seg, ctx)).rejects.toThrow(/modelo/);
  });
  it("fallback para regras registra o modelo que respondeu (não mascara)", async () => {
    const fb = new FallbackClassifier(llm({ ...good, topic: "x" }), new RuleBasedSpeechClassifier(() => cands));
    const out = await fb.classify(seg, ctx);
    expect(out.produced_by).toEqual(RULES_MODEL);
  });
  it("análise inválida vira rejeição (ingestion_error), não análise", async () => {
    const store = await ingest({ mode: "demo", election: new FixtureElectionProvider(), transcript: new FixtureTranscriptProvider(), social: new FixtureSocialProvider(), media: new FixtureMediaProvider(), classifier: () => llm({ ...good, topic: "vencedor" }), aiSourceId: "src-ai", sleep: async () => {} });
    expect(store.classifications.size).toBe(0);
    const aiRej = store.rejections.filter((r) => r.code === "classification_error");
    expect(aiRej.length).toBe(101);
    expect(aiRej.every((r) => r.recordId)).toBe(true);
    expect(store.reports.find((r) => r.kind === "ai:classification")!.status).toBe("partial");
  });
});
