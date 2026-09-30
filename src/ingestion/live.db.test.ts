import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadLocalEnv } from "../../scripts/env.mjs";
import { assertTestDatabase, createSql, type Sql } from "@/persistence/db";
import { resetTestDatabase } from "@/persistence/testing";
import { FilePressProvider, FileRegistryElectionProvider, FileTranscriptProvider, REAL_DATA_DIR, UnconfiguredSocialProvider } from "@/providers/files";
import { LIVE_SOURCES } from "@/providers/files/sources";
import { ReplayLiveTranscriptProvider, type ReplaySpeed } from "@/providers/replay";
import { paginate, type LiveTranscriptProvider, type PageRequest, type RawRecord } from "@/providers/contracts";
import { DEFAULT_RETRY } from "@/providers/resilience";
import { ProviderUnavailable } from "@/providers/errors";
import { RuleBasedSpeechClassifier } from "@/ai/classifiers";
import { createControl, controlHistory, getControl, transition } from "@/control/debates";
import { liveTick, type LiveWorkerDeps } from "./live-worker";
import { reconcileSpool, runIngestion, type ProviderSet } from "./worker";
import { PostgresRepository } from "@/repository/postgres";
import { queryContext } from "@/repository/index";
import { buildProfile } from "@/providers/registry";
import type { LiveSegmentV1 } from "@/normalization/schemas/live";

loadLocalEnv();
const URL = process.env.DATABASE_URL_TEST;
const n = async (sql: Sql, q: string, p: unknown[] = []) => ((await sql.query(q, p)) as { n: number }[])[0].n;

/** Diretório temporário com um evento de TESTE de 120 falas (texto fictício, só no banco de teste). */
function makeLongEvent(): string {
  const root = mkdtempSync(path.join(tmpdir(), "monitora-live-"));
  const dir = path.join(root, "teste-longo");
  cpSync(path.join(REAL_DATA_DIR, "rj-governador-2026-09-29"), dir, { recursive: true });
  const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  m.debate.id = "teste-longo";
  m.debate.title = "Evento de teste (120 falas fictícias)";
  m.transcript.file = "t.json";
  const names: (string | null)[] = ["Eduardo Paes", "Douglas Ruas", "Anthony Garotinho", "William Siri", "André Marinho", null];
  const segments = Array.from({ length: 120 }, (_, i) => ({ speaker: names[i % names.length], block: "Bloco 1 · Temas sorteados", text: `Fala de teste número ${i + 1} sobre transporte e obras de saneamento no estado.` }));
  writeFileSync(path.join(dir, "t.json"), JSON.stringify({ segments }));
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(m));
  for (const f of readdirSync(dir)) if (f.startsWith("transcript.")) rmSync(path.join(dir, f));
  return root;
}

function replayProviders(root: string, session: { id: string; speed: ReplaySpeed; startedAt: string }, nowMs: number): ProviderSet & { transcript: ReplayLiveTranscriptProvider } {
  const transcript = new ReplayLiveTranscriptProvider(new FileTranscriptProvider(root), { id: session.id, title: `REPLAY · teste`, replayOf: "teste-longo", speed: session.speed, startedAt: session.startedAt }, () => nowMs);
  return { mode: "live", election: new FileRegistryElectionProvider(root), transcript, social: new UnconfiguredSocialProvider(), media: new FilePressProvider(root), classifier: (s) => new RuleBasedSpeechClassifier(() => [...s.candidates.values()]), aiSourceId: "src-ai-rules", sleep: async () => {} };
}

/** Provider "fixture live" no esquema genérico: segmentos sem horário, sem orador e um inválido. */
class FixtureLiveProvider implements LiveTranscriptProvider {
  readonly info = { id: "fixture-live", name: "Fixture live", kind: "transcript" as const, mode: "live" as const, capabilities: { realtime: true, historical: false, replay: false, diarization: false, blocks: false, live: true as const, timed: false, speakerIdentification: false, sourceMode: "live" as const }, config: { requiredEnv: [], configured: true }, rateLimit: { requestsPerWindow: null, windowSeconds: null, remaining: null, resetAt: null }, retry: DEFAULT_RETRY, sourceId: "src-fixture-live" };
  constructor(private readonly base: FileTranscriptProvider) {}
  async health() {
    return { status: "connected" as const, checkedAt: new Date().toISOString() };
  }
  async listEvents(page?: PageRequest) {
    const p = await this.base.listEvents();
    const o = p.items.find((r) => r.externalId === "teste-longo")!;
    return paginate([{ ...o, providerId: this.info.id, schema: "live.event/v1", externalId: "fixture-live-1", payload: { ...(o.payload as object), id: "fixture-live-1", title: "Fixture live", status: "live", source_mode: "live" } }], page);
  }
  async fetchSegments(_id: string, page?: PageRequest) {
    const mk = (seq: number, over: Partial<LiveSegmentV1>): RawRecord<LiveSegmentV1> => ({
      providerId: this.info.id,
      schema: "live.segment/v1",
      externalId: `fixture-live-1#${seq}`,
      sourceUrl: null,
      publishedAt: null,
      collectedAt: "2026-09-30T20:00:00.000Z",
      payload: { event_id: "fixture-live-1", seq, speaker: { label: null, name: null, confidence: "unknown", source: "none" }, text: `Trecho ${seq} sem horário e sem orador.`, start_offset_s: null, end_offset_s: null, timing_precision: "unknown", source_mode: "live", source_time: null, asr_confidence: null, block_label: null, ...over },
    });
    return paginate([mk(1, {}), mk(2, { start_offset_s: 10, end_offset_s: 5, timing_precision: "exact" }), mk(3, { speaker: { label: "Paes", name: "Eduardo Paes", confidence: "medium", source: "provider_label" }, asr_confidence: 0.91 })], page);
  }
}

