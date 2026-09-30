import type { Debate, DebateEvent, SocialPlatform, Source, TranscriptSegment } from "@/domain/types";
import { MODERATOR_SPEAKER_ID, isTimed } from "@/domain/types";
import type { SourceStatus } from "@/domain/provenance";
import { detectEvents } from "@/analytics/events";
import { geoCoverage } from "@/analytics/coverage";
import { transcriptQuality } from "@/analytics/timeline";
import type { DataStore } from "@/ingestion/store";
import { paginate, type PageRequest } from "@/providers/contracts";
import { cached } from "@/infrastructure/cache";
import type { ClockSpec } from "@/lib/clock";
import type { SourceWithIngestion } from "./types";
import { computeLatency, connectionStatus, type LiveState } from "@/domain/live";

export interface QueryContext {
  profileId: string;
  profileLabel: string;
  mode: "demo" | "live";
  clock: ClockSpec;
  sources: Source[];
  platforms: () => SocialPlatform[];
  socialProviderName: string;
  socialSourceId: string;
  providers: { id: string; name: string; kind: string; configured: boolean }[];
  persistence: "memory" | "postgres";
  /** Prefixo de cache (ex.: versão dos dados) para invalidar eventos derivados. */
  cacheKey: string;
}

const upTo = (to?: number) => (to === undefined ? Infinity : to);

/**
 * Consultas de domínio SÍNCRONAS sobre um DataStore (inteiro ou recorte por debate).
 * Compartilhadas pelos repositórios em memória e PostgreSQL — mesma lógica, mesmos analytics.
 */
export class StoreQueries {
  constructor(
    readonly store: DataStore,
    readonly ctx: QueryContext,
  ) {}

  // ───────── Debates / transcrição ─────────
  listDebates(): Debate[] {
    return [...this.store.debates.values()].sort((a, b) => (a.status === "live" ? -1 : b.status === "live" ? 1 : b.startsAt.localeCompare(a.startsAt)));
  }
  getDebate(id: string): Debate | null {
    return this.store.debates.get(id) ?? null;
  }
  getBlocks(debateId: string) {
    return this.store.blocks.get(debateId) ?? [];
  }
  /** Duração conhecida da transcrição (fim do último segmento). */
  transcriptEnd(debateId: string): number {
    return (this.store.segments.get(debateId) ?? []).filter(isTimed).reduce((m, s) => Math.max(m, s.endOffset), 0);
  }
  /** Janela de transcrição: segmentos concluídos com fim em [from, to]. */
  getTranscript(debateId: string, range: { from?: number; to?: number } = {}) {
    const all = this.store.segments.get(debateId) ?? [];
    const to = upTo(range.to);
    // Segmentos sem tempo só entram quando não há recorte temporal (não podem ser posicionados).
    const segments = all.filter((s) => (isTimed(s) ? s.endOffset <= to && (range.from === undefined || s.endOffset >= range.from) : to === Infinity && range.from === undefined));
    const cur = range.to === undefined ? null : all.filter(isTimed).find((s) => s.startOffset <= to && s.endOffset > to);
    return {
      segments,
      classifications: segments.map((s) => this.store.classifications.get(s.id)).filter((c) => !!c),
      cursor: segments.filter(isTimed).at(-1)?.endOffset ?? range.from ?? 0,
      complete: to >= this.transcriptEnd(debateId),
      inProgress: cur ? { speakerId: cur.speakerId, startOffset: cur.startOffset, blockId: cur.blockId } : null,
    };
  }
  /** Relatório de qualidade da transcrição de um debate (recebidos, oradores, tempos, confiança). */
  getTranscriptQuality(debateId: string) {
    const segs = this.store.segments.get(debateId) ?? [];
    const report = this.store.reports.find((r) => r.kind === `transcript:segments:${debateId}`) ?? null;
    return transcriptQuality(segs, segs.map((s) => this.store.classifications.get(s.id)).filter((c) => !!c), report);
  }
  /** Paginação por cursor (API pública). */
  getTranscriptPage(debateId: string, page: PageRequest & { to?: number }) {
    const segs = (this.store.segments.get(debateId) ?? []).filter((s) => (isTimed(s) ? s.endOffset <= upTo(page.to) : page.to === undefined));
    const p = paginate(segs, page, 200);
    return { ...p, items: p.items.map((s) => ({ segment: s, analysis: this.store.classifications.get(s.id) ?? null, record: s.provenance.record ? (this.store.sourceRecords.get(s.provenance.record.recordId) ?? null) : null })) };
  }
  getSegment(debateId: string, id: string): TranscriptSegment | null {
    return this.store.segments.get(debateId)?.find((s) => s.id === id) ?? null;
  }
  /** Eventos derivados (analytics) com dados disponíveis até `to` — cacheado. */
  getEvents(debateId: string, range: { to?: number } = {}): DebateEvent[] {
    const to = upTo(range.to);
    const key = `events:${this.ctx.cacheKey}:${this.ctx.profileId}:${debateId}:${Number.isFinite(to) ? Math.floor(to / 5) : "all"}`;
    return cached(key, 60_000, () => {
      const debate = this.getDebate(debateId);
      if (!debate) return [];
      const { segments, classifications } = this.getTranscript(debateId, { to: range.to });
      return detectEvents({
        debateId,
        segments,
        classifications,
        metrics: this.getSocialMetrics(debateId, { to: range.to }),
        candidates: this.getCandidates(),
        mode: this.ctx.mode,
        startsAt: debate.startsAt,
      });
    });
  }

