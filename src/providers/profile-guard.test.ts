import { describe, expect, it } from "vitest";
import { getProfileId, syntheticAllowed } from "./profile-guard";

describe("trava de dados reais: perfis sintéticos só em testes", () => {
  it("sem configuração ⇒ live (nunca demo)", () => {
    expect(getProfileId({})).toBe("live");
    expect(getProfileId({ NODE_ENV: "production" })).toBe("live");
  });
  it("demo/fixture exigem autorização explícita", () => {
    expect(getProfileId({ DATA_MODE: "demo", NODE_ENV: "production" })).toBe("live");
    expect(getProfileId({ DATA_MODE: "demo", MONITORA_ALLOW_SYNTHETIC: "1" })).toBe("demo");
    expect(getProfileId({ DATA_MODE: "fixture", NODE_ENV: "test" })).toBe("fixture");
  });
  it("produção recusa dados sintéticos mesmo com a flag", () => {
    expect(syntheticAllowed({ VERCEL_ENV: "production", MONITORA_ALLOW_SYNTHETIC: "1" })).toBe(false);
    expect(getProfileId({ DATA_MODE: "demo", MONITORA_ALLOW_SYNTHETIC: "1", MONITORA_ENV: "production" })).toBe("live");
  });
});
