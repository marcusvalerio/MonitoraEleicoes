import { describe, expect, it } from "vitest";
import { confidenceLevel, fromNullable, isValue, missing, val, valueOr } from "./quality";
import { hasCausalLanguage, temporalAssociation } from "./statements";
import { identityAt } from "./identity";
import { payloadHash } from "./provenance";

describe("dados ausentes nunca viram zero", () => {
  it("diferencia 0, desconhecido, não disponível, não coletado e não aplicável", () => {
    expect(val(0)).toEqual({ kind: "value", value: 0 });
    expect(isValue(val(0))).toBe(true);
    expect(fromNullable(null).kind).toBe("unknown");
    expect(fromNullable(undefined, "not_collected").kind).toBe("not_collected");
    expect(missing("not_available").kind).toBe("not_available");
    expect(valueOr(missing<number>("not_applicable"), -1)).toBe(-1);
    expect(valueOr(val(0), -1)).toBe(0);
  });
  it("confiança em níveis", () => {
    expect([0.9, 0.7, 0.3, null, NaN].map(confidenceLevel)).toEqual(["high", "medium", "low", "unknown", "unknown"]);
  });
});

describe("fato × medição × interpretação", () => {
  it("detecta linguagem causal", () => {
    for (const t of ["A fala gerou o aumento.", "O pico foi causado… e provocou reações", "Cresceu por causa da fala", "fez aumentar o volume"]) expect(hasCausalLanguage(t), t).toBe(true);
    expect(hasCausalLanguage("O aumento foi temporalmente associado ao período da fala.")).toBe(false);
  });
  it("formulação padrão de associação não é causal", () => {
    const t = temporalAssociation("O aumento", "da fala de X");
    expect(t).toMatch(/temporalmente associado/);
    expect(hasCausalLanguage(t)).toBe(false);
  });
});

describe("identidade visual e proveniência", () => {
  it("identidade respeita vigência", () => {
    const ids = [
      { partyId: "p", acronym: "P", color: "#111111", validFrom: "2020-01-01", validTo: "2025-12-31", source: "a" },
      { partyId: "p", acronym: "P", color: "#222222", validFrom: "2026-01-01", validTo: null, source: "b" },
    ];
    expect(identityAt(ids, "p", "2024-05-01T00:00:00Z")?.color).toBe("#111111");
    expect(identityAt(ids, "p", "2026-10-01T00:00:00Z")?.color).toBe("#222222");
    expect(identityAt(ids, "x", "2026-10-01")).toBeNull();
  });
  it("hash do payload muda quando o conteúdo muda", () => {
    expect(payloadHash({ a: 1 })).toBe(payloadHash({ a: 1 }));
    expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
  });
});
