import { beforeAll, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../../scripts/env.mjs";
import { ingest, type IngestionSources } from "@/ingestion/pipeline";
import { FixtureElectionProvider, FixtureMediaProvider, FixtureSocialProvider, FixtureTranscriptProvider } from "@/providers/fixture";
import { FilePressProvider, FileRegistryElectionProvider, FileTranscriptProvider, UnconfiguredSocialProvider } from "@/providers/files";
import { FIXTURE_SOURCES } from "@/providers/fixture/sources";
import { LIVE_SOURCES } from "@/providers/files/sources";
import { RuleBasedSpeechClassifier } from "@/ai/classifiers";
import { ProviderUnavailable } from "@/providers/errors";
import { assertTestDatabase, createSql, type Sql } from "./db";
import { persistIngestion } from "./writer";
import { resetTestDatabase } from "./testing";
import { runIngestion, enqueueJob, claimJob, finishJob } from "@/ingestion/worker";
import { PostgresRepository } from "@/repository/postgres";
import { queryContext } from "@/repository/index";
import { buildProfile } from "@/providers/registry";

loadLocalEnv();
const URL = process.env.DATABASE_URL_TEST;
const rules = (s: import("@/ingestion/store").DataStore) => new RuleBasedSpeechClassifier(() => [...s.candidates.values()]);
const fixture: IngestionSources = { mode: "demo", election: new FixtureElectionProvider(), transcript: new FixtureTranscriptProvider(), social: new FixtureSocialProvider(), media: new FixtureMediaProvider(), classifier: rules, aiSourceId: "src-fixture-ai", sleep: async () => {} };
const real: IngestionSources = { mode: "live", election: new FileRegistryElectionProvider(), transcript: new FileTranscriptProvider(), social: new UnconfiguredSocialProvider(), media: new FilePressProvider(), classifier: rules, aiSourceId: "src-ai-rules", sleep: async () => {} };
const n = async (sql: Sql, q: string, p: unknown[] = []) => ((await sql.query(q, p)) as { n: number }[])[0].n;

describe.skipIf(!URL)("persistência PostgreSQL (branch de teste)", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = createSql(URL, "DATABASE_URL_TEST");
    await assertTestDatabase(sql); // nunca roda contra dev/produção
    await resetTestDatabase(sql);
  });

  it("RAW → normalização → persistência (fixture) com contagens corretas", async () => {
    const store = await ingest(fixture);
    const res = await persistIngestion(sql, store, { datasetId: "t-fixture", datasetKind: "fixture", description: "teste", sources: FIXTURE_SOURCES });
    expect(await n(sql, "select count(*)::int n from transcript_segment where dataset_id = 't-fixture'")).toBe(101);
    expect(await n(sql, "select count(*)::int n from analysis")).toBe(101);
    expect(await n(sql, "select count(*)::int n from raw_record")).toBe(store.raws.size);
    expect(res.runs.some((r) => r.status === "failed")).toBe(false);
    // toda rejeição (não só as exibidas no relatório) vira ingestion_error
    expect(await n(sql, "select count(*)::int n from ingestion_error")).toBe(store.rejections.length);
    expect(await n(sql, "select count(*)::int n from social_metric")).toBeGreaterThan(0);
    expect(await n(sql, "select count(*)::int n from geo_observation")).toBeGreaterThan(0);
  });

  it("proveniência completa: segmento → source_record → raw_record (payload) → ingestion_run", async () => {
    const rows = (await sql`select ts.id, sr.provider_id, sr.external_id, rr.payload, ir.status, s.id as source
      from transcript_segment ts join source_record sr on sr.id = ts.source_record_id join raw_record rr on rr.source_record_id = sr.id
      join ingestion_run ir on ir.id = rr.ingestion_run_id join source s on s.id = sr.source_id limit 5`) as Record<string, unknown>[];
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r.payload).toBeTruthy();
  });

  it("deduplicação: mesma ingestão 2× não duplica domínio nem RAW (conta 'unchanged')", async () => {
    const before = await n(sql, "select count(*)::int n from raw_record");
    const store = await ingest(fixture);
    const res = await persistIngestion(sql, store, { datasetId: "t-fixture", datasetKind: "fixture", description: "teste", sources: FIXTURE_SOURCES });
    expect(await n(sql, "select count(*)::int n from raw_record")).toBe(before);
    expect(await n(sql, "select count(*)::int n from transcript_segment")).toBe(101);
    expect(await n(sql, "select count(*)::int n from analysis")).toBe(101);
    expect(res.counts["raw_record.unchanged"]).toBe(store.raws.size);
    expect(res.runs.reduce((a, r) => a + r.unchanged, 0)).toBe(store.raws.size);
  });

  it("conteúdo alterado na origem → nova versão RAW, mesmo source_record", async () => {
    const store = await ingest(fixture);
    const [id, x] = [...store.raws.entries()].find(([, v]) => v.accepted)!;
    x.hash = "changed-hash";
    x.raw = { ...x.raw, payload: { ...(x.raw.payload as object), edited: true } };
    await persistIngestion(sql, store, { datasetId: "t-fixture", datasetKind: "fixture", description: "teste", sources: FIXTURE_SOURCES });
    expect(await n(sql, "select count(*)::int n from raw_record where source_record_id = $1", [id])).toBe(2);
    expect(await n(sql, "select count(*)::int n from source_record where id = $1", [id])).toBe(1);
  });

  it("análise versionada: nova versão do modelo convive com a anterior; leitura usa a mais recente", async () => {
    const store = await ingest(fixture);
    for (const c of store.classifications.values()) {
      c.model = { ...c.model, version: "9.9.9" };
      c.classifiedAt = "2100-01-01T00:00:00.000Z";
    }
    await persistIngestion(sql, store, { datasetId: "t-fixture", datasetKind: "fixture", description: "teste", sources: FIXTURE_SOURCES });
    expect(await n(sql, "select count(*)::int n from analysis")).toBe(202);
    expect(await n(sql, "select count(distinct model_version)::int n from analysis")).toBe(2);
    const prof = buildProfile("fixture");
    const repo = new PostgresRepository(sql, queryContext({ ...prof, persistence: "postgres" }, "pg-test"));
    const d = (await repo.listDebates()).find((x) => x.id === "fx-show-0001") ?? (await repo.listDebates())[0];
    const win = await repo.getTranscript(d.id);
    expect(win.segments.length).toBeGreaterThan(0);
    expect(win.classifications.every((c) => c.model.version === "9.9.9")).toBe(true);
  });

  it("ausência ≠ zero: timestamps desconhecidos ficam NULL; resultado eleitoral exige status", async () => {
    const store = await ingest(real);
    await persistIngestion(sql, store, { datasetId: "t-real", datasetKind: "validation", description: "teste RJ", sources: LIVE_SOURCES });
    const segs = (await sql`select start_offset_s, end_offset_s, started_at, timestamp_precision from transcript_segment where dataset_id = 't-real'`) as Record<string, unknown>[];
    expect(segs).toHaveLength(5);
    for (const s of segs) {
      expect(s.start_offset_s).toBeNull();
      expect(s.started_at).toBeNull();
      expect(s.timestamp_precision).not.toBe("exact");
    }
    await sql`insert into electoral_result (dataset_id, election_year, round, office_code, region_key, eligible_voters_status, turnout_status, abstention_status, valid_votes_status, blank_votes_status, null_votes_status)
              values ('t-real', 2026, 1, 3, 'RJ', 'not_collected', 'not_collected', 'not_collected', 'not_collected', 'not_collected', 'not_collected')`;
    await expect(sql`insert into electoral_result (dataset_id, election_year, round, office_code, region_key, eligible_voters, eligible_voters_status, turnout_status, abstention_status, valid_votes_status, blank_votes_status, null_votes_status)
              values ('t-real', 2026, 1, 3, 'SP', 0, 'not_collected', 'not_collected', 'not_collected', 'not_collected', 'not_collected', 'not_collected')`).rejects.toThrow();
  });

  it("repositório PostgreSQL devolve o debate real com oradores resolvidos e fontes do banco", async () => {
    const repo = new PostgresRepository(sql, queryContext(buildProfile("live"), "pg-test-live"));
    const d = await repo.getDebate("rj-governador-2026-09-29-globo");
    expect(d?.participantIds).toHaveLength(5);
    const win = await repo.getTranscript(d!.id);
    expect(win.segments.map((s) => s.speakerId).every((id) => d!.participantIds.includes(id))).toBe(true);
    expect(win.segments.every((s) => s.startOffset === null)).toBe(true);
    const sources = await repo.getSources();
    expect(sources.find((s) => s.id === LIVE_SOURCES[0].id)).toBeTruthy();
    expect((await repo.getDataStatus()).persistence).toBe("postgres");
  });

  it("falha de provider → execução 'failed' + ingestion_error; demais seguem (parcial)", async () => {
    const broken = new FilePressProvider();
    broken.fetchArticles = async () => {
      throw new ProviderUnavailable("file-press");
    };
    const store = await ingest({ ...real, media: broken });
    const res = await persistIngestion(sql, store, { datasetId: "t-real", datasetKind: "validation", description: "teste RJ", sources: LIVE_SOURCES });
    const run = res.runs.find((r) => r.kind.startsWith("media:"))!;
    expect(run.status).toBe("failed");
    expect(res.runs.filter((r) => r.kind.startsWith("transcript:")).every((r) => r.status === "completed")).toBe(true);
    expect(await n(sql, "select count(*)::int n from ingestion_error where ingestion_run_id = $1", [run.runId])).toBeGreaterThan(0);
  });

  it("worker incremental: 2ª execução usa checkpoint e não reclassifica; fila reserva job uma vez", async () => {
    const r1 = await runIngestion(sql, real, { datasetId: "t-real", datasetKind: "validation", description: "RJ", sources: LIVE_SOURCES });
    const r2 = await runIngestion(sql, real, { datasetId: "t-real", datasetKind: "validation", description: "RJ", sources: LIVE_SOURCES });
    expect(r1.counts["analysis.new"] ?? 0).toBe(0); // já persistidas nos testes anteriores
    expect(r2.counts["raw_record.new"]).toBe(0);
    expect(r2.runs.find((r) => r.kind.startsWith("transcript:segments"))!.received).toBe(0);
    const id = await enqueueJob(sql, { profile: "live", datasetId: "t-real", datasetKind: "validation" });
    const a = await claimJob(sql);
    expect(a?.id).toBe(id);
    expect(await claimJob(sql)).toBeNull();
    await finishJob(sql, id, { status: "completed" });
  });

  it("dataset não muda de tipo (validation não vira demo)", async () => {
    const store = await ingest(real);
    await expect(persistIngestion(sql, store, { datasetId: "t-real", datasetKind: "demo", description: "x", sources: LIVE_SOURCES })).rejects.toThrow(/já existe/);
  });
});