  // ───────── Eleições (entidades) ─────────
  getCandidates() {
    return [...this.store.candidates.values()];
  }
  getParties() {
    return [...this.store.parties.values()];
  }
  getPartyIdentities() {
    return this.store.identities;
  }
  /** Resultados oficiais: nunca fabricados. Sem importação = "not_collected". */
  getElectoralResults() {
    return { status: "not_collected" as const, rows: [] as never[], reason: "Nenhuma importação oficial do TSE realizada." };
  }

  // ───────── Repercussão ─────────
  platforms() {
    return this.ctx.platforms();
  }
  getSocialMetrics(debateId: string, range: { to?: number } = {}) {
    const to = upTo(range.to);
    return (this.store.socialMetrics.get(debateId) ?? []).filter((m) => m.bucketStart + m.bucketSize <= to);
  }
  getSocialPosts(debateId: string, page: PageRequest & { from?: number; to?: number }) {
    const posts = (this.store.socialPosts.get(debateId) ?? []).filter((p) => p.offset <= upTo(page.to) && (page.from === undefined || p.offset >= page.from));
    return paginate(posts, page, 200);
  }
  getGeoMetrics(debateId: string, range: { to?: number } = {}) {
    const to = upTo(range.to);
    return (this.store.geoMetrics.get(debateId) ?? []).filter((m) => m.bucketStart + m.bucketSize <= to);
  }
  getGeoCoverage(debateId: string, range: { from?: number; to?: number } = {}) {
    const social = this.getSocialMetrics(debateId, { to: range.to });
    const geo = this.getGeoMetrics(debateId, { to: range.to });
    return geoCoverage(social, geo, { from: range.from ?? 0, to: range.to ?? Infinity, providers: [this.ctx.socialProviderName] });
  }
  getArticles(debateId?: string) {
    return this.store.articles.filter((a) => !debateId || a.debateId === debateId);
  }

  // ───────── Fontes / status ─────────
  getSources(): SourceWithIngestion[] {
    const reports = this.store.reports;
    return this.ctx.sources.map((s) => {
      const rs = reports.filter((r) => r.sourceId === s.id);
      const recordCount = [...this.store.sourceRecords.values()].filter((r) => r.sourceId === s.id).length + (s.providerKind === "ai" ? rs.reduce((a, r) => a + r.normalized, 0) : 0);
      const derived = s.id.startsWith(`${this.ctx.socialSourceId}-`) ? (this.store.socialMetrics.values().next().value ?? []).filter((m) => m.provenance.sourceId === s.id).length : 0;
      const geo = [...this.store.geoMetrics.values()].flat().filter((m) => m.provenance.sourceId === s.id).length;
      const failed = rs.some((r) => r.status === "failed");
      const status: SourceStatus = failed ? "offline" : rs.some((r) => r.status === "partial") && s.status === "connected" ? "degraded" : s.status;
      return {
        ...s,
        status,
        recordCount: recordCount || derived || geo || s.recordCount,
        collectedAt: rs.at(-1)?.finishedAt ?? s.collectedAt,
        ingestion: rs.length ? { fetched: rs.reduce((a, r) => a + r.fetched, 0), normalized: rs.reduce((a, r) => a + r.normalized, 0), rejected: rs.reduce((a, r) => a + r.rejected, 0), status: rs.some((r) => r.status === "failed") ? "failed" : rs.some((r) => r.status === "partial") ? "partial" : "ok" } : null,
      };
    });
  }
  getReports() {
    return this.store.reports;
  }
  getSourceRecord(id: string) {
    return this.store.sourceRecords.get(id) ?? null;
  }

  /** Estado global dos dados — consumido pelo indicador do shell. */
  getDataStatus() {
    const reports = this.store.reports;
    const failed = reports.filter((r) => r.status === "failed").length;
    const partial = reports.filter((r) => r.status === "partial").length;
    const overall: SourceStatus = this.ctx.mode === "demo" ? "demo" : failed ? "degraded" : "connected";
    return {
      profile: this.ctx.profileId,
      profileLabel: this.ctx.profileLabel,
      mode: this.ctx.mode,
      overall,
      replay: this.ctx.clock.kind === "replay",
      providers: this.ctx.providers,
      persistence: this.ctx.persistence,
      issues: { failed, partial, rejected: reports.reduce((a, r) => a + r.rejected, 0) },
      ingestedAt: this.store.ingestedAt,
    };
  }
  /** Estado ao vivo a partir do store (perfis em memória: sem controle de debate ⇒ conexão "unknown"). */
  getLiveState(debateId: string, afterSeq = 0, limit = 200): LiveState | null {
    const debate = this.getDebate(debateId);
    if (!debate) return null;
    const all = [...(this.store.segments.get(debateId) ?? [])].sort((a, b) => a.seq - b.seq);
    const segments = afterSeq < 0 ? all.slice(-limit) : all.filter((s) => s.seq > afterSeq).slice(0, limit);
    const recent = all.slice(-20);
    return {
      debateId,
      title: debate.title,
      sourceMode: all.find((s) => s.capture)?.capture?.sourceMode ?? null,
      control: null,
      connection: connectionStatus(null, Date.now()),
      totals: { segments: all.length, analyzed: all.filter((s) => this.store.classifications.has(s.id)).length },
      latency: computeLatency(recent.map((s) => ({ sourceMode: s.capture?.sourceMode ?? null, sourceEnd: null, collectedAt: s.capture?.collectedAt ?? null, ingestedAt: s.capture?.ingestedAt ?? null, processedAt: null }))),
      segments,
      classifications: segments.map((s) => this.store.classifications.get(s.id)).filter((c) => !!c),
      lastSeq: segments.at(-1)?.seq ?? Math.max(0, afterSeq),
      serverTime: new Date().toISOString(),
    };
  }
  moderatorId() {
    return MODERATOR_SPEAKER_ID;
  }
}
