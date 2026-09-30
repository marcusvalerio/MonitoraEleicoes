import type { TranscriptProvider, TranscriptWindow } from "../types";
import { getDemoDataset } from "@/data/demo/generate";
import { DEMO_CANDIDATES, DEMO_DEBATE, DEMO_PAST_DEBATE } from "@/data/demo/entities";
import { detectEvents } from "@/analytics/events";

const inRange = (x: number, r?: { from?: number; to?: number }) => (r?.from === undefined || x >= r.from) && (r?.to === undefined || x <= r.to);

/** Provider de transcrição DEMO. Filtragem por janela ocorre no servidor. */
export class MockTranscriptProvider implements TranscriptProvider {
  readonly id = "mock-transcript";
  readonly mode = "demo" as const;

  async listDebates() {
    return [DEMO_DEBATE, DEMO_PAST_DEBATE];
  }
  async getDebate(id: string) {
    return (await this.listDebates()).find((d) => d.id === id) ?? null;
  }
  async getBlocks(debateId: string) {
    return debateId === DEMO_DEBATE.id ? getDemoDataset().blocks : [];
  }
  async getTranscript(debateId: string, range?: { from?: number; to?: number }): Promise<TranscriptWindow> {
    if (debateId !== DEMO_DEBATE.id) return { segments: [], classifications: [], cursor: 0, complete: true, inProgress: null };
    const ds = getDemoDataset();
    // Um segmento só "existe" depois de terminado (fala completa transcrita).
    const segments = ds.segments.filter((s) => inRange(s.endOffset, range));
    const ids = new Set(segments.map((s) => s.id));
    const last = ds.segments[ds.segments.length - 1];
    return {
      segments,
      classifications: ds.classifications.filter((c) => ids.has(c.segmentId)),
      cursor: segments.length ? segments[segments.length - 1].endOffset : range?.from ?? 0,
      complete: range?.to === undefined || range.to >= last.endOffset,
      inProgress: (() => {
        if (range?.to === undefined) return null;
        const cur = ds.segments.find((s) => s.startOffset <= range.to! && s.endOffset > range.to!);
        return cur ? { speakerId: cur.speakerId, startOffset: cur.startOffset, blockId: cur.blockId } : null;
      })(),
    };
  }
  async getEvents(debateId: string, range?: { from?: number; to?: number }) {
    if (debateId !== DEMO_DEBATE.id) return [];
    const ds = getDemoDataset();
    const upTo = range?.to ?? Infinity;
    // Eventos são recalculados apenas com dados disponíveis até o instante (sem "ver o futuro").
    const segments = ds.segments.filter((s) => s.endOffset <= upTo);
    const ids = new Set(segments.map((s) => s.id));
    const events = detectEvents({
      debateId,
      segments,
      classifications: ds.classifications.filter((c) => ids.has(c.segmentId)),
      metrics: ds.metrics.filter((m) => m.bucketStart + m.bucketSize <= upTo),
      candidates: DEMO_CANDIDATES,
      mode: "demo",
    });
    return events.filter((e) => inRange(e.startOffset, range));
  }
  async health() {
    return { status: "ok" as const, checkedAt: new Date().toISOString(), message: "DEMO" };
  }
}
