import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { SocialPlatform } from "@/domain/types";
import { detectFormat, parseTranscript } from "@/ingestion/formats/transcript";
import type { FileArticleV1, FileCandidateV1, FileCueV1, FileManifestV1, FilePartyV1 } from "@/normalization/schemas/file";
import { paginate, type ElectionProvider, type MediaProvider, type PageRequest, type RawRecord, type SocialProvider, type TranscriptProvider } from "../contracts";
import { InvalidResponse } from "../errors";
import { DEFAULT_RETRY } from "../resilience";
import { PLATFORMS } from "../platforms";

/**
 * PROVIDERS DE ARQUIVO — dados REAIS importados como arquivos (TXT/VTT/SRT/JSON/CSV)
 * quando a fonte não oferece acesso automatizado. Mesmo contrato dos demais providers.
 * Diretório: data/real/<evento>/{manifest.json, registry.json, <transcrição>}
 */
/** Diretório de dados reais. `MONITORA_DATA_DIR` (servidor/worker) só é usado por fixtures de teste/E2E. */
export const REAL_DATA_DIR = process.env.MONITORA_DATA_DIR ? path.resolve(process.env.MONITORA_DATA_DIR) : path.join(process.cwd(), "data", "real");

interface Manifest {
  debate: { id: string; title: string; broadcaster: string; jurisdiction: string; office: string; electionYear: number; round: 1 | 2; startsAt: string; endsAt: string | null; status: "scheduled" | "live" | "ended"; participants: string[]; blocks: string[] };
  /** Metadados de coleta do manifesto (quando não há transcrição). */
  collectedAt?: string;
  /** null = debate sem transcrição (ex.: só cobertura editorial ao vivo). */
  transcript: null | { file: string; timing: FileCueV1["timing_precision"]; speakerAttribution: FileCueV1["attribution"]; source: { name: string; url: string | null; publishedAt: string | null; collectedAt: string; documentSha256: string | null } };
  speakerMap: Record<string, string>;
}
interface Registry {
  election: { office: string };
  source: { collectedAt: string };
  parties: { acronym: string; name: string; number: number }[];
  candidates: { name: string; party: string; ballotNumber: number | null; tseId: string | null; aliases?: string[] }[];
  partyIdentity: { source: string; validFrom: string; colors: Record<string, string> };
}

function readJson<T>(file: string, providerId: string): T {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch (e) {
    throw new InvalidResponse(providerId, `arquivo ilegível: ${path.basename(file)} (${(e as Error).message})`);
  }
}

function eventDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(root, d.name, "manifest.json")))
    .map((d) => path.join(root, d.name));
}

const cfg = (root: string) => ({ requiredEnv: [], configured: existsSync(root), baseUrl: root });
const noLimit = { requestsPerWindow: null, windowSeconds: null, notes: "Arquivos locais." };

export class FileTranscriptProvider implements TranscriptProvider {
  readonly info;
  constructor(private readonly root = REAL_DATA_DIR) {
    this.info = {
      id: "file-transcript",
      name: "Transcrições importadas (arquivo)",
      kind: "transcript" as const,
      mode: "live" as const,
      capabilities: { realtime: false, historical: true, replay: true, diarization: false, blocks: true },
      config: cfg(root),
      rateLimit: noLimit,
      retry: { ...DEFAULT_RETRY, maxAttempts: 1 },
      sourceId: "src-file-transcript",
    };
  }
  async health() {
    return { status: eventDirs(this.root).length ? ("connected" as const) : ("not_configured" as const), checkedAt: new Date().toISOString() };
  }
  private manifests() {
    return eventDirs(this.root).map((dir) => ({ dir, m: readJson<Manifest>(path.join(dir, "manifest.json"), this.info.id) }));
  }
  async listEvents(page?: PageRequest) {
    const recs: RawRecord<FileManifestV1>[] = this.manifests().map(({ m }) => ({
      providerId: this.info.id,
      schema: "file.manifest/v1",
      externalId: m.debate.id,
      sourceUrl: null,
      publishedAt: m.debate.startsAt,
      collectedAt: m.transcript?.source.collectedAt ?? m.collectedAt ?? new Date(0).toISOString(),
      payload: {
        id: m.debate.id,
        title: m.debate.title,
        broadcaster: m.debate.broadcaster,
        jurisdiction: m.debate.jurisdiction,
        office: m.debate.office,
        election_year: m.debate.electionYear,
        round: m.debate.round,
        starts_at: m.debate.startsAt,
        ends_at: m.debate.endsAt,
        status: m.debate.status,
        participants: m.debate.participants,
        blocks: m.debate.blocks,
      },
    }));
    return paginate(recs, page);
  }
  async fetchSegments(eventId: string, page?: PageRequest) {
    const found = this.manifests().find(({ m }) => m.debate.id === eventId);
    if (!found) return paginate([], page);
    const { dir, m } = found;
    if (!m.transcript) return paginate([], page);
    const transcript = m.transcript;
    const file = path.join(dir, transcript.file);
    let content = readFileSync(file, "utf-8");
    const fmt = detectFormat(file);
    // JSON pode vir embrulhado em { segments: [...] } com metadados de extração
    if (fmt === "json") {
      const j = JSON.parse(content);
      content = JSON.stringify(Array.isArray(j) ? j : j.segments);
    }
    const cues = parseTranscript(content, fmt);
    const recs: RawRecord<FileCueV1>[] = cues.map((c) => ({
      providerId: this.info.id,
      schema: "file.cue/v1",
      externalId: `${m.debate.id}#${String(c.seq).padStart(4, "0")}`,
      sourceUrl: transcript.source.url,
      publishedAt: transcript.source.publishedAt,
      collectedAt: transcript.source.collectedAt,
      payload: {
        event_id: m.debate.id,
        seq: c.seq,
        start_ms: c.startMs,
        end_ms: c.endMs,
        speaker_label: c.speakerLabel,
        speaker_map_target: c.speakerLabel ? (m.speakerMap[c.speakerLabel] ?? null) : null,
        attribution: transcript.speakerAttribution,
        block_label: c.block,
        timing_precision: c.startMs !== null ? "exact" : transcript.timing,
        text: c.text,
      },
    }));
    return paginate(recs, page);
  }
}