describe.skipIf(!URL)("ingestão ao vivo / replay (branch de teste)", () => {
  let sql: Sql;
  let root: string;
  beforeAll(async () => {
    sql = createSql(URL, "DATABASE_URL_TEST");
    await assertTestDatabase(sql);
    await resetTestDatabase(sql);
    root = makeLongEvent();
    // origem precisa estar no banco para o replay (dataset de validação)
    await runIngestion(sql, { ...replayProviders(root, { id: "x", speed: 1, startedAt: new Date().toISOString() }, Date.now()), transcript: new FileTranscriptProvider(root) }, { datasetId: "t-origem", datasetKind: "validation", description: "origem", sources: LIVE_SOURCES });
  });
  afterAll(() => root && rmSync(root, { recursive: true, force: true }));

  it("migration 0003/0004: precisão 'synthetic', estados e regras de replay no banco", async () => {
    const cols = (await sql`select column_name from information_schema.columns where table_name = 'transcript_segment'`) as { column_name: string }[];
    for (const c of ["source_mode", "source_time", "collected_at", "ingested_at", "asr_confidence"]) expect(cols.map((x) => x.column_name)).toContain(c);
    await expect(sql`insert into debate_control (id, title, office_label, scheduled_start, source_name, provider_id, source_mode, status) values ('x', 'x', 'x', now(), 'x', 'x', 'replay', 'scheduled')`).rejects.toThrow();
    await expect(sql`insert into debate_control (id, title, office_label, scheduled_start, source_name, provider_id, source_mode, status) values ('y', 'y', 'y', now(), 'y', 'y', 'live', 'voando')`).rejects.toThrow();
    const hb = (await sql`select column_name from information_schema.columns where table_name = 'debate_control' and column_name = 'last_heartbeat_at'`) as unknown[];
    expect(hb).toHaveLength(1);
  });

  it("controle: scheduled → preparing → connecting → live; transição inválida recusada; histórico", async () => {
    await createControl(sql, { id: "teste-replay", title: "REPLAY · teste", officeLabel: "Governador", jurisdiction: "RJ", scheduledStart: new Date().toISOString(), sourceName: "replay", sourceUrl: null, providerId: "replay-transcript", sourceMode: "replay", replayOf: "teste-longo", replaySpeed: 10, candidates: [] });
    await expect(transition(sql, "teste-replay", "live")).rejects.toThrow(/inválida/);
    await transition(sql, "teste-replay", "preparing");
    await transition(sql, "teste-replay", "connecting");
    const c = await getControl(sql, "teste-replay");
    expect(c?.status).toBe("connecting");
    expect(c?.startedAt).toBeNull();
    expect((await controlHistory(sql, "teste-replay")).map((h) => h.to_status)).toEqual(["scheduled", "preparing", "connecting"]);
  });

  it("worker reiniciado: processa, cai, reinicia do checkpoint — sem duplicatas; termina sozinho", async () => {
    const deps = (now: number): LiveWorkerDeps => ({ providersFor: (c) => replayProviders(root, { id: c.id, speed: c.replaySpeed as ReplaySpeed, startedAt: c.startedAt! }, now), sources: LIVE_SOURCES });
    let c = (await getControl(sql, "teste-replay"))!;
    await liveTick(sql, c, deps(Date.now())); // connecting → live (started_at = agora)
    c = (await getControl(sql, "teste-replay"))!;
    expect(c.status).toBe("live");
    const t0 = Date.parse(c.startedAt!);
    const plan = replayProviders(root, { id: c.id, speed: 10, startedAt: c.startedAt! }, t0);
    // instante em que exatamente 100 falas foram liberadas
    const at100 = t0 + ((await (plan.transcript as unknown as { plan(): Promise<{ end: number }[]> }).plan())[99].end + 0.01) * 1000;
    const at50 = t0 + ((await (plan.transcript as unknown as { plan(): Promise<{ end: number }[]> }).plan())[49].end + 0.01) * 1000;
    await liveTick(sql, c, deps(at50));
    expect(await n(sql, "select count(*)::int n from transcript_segment where debate_id = 'teste-replay'")).toBe(50);
    // "kill": nova instância de provider/worker, estado só no banco
    await liveTick(sql, (await getControl(sql, "teste-replay"))!, deps(at100));
    await liveTick(sql, (await getControl(sql, "teste-replay"))!, deps(at100)); // repetição idempotente
    expect(await n(sql, "select count(*)::int n from transcript_segment where debate_id = 'teste-replay'")).toBe(100);
    expect(await n(sql, "select count(distinct seq)::int n from transcript_segment where debate_id = 'teste-replay'")).toBe(100);
    expect(await n(sql, "select count(*)::int n from raw_record r join source_record s on s.id = r.source_record_id where s.provider_id = 'replay-transcript' and s.schema = 'live.segment/v1'")).toBe(100);
    expect(await n(sql, "select count(*)::int n from analysis a join transcript_segment t on t.id = a.segment_id where t.debate_id = 'teste-replay'")).toBe(100);
    // fim do replay → controle 'finished' e debate 'ended'
    await liveTick(sql, (await getControl(sql, "teste-replay"))!, deps(t0 + 10_000_000));
    expect((await getControl(sql, "teste-replay"))?.status).toBe("finished");
    expect(((await sql`select status from debate where id = 'teste-replay'`) as { status: string }[])[0].status).toBe("ended");
    expect(await n(sql, "select count(*)::int n from transcript_segment where debate_id = 'teste-replay' and timestamp_precision = 'synthetic' and source_mode = 'replay'")).toBe(120);
    // replay nunca altera o evento de origem
    expect(await n(sql, "select count(*)::int n from transcript_segment where debate_id = 'teste-longo' and start_offset_s is not null")).toBe(0);
  });

  it("Repository ao vivo: consulta incremental, totais e latência (captura não se aplica a replay)", async () => {
    const repo = new PostgresRepository(sql, queryContext(buildProfile("live"), "pg-live-test"));
    const all = await repo.getLiveState("teste-replay", 0, 500);
    expect(all?.totals).toEqual({ segments: 120, analyzed: 120 });
    const inc = await repo.getLiveState("teste-replay", 110, 500);
    expect(inc?.segments.map((s) => s.seq)).toEqual([111, 112, 113, 114, 115, 116, 117, 118, 119, 120]);
    expect(inc?.segments.every((s) => s.timing?.precision === "synthetic" && s.capture?.sourceMode === "replay")).toBe(true);
    const tail = await repo.getLiveState("teste-replay", -1, 5);
    expect(tail?.segments.map((s) => s.seq)).toEqual([116, 117, 118, 119, 120]);
    // relógio simulado no futuro ⇒ intervalos negativos são descartados (nunca viram 0); latência real é medida no smoke
    expect(all?.latency.sample).toBe(20);
    expect(all?.latency.processingS === null || all!.latency.processingS >= 0).toBe(true);
    expect(all?.latency.captureS).toBeNull();
    expect(all?.latency.endToEndS).toBeNull();
    expect(all?.sourceMode).toBe("replay");
    expect(all?.connection).toBe("finished");
    // orador sem rótulo na fonte → desconhecido (nunca adivinhado)
    expect(all?.segments.filter((s) => s.speakerId === "orador-desconhecido").length).toBe(20);
  });

  it("provider indisponível: retry com backoff, execução 'failed' e erro persistidos", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const inner = new FileTranscriptProvider(root);
    inner.listEvents = async () => {
      calls++;
      throw new ProviderUnavailable("file-transcript");
    };
    const down = new ReplayLiveTranscriptProvider(inner, { id: "z", title: "z", replayOf: "teste-longo", speed: 1, startedAt: new Date().toISOString() });
    const p = { ...replayProviders(root, { id: "z", speed: 1, startedAt: new Date().toISOString() }, Date.now()), transcript: down, sleep: async (ms: number) => void sleeps.push(ms) };
    const res = await runIngestion(sql, p, { datasetId: "t-origem", datasetKind: "validation", description: "x", sources: LIVE_SOURCES, skipIdleRuns: true });
    expect(calls).toBe(DEFAULT_RETRY.maxAttempts);
    expect(sleeps.length).toBe(DEFAULT_RETRY.maxAttempts - 1);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0] * 1.2); // backoff exponencial (com jitter)
    const run = res.runs.find((r) => r.kind === "transcript:events")!;
    expect(run.status).toBe("failed");
    expect(await n(sql, "select count(*)::int n from ingestion_error where ingestion_run_id = $1", [run.runId])).toBe(1);
  });

  it("banco indisponível no meio da gravação: RAW vai para spool, nada se perde, sem duplicar", async () => {
    const spoolDir = mkdtempSync(path.join(tmpdir(), "monitora-spool-"));
    await createControl(sql, { id: "teste-replay-2", title: "REPLAY 2", officeLabel: "Governador", jurisdiction: "RJ", scheduledStart: new Date().toISOString(), sourceName: "replay", sourceUrl: null, providerId: "replay-transcript", sourceMode: "replay", replayOf: "teste-longo", replaySpeed: 10, candidates: [] });
    const startedAt = new Date(Date.now() - 20_000).toISOString();
    const prov = replayProviders(root, { id: "teste-replay-2", speed: 10, startedAt }, Date.now());
    // Banco "cai" ao gravar o RAW (último passo): domínio pode ter sido escrito, RAW não.
    const flaky = new Proxy(sql, {
      get(t, k) {
        if (k === "query") return (q: string, params?: unknown[]) => (/insert into raw_record/.test(q) ? Promise.reject(new Error("connection terminated")) : t.query(q, params));
        return Reflect.get(t, k);
      },
    }) as Sql;
    const job = { datasetId: "replay-teste", datasetKind: "validation" as const, description: "replay", sources: LIVE_SOURCES, skipIdleRuns: true, spoolDir };
    await expect(runIngestion(flaky, prov, job)).rejects.toThrow(/connection terminated/);
    const spooled = readdirSync(spoolDir);
    expect(spooled).toHaveLength(1);
    const lines = readFileSync(path.join(spoolDir, spooled[0]), "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    expect((await reconcileSpool(sql, spoolDir)).pending).toBeGreaterThan(0); // ainda não está no banco → spool mantido
    // Banco volta: mesmo provider (checkpoint não avançou) → tudo gravado, spool reconciliado e removido
    const res = await runIngestion(sql, prov, job);
    const segs = await n(sql, "select count(*)::int n from transcript_segment where debate_id = 'teste-replay-2'");
    expect(segs).toBeGreaterThan(0);
    expect(res.counts["raw_record.new"]).toBeGreaterThan(0);
    expect(existsSync(path.join(spoolDir, spooled[0]))).toBe(false);
    expect(await n(sql, "select count(*)::int n from raw_record r join source_record s on s.id = r.source_record_id where s.external_id like 'teste-replay-2#%'")).toBe(segs);
    rmSync(spoolDir, { recursive: true, force: true });
  });

  it("fonte ao vivo genérica: sem horário e sem orador → NULL/desconhecido; segmento inválido → ingestion_error sem derrubar o debate", async () => {
    const p = { ...replayProviders(root, { id: "w", speed: 1, startedAt: new Date().toISOString() }, Date.now()), transcript: new FixtureLiveProvider(new FileTranscriptProvider(root)) };
    const res = await runIngestion(sql, p, { datasetId: "t-fixture-live", datasetKind: "validation", description: "fixture live", sources: LIVE_SOURCES });
    const rows = (await sql`select ts.seq, ts.start_offset_s, ts.started_at, ts.timestamp_precision, ts.source_mode, ts.asr_confidence::float8 asr, sp.kind, sp.resolution_source, sp.resolution_confidence
      from transcript_segment ts join speaker sp on sp.id = ts.speaker_id where ts.debate_id = 'fixture-live-1' order by seq`) as Record<string, unknown>[];
    expect(rows.map((r) => r.seq)).toEqual([1, 3]);
    expect(rows[0]).toMatchObject({ start_offset_s: null, started_at: null, timestamp_precision: "unknown", source_mode: "live", kind: "unknown", resolution_confidence: "unknown" });
    expect(rows[1]).toMatchObject({ kind: "candidate", resolution_source: "provider_label", resolution_confidence: "medium", asr: 0.91 });
    const segRun = res.runs.find((r) => r.kind.startsWith("transcript:segments"))!;
    expect(segRun.status).toBe("partial");
    expect(await n(sql, "select count(*)::int n from ingestion_error where ingestion_run_id = $1 and external_id = 'fixture-live-1#2'", [segRun.runId])).toBe(1);
    const repo = new PostgresRepository(sql, queryContext(buildProfile("live"), "pg-live-test-2"));
    const st = await repo.getLiveState("fixture-live-1", 0);
    expect(st?.latency.captureS).toBeNull(); // sem horário na fonte → captura desconhecida, nunca 0
    expect(st?.connection).toBe("unknown"); // sem debate_control → não fingimos "online"
  });
});
