import { describe, expect, it } from "vitest";
import { computeLatency, connectionStatus, STALE_S } from "./live";
import { speakerStatus } from "./types";

const T = (s: number) => new Date(Date.UTC(2026, 8, 30, 22, 0, 0) + s * 1000).toISOString();

describe("latência ao vivo", () => {
  it("fonte ao vivo: captura, ingestão, análise, processamento e ponta a ponta (mediana)", () => {
    const l = computeLatency([
      { sourceMode: "live", sourceEnd: T(0), collectedAt: T(1), ingestedAt: T(1.5), processedAt: T(2.1) },
      { sourceMode: "live", sourceEnd: T(10), collectedAt: T(11.2), ingestedAt: T(11.6), processedAt: T(12.4) },
      { sourceMode: "live", sourceEnd: T(20), collectedAt: T(21), ingestedAt: T(21.4), processedAt: T(22) },
    ]);
    expect(l).toMatchObject({ captureS: 1, ingestionS: 0.4, analysisS: 0.6, processingS: 1.1, endToEndS: 2.1, sample: 3 });
  });
  it("replay: captura e ponta a ponta não se aplicam (null), processamento sim", () => {
    const l = computeLatency([{ sourceMode: "replay", sourceEnd: T(0), collectedAt: T(0), ingestedAt: T(1), processedAt: T(1.3) }]);
    expect(l.captureS).toBeNull();
    expect(l.endToEndS).toBeNull();
    expect(l.processingS).toBe(1.3);
  });
  it("sem instantes ⇒ null (nunca 0); intervalos negativos descartados", () => {
    expect(computeLatency([])).toMatchObject({ captureS: null, ingestionS: null, processingS: null, sample: 0 });
    expect(computeLatency([{ sourceMode: "live", sourceEnd: null, collectedAt: T(5), ingestedAt: T(4), processedAt: null }]).ingestionS).toBeNull();
  });
});

describe("conexão e orador", () => {
  const now = Date.parse(T(100));
  it("online só com batimento recente; sem controle = desconhecida", () => {
    expect(connectionStatus({ status: "live", lastHeartbeatAt: T(95) }, now)).toBe("online");
    expect(connectionStatus({ status: "live", lastHeartbeatAt: T(100 - STALE_S - 1) }, now)).toBe("stale");
    expect(connectionStatus({ status: "live", lastHeartbeatAt: null }, now)).toBe("stale");
    expect(connectionStatus({ status: "paused", lastHeartbeatAt: T(99) }, now)).toBe("paused");
    expect(connectionStatus(null, now)).toBe("unknown");
  });
  it("identificado / incerto / desconhecido", () => {
    expect(speakerStatus({ speakerId: "c1", speakerConfidence: "high" })).toBe("identified");
    expect(speakerStatus({ speakerId: "c1", speakerConfidence: "medium" })).toBe("uncertain");
    expect(speakerStatus({ speakerId: "orador-desconhecido", speakerConfidence: "high" })).toBe("unknown");
    expect(speakerStatus({ speakerId: "c1", speakerConfidence: "unknown" })).toBe("unknown");
  });
});