export class FileRegistryElectionProvider implements ElectionProvider {
  readonly info;
  constructor(private readonly root = REAL_DATA_DIR) {
    this.info = {
      id: "file-registry",
      name: "Registro de candidaturas (arquivo)",
      kind: "election" as const,
      mode: "live" as const,
      capabilities: { historical: false, candidates: true, parties: true, partyIdentity: true, results: false, resultsGranularity: null },
      config: cfg(root),
      rateLimit: noLimit,
      retry: { ...DEFAULT_RETRY, maxAttempts: 1 },
      sourceId: "src-file-registry",
    };
  }
  async health() {
    return { status: "connected" as const, checkedAt: new Date().toISOString() };
  }
  private registries() {
    return eventDirs(this.root)
      .filter((d) => existsSync(path.join(d, "registry.json")))
      .map((d) => readJson<Registry>(path.join(d, "registry.json"), this.info.id));
  }
  async fetchParties(_q: object, page?: PageRequest) {
    const recs: RawRecord<FilePartyV1>[] = this.registries().flatMap((r) =>
      r.parties.map((p) => ({
        providerId: this.info.id,
        schema: "file.party/v1",
        externalId: `party:${p.acronym}`,
        sourceUrl: null,
        publishedAt: null,
        collectedAt: r.source.collectedAt,
        payload: { acronym: p.acronym, name: p.name, number: p.number, color: r.partyIdentity.colors[p.acronym] ?? null, color_source: r.partyIdentity.source, valid_from: r.partyIdentity.validFrom },
      })),
    );
    return paginate(recs, page);
  }
  async fetchCandidates(_q: object, page?: PageRequest) {
    const recs: RawRecord<FileCandidateV1>[] = this.registries().flatMap((r) =>
      r.candidates.map((c) => ({
        providerId: this.info.id,
        schema: "file.candidate/v1",
        externalId: `cand:${c.name}`,
        sourceUrl: null,
        publishedAt: null,
        collectedAt: r.source.collectedAt,
        payload: { name: c.name, party: c.party, ballot_number: c.ballotNumber, tse_id: c.tseId, aliases: c.aliases ?? [], office: r.election.office },
      })),
    );
    return paginate(recs, page);
  }
  async fetchPartyIdentities(_q: object, page?: PageRequest) {
    return paginate<RawRecord>([], page); // identidade embutida no registro de partido
  }
  async fetchResults(_q: object, page?: PageRequest) {
    return paginate<RawRecord>([], page);
  }
}

/** Imprensa: registra as matérias usadas como fonte de transcrição (proveniência). */
export class FilePressProvider implements MediaProvider {
  readonly info;
  constructor(private readonly root = REAL_DATA_DIR) {
    this.info = {
      id: "file-press",
      name: "Matérias de referência (arquivo)",
      kind: "media" as const,
      mode: "live" as const,
      capabilities: { articles: true, fullText: false, realtime: false },
      config: cfg(root),
      rateLimit: noLimit,
      retry: { ...DEFAULT_RETRY, maxAttempts: 1 },
      sourceId: "src-file-press",
    };
  }
  async health() {
    return { status: "connected" as const, checkedAt: new Date().toISOString() };
  }
  async fetchArticles(_q: object, page?: PageRequest) {
    const recs: RawRecord<FileArticleV1>[] = eventDirs(this.root).flatMap((dir) => {
      const m = readJson<Manifest>(path.join(dir, "manifest.json"), this.info.id);
      if (!m.transcript) return [];
      const s = m.transcript.source;
      return { providerId: this.info.id, schema: "file.article/v1", externalId: s.url ?? `${m.debate.id}:press`, sourceUrl: s.url, publishedAt: s.publishedAt, collectedAt: s.collectedAt, payload: { outlet_and_title: s.name, published_at: s.publishedAt ?? s.collectedAt, event_id: m.debate.id, document_sha256: s.documentSha256 } };
    });
    return paginate(recs, page);
  }
}

/** Repercussão social ainda não conectada ao perfil real. */
export class UnconfiguredSocialProvider implements SocialProvider {
  readonly info = {
    id: "social-not-configured",
    name: "Redes sociais (não configurado)",
    kind: "social" as const,
    mode: "live" as const,
    capabilities: { realtime: false, historical: false, posts: false, aggregatedCounts: false, engagement: false, candidates: false, topics: false, geolocation: "none" as const },
    config: { requiredEnv: ["YOUTUBE_API_KEY", "X_API_BEARER_TOKEN"], configured: false },
    rateLimit: noLimit,
    retry: DEFAULT_RETRY,
    sourceId: "src-social-not-configured",
  };
  async health() {
    return { status: "not_configured" as const, checkedAt: new Date().toISOString(), message: "Nenhuma credencial configurada" };
  }
  platforms(): SocialPlatform[] {
    return PLATFORMS;
  }
  async fetchPosts(_q: object, page?: PageRequest) {
    return paginate<RawRecord>([], page);
  }
  async fetchCounts(_q: object, page?: PageRequest) {
    return paginate<RawRecord>([], page);
  }
  async fetchRegionalCounts(_q: object, page?: PageRequest) {
    return paginate<RawRecord>([], page);
  }
}
