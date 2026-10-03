import { describe, expect, it } from "vitest";
import { headlineOf } from "./LiveStatus";

describe("headlineOf (estado visual da apuração)", () => {
  it("só 'encerrada' com totalização oficial; 'ao vivo' com apuração em curso; ausência nunca vira resultado", () => {
    expect(headlineOf("totalizada")).toBe("encerrada");
    expect(headlineOf("em_apuracao")).toBe("ao_vivo");
    expect(headlineOf("parcial")).toBe("ao_vivo");
    expect(headlineOf("indisponivel")).toBe("indisponivel");
    expect(headlineOf("nao_iniciada")).toBe("nao_iniciada");
    expect(headlineOf("nao_coletada")).toBe("nao_iniciada");
  });
});
