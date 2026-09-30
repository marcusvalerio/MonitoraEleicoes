import "server-only";
import type { Debate, DebateEvent, Source, TranscriptSegment } from "@/domain/types";
import { MODERATOR_SPEAKER_ID } from "@/domain/types";
import type { SourceStatus } from "@/domain/provenance";
import { detectEvents } from "@/analytics/events";
import { geoCoverage } from "@/analytics/coverage";
import { ingest } from "@/ingestion/pipeline";
import type { DataStore } from "@/ingestion/store";
import { getProfile, type ProviderProfile } from "@/providers/registry";
import { paginate, type PageRequest } from "@/providers/contracts";
import { cached } from "@/infrastructure/cache";

/**
 * REPOSITÓRIO DE DOMÍNIO — única porta de leitura para services/UI.
 * Consulta apenas o store normalizado; não conhece providers nem formatos de origem.
 */
let storePromise: Promise<DataStore> | null = null;

export function getStore(): Promise<DataStore> {
  if (!storePromise) {
    const p = getProfile();
    storePromise = ingest({ mode: p.mode, election: p.election, transcript: p.transcript, social: p.social, media: p.media, classifier: p.classifier, aiSourceId: p.aiSourceId });
  }
  return storePromise;
}

const upTo = (to?: number) => (to === undefined ? Infinity : to);

export class Repository {
  constructor(
    readonly store: DataStore,
    readonly profile: ProviderProfile,
  ) {}

  get mode() {
    return this.profile.mode;
  }
  get clock() {
    return this.profile.clock;
  }

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
    return this.store.segments.get(debateId)?.at(-1)?.endOffset ?? 0;
  }
  /** Janela de transcrição: segmentos concluídos com fim em [from, to]. */
  getTranscript(debateId: string, range: { from?: number; to?: number } = {}) {
    const all = this.store.segments.get(debateId) ?? [];
    const to = upTo(range.to);
    const segments = all.filter((s) => s.endOffset <= to && (range.from === undefined || s.endOffset >= range.from));
    const cur = range.to === undefined ? null : all.find((s) => s.startOffset <= to && s.endOffset > to);
    return {
      segments,
      classifications: segments.map((s) => this.store.classifications.get(s.id)).filter((c) => !!c),
      cursor: segments.at(-1)?.endOffset ?? range.from ?? 0,
      complete: to >= this.transcriptEnd(debateId),
      inProgress: cur ? { speakerId: cur.speakerId, startOffset: cur.startOffset, blockId: cur.blockId } : null,
    };
  }
  /** Paginação por cursor (API pública). */
  getTranscriptPage(debateId: string, page: PageRequest & { to?: number }) {
    const segs = (this.store.segments.get(debateId) ?? []).filter((s) => s.endOffset <= upTo(page.to));
    const p = paginate(segs, page, 200);
    return { ...p, items: p.items.map((s) => ({ segment: s, analysis: this.store.classifications.get(s.id) ?? null, record: s.provenance.record ? (this.store.sourceRecords.get(s.provenance.record.recordId) ?? null) : null })) };
  }
  getSegment(debateId: string, id: string): TranscriptSegment | null {
    return this.store.segments.get(debateId)?.find((s) => s.id === id) ?? null;
  }
  /** Eventos derivados (analytics) com dados disponíveis até `to` — cacheado. */
  getEvents(debateId: string, range: { to?: number } = {}): DebateEvent[] {
    const to = upTo(range.to);
    const key = `events:${this.profile.id}:${debateId}:${Number.isFinite(to) ? Math.floor(to / 5) : "all"}`;
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
        mode: this.mode,
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
    return this.profile.social.platforms();
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
    return geoCoverage(social, geo, { from: range.from ?? 0, to: range.to ?? Infinity, providers: [this.profile.social.info.name] });
  }
  getArticles(debateId?: string) {
    return this.store.articles.filter((a) => !debateId || a.debateId === debateId);
  }

  // ───────── Fontes / status ─────────
  getSources(): (Source & { ingestion: { fetched: number; normalized: number; rejected: number; status: string } | null })[] {
    const reports = this.store.reports;
    return this.profile.sources.map((s) => {
      const rs = reports.filter((r) => r.sourceId === s.id);
      const recordCount = [...this.store.sourceRecords.values()].filter((r) => r.sourceId === s.id).length + (s.providerKind === "ai" ? rs.reduce((a, r) => a + r.normalized, 0) : 0);
      const derived = s.id.startsWith(`${this.profile.social.info.sourceId}-`) ? (this.store.socialMetrics.values().next().value ?? []).filter((m) => m.provenance.sourceId === s.id).length : 0;
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
    const overall: SourceStatus = this.mode === "demo" ? "demo" : failed ? "degraded" : "connected";
    return {
      profile: this.profile.id,
      profileLabel: this.profile.label,
      mode: this.mode,
      overall,
      replay: this.clock.kind === "replay",
      providers: [this.profile.election, this.profile.transcript, this.profile.social, this.profile.media, this.profile.geo].map((p) => ({ id: p.info.id, name: p.info.name, kind: p.info.kind, configured: p.info.config.configured })),
      issues: { failed, partial, rejected: reports.reduce((a, r) => a + r.rejected, 0) },
      ingestedAt: this.store.ingestedAt,
    };
  }

  moderatorId() {
    return MODERATOR_SPEAKER_ID;
  }
}

export async function getRepository(): Promise<Repository> {
  return new Repository(await getStore(), getProfile());
}
