import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { loadLocalEnv } from "../../scripts/env.mjs";
import { assertTestDatabase, createSql, type Sql } from "@/persistence/db";
import { resetTestDatabase } from "@/persistence/testing";
import { FileRegistryElectionProvider, FilePressProvider, FileTranscriptProvider, UnconfiguredSocialProvider } from "@/providers/files";
import { LIVE_SOURCES } from "@/providers/files/sources";
import { G1LiveEditorialProvider } from "@/providers/g1";
import { FIXTURE_POSTS, g1LivePage, type FixturePost } from "@/providers/g1/fixtures";
import { RuleBasedSpeechClassifier } from "@/ai/classifiers";
import { createControl, transition, getControl } from "@/control/debates";
import { listSources, upsertSource, setSourceEnabled } from "@/control/sources";
import { liveTick, type LiveWorkerDeps } from "./live-worker";
import { runIngestion, type ProviderSet } from "./worker";
import { PostgresRepository } from "@/repository/postgres";
import { queryContext } from "@/repository/index";
import { buildProfile } from "@/providers/registry";
import { paginate, type TranscriptProvider } from "@/providers/contracts";

loadLocalEnv();
const DB = process.env.DATABASE_URL_TEST;
const FIX = path.join(process.cwd(), "e2e/fixtures/g1/data");
const URL = "https://g1.globo.com/politica/eleicoes/2026/ao-vivo/debate-ficticio.ghtml";
const D = "debate-fixture-g1";
const n = async (sql: Sql, q: string, p: unknown[] = []) => ((await sql.query(q, p)) as { n: number }[])[0].n;

/** "Página do g1" controlada pelo teste. */
let page: FixturePost[] = [];
let status = 200;
const fetchFixture = (async () => new Response(status === 200 ? g1LivePage(page) : "indisponível", { status })) as unknown as typeof fetch;

function providers(sources: { sourceUrl: string }[]): ProviderSet {
  const files = new FileTranscriptProvider(FIX);
  const transcript: TranscriptProvider = { info: files.info, health: () => files.health(), listEvents: (p) => files.listEvents(p), fetchSegments: async (_id, p) => paginate([], p) };
  return {
    mode: "live",
    election: new FileRegistryElectionProvider(FIX),
    transcript,
    social: new UnconfiguredSocialProvider(),
    media: new FilePressProvider(FIX),
    classifier: (s) => new RuleBasedSpeechClassifier(() => [...s.candidates.values()]),
    aiSourceId: "src-ai-rules",
    sleep: async () => {},
    editorial: sources.map((s) => new G1LiveEditorialProvider({ debateId: D, sourceUrl: s.sourceUrl }, fetchFixture)),
  };
}
const job = { datasetId: "t-g1", datasetKind: "fixture" as const, description: "g1 fixture", sources: LIVE_SOURCES, skipIdleRuns: true };

