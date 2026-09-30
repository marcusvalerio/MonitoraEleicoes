import { describe, expect, it } from "vitest";
import { detectMentions, validateClassifierOutput } from "./classifier";
import { DEMO_CANDIDATES } from "@/data/demo/entities";

describe("classificador", () => {
  it("detecta menção por nome e sobrenome, ignorando acentos e o próprio falante", () => {
    expect(detectMentions("A proposta de Otavio nao fecha, Brandao sabe", DEMO_CANDIDATES)).toEqual(["cand-d"]);
    expect(detectMentions("Helena Duarte respondeu", DEMO_CANDIDATES, "cand-a")).toEqual([]);
  });
  it("valida a saída estruturada do modelo", () => {
    const ok = { speaker: "x", topic: "economia", subtopic: null, speech_type: "proposta", tone: "propositivo", target: null, mentions: [], relevance: "alta", fact_check_required: true, confidence: 0.91 };
    expect(validateClassifierOutput(ok)).toBe(true);
    expect(validateClassifierOutput({ ...ok, confidence: 1.4 })).toBe(false);
    expect(validateClassifierOutput(null)).toBe(false);
  });
});
