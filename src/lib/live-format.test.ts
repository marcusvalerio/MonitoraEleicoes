import { describe, expect, it } from "vitest";
import { fmtDecimal, fmtSeconds, fmtTime } from "./live-format";

describe("formatação ao vivo", () => {
  it("ausência vira '—', nunca 0", () => {
    expect(fmtSeconds(null)).toBe("—");
    expect(fmtDecimal(null)).toBe("—");
    expect(fmtTime(null)).toBe("—");
  });
  it("pt-BR com vírgula", () => {
    expect(fmtSeconds(2.34)).toBe("2,3 s");
    expect(fmtDecimal(0.88)).toBe("0,88");
    expect(fmtSeconds(0)).toBe("0,0 s");
  });
});