describe.skipIf(!DB)("g1 · cobertura editorial persistida (branch de teste)", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = createSql(DB, "DATABASE_URL_TEST");
    await assertTestDatabase(sql);
    await resetTestDatabase(sql);
  });

  it("caso 1 · nova atualização: fato + RAW + proveniência + análise; nada vira transcrição", async () => {
    page = FIXTURE_POSTS.slice(0, 3);
    const res = await runIngestion(sql, providers([{ sourceUrl: URL }]), job);
    expect(await n(sql, "select count(*)::int n from editorial_event where debate_id = $1", [D])).toBe(3);
    expect(await n(sql, "select count(*)::int n from transcript_segment")).toBe(0);
    const row = ((await sql`select e.original_text, e.time_precision, e.parser_version, sr.provider_id, rr.payload->>'strategy' as strategy, ir.id as run
      from editorial_event e join source_record sr on sr.id = e.source_record_id join raw_record rr on rr.source_record_id = sr.id join ingestion_run ir on ir.id = rr.ingestion_run_id
      where e.external_id = ${`${D}#${FIXTURE_POSTS[1].id}`}`) as Record<string, unknown>[])[0];
    expect(row).toMatchObject({ original_text: FIXTURE_POSTS[1].text, time_precision: "exact", provider_id: "g1-live-editorial", strategy: "json-ld", parser_version: "g1-parse/1.0.0" });
    expect(res.runs.find((r) => r.kind === `media:editorial:${D}`)?.received).toBe(3);
    const an = ((await sql`select event_type, actor_candidate_id, target_candidate_id, topic from editorial_analysis a join editorial_event e on e.id = a.event_id where e.external_id = ${`${D}#${FIXTURE_POSTS[1].id}`}`) as Record<string, unknown>[])[0];
    expect(an).toMatchObject({ event_type: "pergunta", actor_candidate_id: "cand-helena-duarte", target_candidate_id: "cand-rafael-monteiro", topic: "seguranca" });
  });

  it("caso 2 · mesma atualização de novo ⇒ 0 duplicatas", async () => {
    const res = await runIngestion(sql, providers([{ sourceUrl: URL }]), job);
    expect(res.counts["raw_record.new"]).toBe(0);
    expect(await n(sql, "select count(*)::int n from editorial_event where debate_id = $1", [D])).toBe(3);
    expect(await n(sql, "select count(*)::int n from editorial_analysis")).toBe(3);
  });

  it("caso 3 · atualização alterada ⇒ nova versão; RAW e análise anteriores preservados", async () => {
    page = FIXTURE_POSTS.slice(0, 3).map((p, i) => (i === 2 ? { ...p, text: "Rafael Monteiro rebate e cita investimento em hospitais do SUS e em escolas.", modified: "2026-10-02T00:20:00.000Z" } : p));
    await runIngestion(sql, providers([{ sourceUrl: URL }]), job);
    const ext = `${D}#${FIXTURE_POSTS[2].id}`;
    expect(await n(sql, "select version as n from editorial_event where external_id = $1", [ext])).toBe(2);
    expect(await n(sql, "select count(*)::int n from raw_record r join source_record s on s.id = r.source_record_id where s.external_id = $1", [ext])).toBe(2);
    expect(await n(sql, "select count(*)::int n from editorial_analysis a join editorial_event e on e.id = a.event_id where e.external_id = $1", [ext])).toBe(2);
    expect(((await sql`select original_text from editorial_event where external_id = ${ext}`) as { original_text: string }[])[0].original_text).toContain("escolas");
  });

  it("conteúdo removido pela fonte ⇒ marcado (não apagado); saída da janela ≠ remoção", async () => {
    // Post 1 (o mais novo) some; post 0 é o mais antigo da janela.
    page = [FIXTURE_POSTS[0], FIXTURE_POSTS[2], FIXTURE_POSTS[3]];
    await runIngestion(sql, providers([{ sourceUrl: URL }]), job);
    expect(await n(sql, "select count(*)::int n from editorial_event where removed_at is not null")).toBe(1);
    // Janela avança: post 0 sai por ser antigo — NÃO é remoção
    page = [FIXTURE_POSTS[2], FIXTURE_POSTS[3], FIXTURE_POSTS[4]];
    await runIngestion(sql, providers([{ sourceUrl: URL }]), job);
    expect(await n(sql, "select count(*)::int n from editorial_event where removed_at is not null")).toBe(1);
    expect(await n(sql, "select count(*)::int n from editorial_event where external_id = $1 and removed_at is null", [`${D}#${FIXTURE_POSTS[0].id}`])).toBe(1);
  });

  it("caso 5 · g1 indisponível ⇒ run failed + erro; demais providers seguem", async () => {
    status = 503;
    const res = await runIngestion(sql, providers([{ sourceUrl: URL }]), job);
    status = 200;
    const run = res.runs.find((r) => r.kind === `media:editorial:${D}`)!;
    expect(run.status).toBe("failed");
    expect(await n(sql, "select count(*)::int n from ingestion_error where ingestion_run_id = $1", [run.runId])).toBe(1);
    expect(res.runs.filter((r) => r.kind.startsWith("election:")).every((r) => r.status !== "failed")).toBe(true);
  });

  it("caso 10 · admin + worker: fonte por dados, intervalo, reinício sem duplicar, estado da fonte", async () => {
    await createControl(sql, { id: D, title: "Debate fictício", officeLabel: "Presidente", jurisdiction: "BR", scheduledStart: new Date().toISOString(), sourceName: "g1", sourceUrl: null, providerId: "manifest-only", sourceMode: "live", replayOf: null, replaySpeed: null, candidates: [] });
    await upsertSource(sql, { debateId: D, providerId: "g1-live-editorial", sourceUrl: null, pollingIntervalMs: 15000, enabled: false });
    let st = (await listSources(sql, D))[0];
    expect(st).toMatchObject({ sourceUrl: null, records: null, rejected: null, lastCollectedAt: null }); // não coletado ≠ 0
    await expect(setSourceEnabled(sql, st.id, true)).rejects.toThrow(/pendente/);
    await expect(upsertSource(sql, { debateId: D, providerId: "g1-live-editorial", sourceUrl: "https://evil.example/ao-vivo/x", pollingIntervalMs: 15000, enabled: false })).rejects.toThrow(/allowlist/);
    await upsertSource(sql, { debateId: D, providerId: "g1-live-editorial", sourceUrl: URL, pollingIntervalMs: 15000, enabled: true });
    for (const s of ["preparing", "connecting"] as const) await transition(sql, D, s);
    page = FIXTURE_POSTS;
    const now = { t: Date.now() };
    const deps: LiveWorkerDeps = { providersFor: (_c, ed) => ({ ...providers(ed), transcript: providers(ed).transcript }), sources: LIVE_SOURCES, now: () => now.t };
    await liveTick(sql, (await getControl(sql, D))!, deps);
    const before = await n(sql, "select count(*)::int n from raw_record");
    // "reinício": novo worker, mesmo estado no banco; dentro do intervalo não coleta; depois coleta sem duplicar
    const skipped = await liveTick(sql, (await getControl(sql, D))!, deps);
    expect(skipped.skipped).toBe(true);
    now.t += 16_000;
    await liveTick(sql, (await getControl(sql, D))!, deps);
    expect(await n(sql, "select count(*)::int n from raw_record")).toBe(before);
    st = (await listSources(sql, D))[0];
    expect(st.records).toBe(5); // o post removido reapareceu na fonte ⇒ marcação desfeita
    expect(st.lastCollectedAt).not.toBeNull();
    expect(st.lastUpdateAt).toBe(FIXTURE_POSTS[4].published);
    expect(st.lastError).toBeNull();
  });

  it("Repository: /ao-vivo recebe a cobertura de forma incremental (inclui edições/remoções)", async () => {
    const repo = new PostgresRepository(sql, queryContext(buildProfile("live"), "pg-g1"));
    const all = await repo.getLiveState(D, 0, 50, 0);
    expect(all?.editorial.length).toBe(5);
    expect(all?.editorialTotal).toBe(5);
    const next = await repo.getLiveState(D, 0, 50, all!.editorialCursor);
    expect(next?.editorial).toEqual([]);
    const item = all!.editorial.find((i) => i.update.externalId === `${D}#${FIXTURE_POSTS[1].id}`)!;
    expect(item.update.removedAt).toBeNull(); // reapareceu
    expect(item.analysis?.eventType).toBe("pergunta");
    expect((await repo.getEditorialSources())[0].providerId).toBe("g1-live-editorial");
  });
});
