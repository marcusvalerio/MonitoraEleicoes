import type { LiveTranscriptCapabilities, LiveTranscriptProvider, PageRequest, RawRecord, TranscriptProvider } from "../contracts";
import { paginate } from "../contracts";
import { DEFAULT_RETRY } from "../resilience";
import type { FileCueV1, FileManifestV1 } from "@/normalization/schemas/file";
import type { LiveEventV1, LiveSegmentV1 } from "@/normalization/schemas/live";

/**
 * REPLAY TEMPORIZADO (NÃO é ao vivo).
 *
 * Reproduz uma transcrição já importada (e autorizada) como fluxo incremental, pelo MESMO
 * caminho de produção (provider → RAW → normalização → Neon → Repository → /ao-vivo).
 *
 * - Cria um debate PRÓPRIO (`id` da sessão) — o dataset original nunca é alterado.
 * - Horários são GERADOS (`timing_precision = "synthetic"`, `source_mode = "replay"`):
 *   duração de cada fala = palavras ÷ SYNTHETIC_WPS (ou a duração real, se a fonte tiver),
 *   comprimida pela velocidade (1×, 2×, 5×, 10×). Nunca viram fatos históricos.
 * - Liberação determinística a partir de `startedAt` (persistido no banco): reiniciar o worker
 *   não muda o que já foi liberado nem o payload (hash estável ⇒ sem duplicatas).
 */
export const SYNTHETIC_WPS = 2.5;
export const SYNTHETIC_GAP_S = 1;
export type ReplaySpeed = 1 | 2 | 5 | 10;

export interface ReplaySession {
  /** Id do debate de replay (ex.: "<original>--replay"). */
  id: string;
  title: string;
  replayOf: string;
  speed: ReplaySpeed;
  startedAt: string;
}

interface Scheduled {
  cue: RawRecord<FileCueV1>;
  start: number;
  end: number;
}

export class ReplayLiveTranscriptProvider implements LiveTranscriptProvider {
  readonly info;
  private schedule: Scheduled[] | null = null;
  constructor(
    private readonly inner: TranscriptProvider,
    private readonly session: ReplaySession,
    private readonly now: () => number = Date.now,
  ) {
    const capabilities: LiveTranscriptCapabilities = { realtime: true, historical: false, replay: true, diarization: false, blocks: true, live: true, timed: true, speakerIdentification: inner.info.capabilities.diarization, sourceMode: "replay" };
    this.info = {
      id: "replay-transcript",
      name: `Replay temporizado de ${inner.info.name}`,
      kind: "transcript" as const,
      mode: inner.info.mode,
      capabilities,
      config: { requiredEnv: [], configured: true },
      rateLimit: inner.info.rateLimit,
      retry: DEFAULT_RETRY,
      sourceId: "src-replay-transcript",
    };
  }

  async health() {
    return this.inner.health();
  }

  private async original(): Promise<RawRecord<FileManifestV1>> {
    for (let cursor: string | null = null, first = true; first || cursor; first = false) {
      const page = await this.inner.listEvents({ cursor, limit: 200 });
      const hit = page.items.find((r) => r.externalId === this.session.replayOf);
      if (hit) return hit as RawRecord<FileManifestV1>;
      cursor = page.nextCursor;
    }
    throw new Error(`replay: evento de origem não encontrado: ${this.session.replayOf}`);
  }

  private async plan(): Promise<Scheduled[]> {
    if (this.schedule) return this.schedule;
    const cues: RawRecord<FileCueV1>[] = [];
    for (let cursor: string | null = null, first = true; first || cursor; first = false) {
      const page = await this.inner.fetchSegments(this.session.replayOf, { cursor, limit: 500 });
      cues.push(...(page.items as RawRecord<FileCueV1>[]));
      cursor = page.nextCursor;
    }
    cues.sort((a, b) => a.payload.seq - b.payload.seq);
    let t = 0;
    this.schedule = cues.map((cue) => {
      const p = cue.payload;
      const dur = p.start_ms !== null && p.end_ms !== null ? (p.end_ms - p.start_ms) / 1000 : Math.max(2, p.text.split(/\s+/).filter(Boolean).length / SYNTHETIC_WPS);
      const start = t / this.session.speed;
      t += dur + SYNTHETIC_GAP_S;
      return { cue, start: round(start), end: round(start + dur / this.session.speed) };
    });
    return this.schedule;
  }

  private elapsed() {
    return (this.now() - Date.parse(this.session.startedAt)) / 1000;
  }

  /** Quantos segmentos já foram liberados e se o replay terminou. */
  async progress() {
    const plan = await this.plan();
    const released = plan.filter((s) => s.end <= this.elapsed()).length;
    return { released, total: plan.length, finished: released === plan.length };
  }

  async listEvents(page?: PageRequest) {
    const o = await this.original();
    const { finished } = await this.progress();
    const plan = await this.plan();
    const at = (s: number) => new Date(Date.parse(this.session.startedAt) + s * 1000).toISOString();
    const rec: RawRecord<LiveEventV1> = {
      providerId: this.info.id,
      schema: "live.event/v1",
      externalId: this.session.id,
      sourceUrl: o.sourceUrl,
      publishedAt: this.session.startedAt,
      collectedAt: this.session.startedAt,
      payload: { ...o.payload, id: this.session.id, title: this.session.title, starts_at: this.session.startedAt, ends_at: finished && plan.length ? at(plan[plan.length - 1].end) : null, status: finished ? "ended" : "live", source_mode: "replay" },
    };
    return paginate([rec], page);
  }

  async fetchSegments(eventExternalId: string, page?: PageRequest) {
    if (eventExternalId !== this.session.id) return paginate([], page);
    const plan = await this.plan();
    const now = this.elapsed();
    const base = Date.parse(this.session.startedAt);
    const recs: RawRecord<LiveSegmentV1>[] = plan
      .filter((s) => s.end <= now)
      .map(({ cue, start, end }) => {
        const p = cue.payload;
        const name = p.speaker_map_target ?? p.speaker_label;
        const releasedAt = new Date(base + end * 1000).toISOString();
        return {
          providerId: this.info.id,
          schema: "live.segment/v1",
          externalId: `${this.session.id}#${String(p.seq).padStart(5, "0")}`,
          sourceUrl: cue.sourceUrl,
          publishedAt: cue.publishedAt,
          // Determinístico: instante de liberação no relógio do replay (hash estável entre reinícios)
          collectedAt: releasedAt,
          payload: {
            event_id: this.session.id,
            seq: p.seq,
            speaker: {
              label: p.speaker_label,
              name: p.speaker_map_target,
              confidence: !name ? "unknown" : p.attribution === "press_attribution" ? "medium" : "high",
              source: !name ? "none" : p.attribution === "press_attribution" ? "press_attribution" : p.speaker_map_target ? "manual_map" : "provider_label",
            },
            text: p.text,
            start_offset_s: start,
            end_offset_s: end,
            timing_precision: "synthetic",
            source_mode: "replay",
            source_time: new Date(base + start * 1000).toISOString(),
            asr_confidence: null,
            block_label: p.block_label,
            replay_of: { provider_id: cue.providerId, external_id: cue.externalId, original_start_ms: p.start_ms },
          },
        };
      });
    return paginate(recs, page);
  }
}

const round = (x: number) => Math.round(x * 1000) / 1000;
