import type { DebateBlock, Debate, TranscriptSegment } from "@/domain/types";
import { isTimed } from "@/domain/types";
import { identityAt, NEUTRAL_ENTITY_COLOR } from "@/domain/identity";
import { payloadHash, type SourceRecord } from "@/domain/provenance";
import { confidenceLevel } from "@/domain/quality";
import { computeSegmentRelevance, toSpeechClassification, validateClassifierOutput, type SpeechClassifier } from "@/ai/classifier";
import { NormalizationContext } from "@/normalization/context";
import { normalize, type Normalized } from "@/normalization/normalizers";
import { collectAll, type ElectionProvider, type MediaProvider, type RawRecord, type SocialProvider, type TranscriptProvider } from "@/providers/contracts";
import { ProviderError } from "@/providers/errors";
import { withRetry } from "@/providers/resilience";
import { DataStore, type IngestionReport } from "./store";

export interface IngestionSources {
  mode: "demo" | "live";
  election: ElectionProvider;
  transcript: TranscriptProvider;
  social: SocialProvider;
  media: MediaProvider;
  classifier: (store: DataStore) => SpeechClassifier;
  /** Fonte lógica das classificações de IA. */
  aiSourceId: string;
  /** Para testes: não esperar entre retries. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * PIPELINE:  provider → RawRecord → SourceRecord → normalização → domínio (store) → IA
 * Falhas de um provider não derrubam os demais (dados parciais são sinalizados).
 */
export async function ingest(src: IngestionSources): Promise<DataStore> {
  const store = new DataStore();
  const ctx = new NormalizationContext(src.mode, store.ingestedAt);

  async function run(
    provider: { info: { id: string; sourceId: string; kind: string; retry: import("@/providers/resilience").RetryPolicy } },
    label: string,
    fetchAll: () => Promise<RawRecord[]>,
    accept: (n: Normalized, r: RawRecord) => void,
  ) {
    const report: IngestionReport = { providerId: provider.info.id, sourceId: provider.info.sourceId, kind: `${provider.info.kind}:${label}`, status: "ok", fetched: 0, normalized: 0, rejected: 0, issues: [], startedAt: new Date().toISOString(), finishedAt: "" };
    try {
      const raws = await withRetry(() => fetchAll(), provider.info.retry, { sleep: src.sleep });
      report.fetched = raws.length;
      for (const r of raws) {
        try {
          const n = normalize(r, ctx, provider.info.sourceId);
          const sr: SourceRecord = {
            id: `${r.providerId}:${r.externalId}`,
            sourceId: provider.info.sourceId,
            providerId: r.providerId,
            externalId: r.externalId,
            schema: r.schema,
            sourceUrl: r.sourceUrl,
            publishedAt: r.publishedAt,
            collectedAt: r.collectedAt,
            ingestedAt: store.ingestedAt,
            payloadHash: payloadHash(r.payload),
          };
          store.sourceRecords.set(sr.id, sr);
          accept(n, r);
          report.normalized++;
        } catch (e) {
          report.rejected++;
          if (report.issues.length < 25) {
            const pe = e instanceof ProviderError ? e : null;
            report.issues.push({ externalId: r.externalId, code: pe?.code ?? "normalization_error", message: (e as Error).message, field: (pe as { field?: string | null } | null)?.field ?? null });
          }
        }
      }
      if (report.rejected) report.status = "partial";
    } catch (e) {
      report.status = "failed";
      report.message = e instanceof Error ? e.message : String(e);
    }
    report.finishedAt = new Date().toISOString();
    store.reports.push(report);
  }

  // 1 · Eleições: partidos → candidatos → identidade visual
  const pageOf = <T,>(f: (p: { cursor?: string | null; limit?: number }) => Promise<import("@/providers/contracts").Page<T>>) => () => collectAll(f, 200);
  await run(src.election, "parties", pageOf((p) => src.election.fetchParties({}, p)), (n) => {
    if (n.type !== "party") return;
    store.parties.set(n.value.id, n.value);
    ctx.parties.set(n.value.id, n.value);
    if (n.identity) store.identities.push(n.identity);
  });
  if (src.election.info.capabilities.partyIdentity) {
    await run(src.election, "identities", pageOf((p) => src.election.fetchPartyIdentities({}, p)), (n) => {
      if (n.type === "identity") store.identities.push(n.value);
    });
  }
  store.identities = dedupeIdentities(store.identities);
  await run(src.election, "candidates", pageOf((p) => src.election.fetchCandidates({}, p)), (n) => {
    if (n.type !== "candidate") return;
    const color = identityAt(store.identities, n.value.partyId, store.ingestedAt)?.color ?? NEUTRAL_ENTITY_COLOR;
    const c = { ...n.value, swatch: color };
    store.candidates.set(c.id, c);
    ctx.candidates.set(c.id, c);
  });

  // 2 · Transcrição: eventos → segmentos
  const eventExt = new Map<string, string>(); // debateId → externalId
  await run(src.transcript, "events", pageOf((p) => src.transcript.listEvents(p)), (n, r) => {
    if (n.type !== "debate") return;
    store.debates.set(n.value.id, n.value);
    ctx.events.set(r.externalId, { debateId: n.value.id, startsAt: n.value.startsAt, blocks: new Map(n.blocks.map((b) => [b.label, b.id])) });
    eventExt.set(n.value.id, r.externalId);
    store.blocks.set(n.value.id, n.blocks.map((b) => ({ ...b, startOffset: 0, endOffset: 0 })));
  });
  for (const [debateId, ext] of eventExt) {
    await run(src.transcript, `segments:${debateId}`, pageOf((p) => src.transcript.fetchSegments(ext, p)), (n) => {
      if (n.type === "segment") store.push(store.segments, n.value.debateId, n.value);
    });
    // Ordem: tempo quando conhecido; caso contrário, sequência declarada pela fonte.
    const segs = (store.segments.get(debateId) ?? []).sort((a, b) => (isTimed(a) && isTimed(b) ? a.startOffset - b.startOffset : a.seq - b.seq));
    store.segments.set(debateId, segs);
    store.blocks.set(debateId, computeBlocks(ctx, ext, store.blocks.get(debateId) ?? [], segs));
  }

  // 3 · Repercussão: contagens, publicações, contagens regionais
  for (const [debateId, ext] of eventExt) {
    const q = { eventExternalId: ext };
    if (src.social.info.capabilities.aggregatedCounts)
      await run(src.social, `counts:${debateId}`, pageOf((p) => src.social.fetchCounts(q, p)), (n) => n.type === "social_metric" && store.push(store.socialMetrics, debateId, n.value));
    if (src.social.info.capabilities.posts)
      await run(src.social, `posts:${debateId}`, pageOf((p) => src.social.fetchPosts(q, p)), (n) => {
        if (n.type !== "social_post") return;
        store.push(store.socialPosts, debateId, n.value);
        for (const cid of n.value.mentionsCandidateIds) {
          store.candidateMentions.push({ postId: n.value.id, candidateId: cid, method: "exact_name", confidence: "high" });
          const party = store.candidates.get(cid)?.partyId;
          if (party) store.partyMentions.push({ postId: n.value.id, partyId: party, method: "via_candidate", confidence: "medium" });
        }
        if (n.value.topic) store.topicMentions.push({ postId: n.value.id, topic: n.value.topic, confidence: "medium", model: null });
      });
    if (src.social.info.capabilities.geolocation !== "none")
      await run(src.social, `regional:${debateId}`, pageOf((p) => src.social.fetchRegionalCounts(q, p)), (n) => n.type === "geo_metric" && store.push(store.geoMetrics, debateId, n.value));
  }

  // 4 · Imprensa
  if (src.media.info.capabilities.articles) {
    await run(src.media, "articles", pageOf((p) => src.media.fetchArticles({}, p)), (n) => n.type === "article" && store.articles.push(n.value));
  }

  // 5 · IA: classificação das falas (RAW preservado; análise separada e versionada)
  await classifyAll(store, src.classifier(store), src.aiSourceId, src);
  return store;
}

function dedupeIdentities(list: import("@/domain/identity").PartyVisualIdentity[]) {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.partyId}|${i.validFrom}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function computeBlocks(ctx: NormalizationContext, ext: string, declared: DebateBlock[], segs: TranscriptSegment[]): DebateBlock[] {
  const ev = ctx.events.get(ext);
  const labels = new Map<string, string>([...declared.map((b) => [b.id, b.label] as [string, string]), ...[...(ev?.blocks ?? new Map()).entries()].map(([label, id]) => [id, label] as [string, string])]);
  const out: DebateBlock[] = [];
  for (const [id, label] of labels) {
    const s = segs.filter((x) => x.blockId === id);
    const t = s.filter(isTimed);
    // Limites do bloco só quando há tempo conhecido; senão ficam nulos (não inventados).
    if (s.length) out.push({ id, label, startOffset: t.length ? t[0].startOffset : null, endOffset: t.length ? t[t.length - 1].endOffset : null });
  }
  return out.sort((a, b) => (a.startOffset ?? Infinity) - (b.startOffset ?? Infinity));
}

async function classifyAll(store: DataStore, classifier: SpeechClassifier, sourceId: string, src: { mode: "demo" | "live" }) {
  const report: IngestionReport = { providerId: `ai:${classifier.model.model}`, sourceId, kind: "ai:classification", status: "ok", fetched: 0, normalized: 0, rejected: 0, issues: [], startedAt: new Date().toISOString(), finishedAt: "" };
  for (const [debateId, segs] of store.segments) {
    const debate = store.debates.get(debateId) as Debate;
    const metrics = store.socialMetrics.get(debateId) ?? [];
    const vol = (from: number, to: number) => {
      let s = 0;
      for (const m of metrics) if (m.bucketStart >= from && m.bucketStart < to) s += m.posts;
      return s / Math.max(1, (to - from) / 60);
    };
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      report.fetched++;
      try {
        const out = await classifier.classify(seg, { candidates: [...store.candidates.values()], triggersReply: false, socialLift: 0 });
        if (!validateClassifierOutput(out)) throw new Error("saída do classificador inválida");
        // Variação social só é mensurável com tempo conhecido e métricas disponíveis.
        const before = isTimed(seg) ? vol(seg.startOffset - 180, seg.startOffset) : 0;
        const after = isTimed(seg) ? vol(seg.endOffset, seg.endOffset + 180) : 0;
        const socialLift = before > 0 ? Math.max(0, Math.min(1, after / before - 1)) : 0;
        const next = segs[i + 1];
        const triggersReply = !!next && !!seg.addressedToId && next.speakerId === seg.addressedToId;
        const rel = computeSegmentRelevance(seg, out.speech_type, out.mentions, { triggersReply, socialLift });
        const classifiedAt = isTimed(seg) && src.mode === "demo" ? new Date(Date.parse(debate.startsAt) + (seg.endOffset + 5) * 1000).toISOString() : store.ingestedAt;
        const c = toSpeechClassification(seg, { ...out, relevance: rel.band }, classifier.model, {
          classifiedAt,
          factCheck: out.fact_check_status ?? (out.fact_check_required ? "verificar" : "nao_necessario"),
          relevanceScore: rel.score,
          relevanceFeatures: rel.features,
          sourceId,
        });
        store.classifications.set(seg.id, { ...c, confidenceLevel: confidenceLevel(c.confidence) });
        report.normalized++;
      } catch (e) {
        report.rejected++;
        if (report.issues.length < 25) report.issues.push({ externalId: seg.id, code: "classification_error", message: (e as Error).message, field: null });
      }
    }
  }
  if (report.rejected) report.status = "partial";
  report.finishedAt = new Date().toISOString();
  store.reports.push(report);
}
