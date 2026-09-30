import { describe, expect, it } from "vitest";
import { hasVerifiableClaim, relevanceBand, relevanceScore } from "./relevance";

describe("relevância", () => {
  const base = { verifiableClaim: false, concreteProposal: false, mentionsOther: false, triggersReply: false, socialLift: 0 };
  it("é zero sem critérios", () => expect(relevanceScore(base)).toBe(0));
  it("soma pesos e limita o lift", () => {
    expect(relevanceScore({ ...base, verifiableClaim: true, concreteProposal: true })).toBe(0.55);
    expect(relevanceScore({ ...base, socialLift: 5 })).toBe(0.2);
    expect(relevanceScore({ verifiableClaim: true, concreteProposal: true, mentionsOther: true, triggersReply: true, socialLift: 1 })).toBe(1);
  });
  it("faixas", () => {
    expect(relevanceBand(0.6)).toBe("alta");
    expect(relevanceBand(0.35)).toBe("media");
    expect(relevanceBand(0.34)).toBe("baixa");
  });
  it("detecta afirmação verificável", () => {
    expect(hasVerifiableClaim("meta de 50 bilhões")).toBe(true);
    expect(hasVerifiableClaim("vamos melhorar tudo")).toBe(false);
  });
});
