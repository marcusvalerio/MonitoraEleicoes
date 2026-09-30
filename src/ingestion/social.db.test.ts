import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadLocalEnv } from "../../scripts/env.mjs";
import { assertTestDatabase, createSql, type Sql } from "@/persistence/db";
import { resetTestDatabase } from "@/persistence/testing";
import { FileRegistryElectionProvider, FilePressProvider, FileTranscriptProvider, UnconfiguredSocialProvider } from "@/providers/files";
import { LIVE_SOURCES } from "@/providers/files/sources";
import { RuleBasedSpeechClassifier } from "@/ai/classifiers";
import { YouTubeProvider } from "@/providers/youtube";
import { FX_YT_VIDEOS, fakeYouTube } from "@/providers/youtube/fixtures";
import { PLATFORM_MATRIX, UnavailableSocialProvider } from "@/providers/social/catalog";
import { importCandidacies } from "@/elections/tse/importer";
import { FX_CANDIDACIES, candCsv } from "@/elections/tse/fixtures";
import { listMonitors, listSocialSources, setSocialSourceEnabled, syncSocialSources, upsertMonitor } from "@/control/social";
import { socialTick, type SocialWorkerDeps } from "./social-worker";
import { byUf, candidateTable, coverage, feed, funnel, globalSearch, kpis, series } from "@/analytics/social-listening";
import { DEFAULT_FILTER, type FilterSpec } from "@/domain/filters";

loadLocalEnv();
const DB = process.env.DATABASE_URL_TEST;
const n = async (sql: Sql, q: string, p: unknown[] = []) => ((await sql.query(q, p)) as { n: number }[])[0].n;
const EMPTY = mkdtempSync(path.join(tmpdir(), "monitora-empty-"));
const NOW = Date.parse("2026-10-02T01:00:00Z");
const F = (o: Partial<FilterSpec> = {}): FilterSpec => ({ ...DEFAULT_FILTER, period: { preset: "custom", from: "2026-10-02T00:00:00.000Z", to: "2026-10-02T02:00:00.000Z" }, ...o });

describe.skipIf(!DB)("social listening (fixture YouTube → Neon → analytics)", () => {
  let sql: Sql;
  let deps: (fetchImpl: typeof fetch, now: number) => SocialWorkerDeps;
  let helena = 0;
  let rafael = 0;
  beforeAll(async () => {
    sql = createSql(DB, "DATABASE_URL_TEST");
    await assertTestDatabase(sql);
    await resetTestDatabase(sql);
    // candidaturas fictícias 2026 (Helena) + uma fictícia extra para Rafael Monteiro
    await importCandidacies(sql, 2026, candCsv([...FX_CANDIDACIES.filter((c) => c.year === 2026), { year: 2026, uf: "BR", office: 1, sq: "280000000003", number: 93, name: "RAFAEL MONTEIRO", ballot: "RAFAEL MONTEIRO", party: [92, "PFB", "PARTIDO FICTÍCIO B"], title: "000000000494", cpf: "-4", status: "#NULO" }]), { datasetId: "t-tse", datasetKind: "fixture", hmacKey: "k" });
    helena = ((await sql`select id from candidacy where sq_candidato = 280000000001`) as { id: number }[])[0].id;
    rafael = ((await sql`select id from candidacy where sq_candidato = 280000000003`) as { id: number }[])[0].id;
    deps = (fetchImpl, now) => ({
      providers: [new YouTubeProvider({ apiKey: "fake", hashKey: "k" }, fetchImpl, () => now), ...PLATFORM_MATRIX.filter((e) => e.platform !== "youtube").map((e) => new UnavailableSocialProvider(e))],
      base: { mode: "live", election: new FileRegistryElectionProvider(EMPTY), transcript: new FileTranscriptProvider(EMPTY), social: new UnconfiguredSocialProvider(), media: new FilePressProvider(EMPTY), classifier: (s) => new RuleBasedSpeechClassifier(() => [...s.candidates.values()]), aiSourceId: "src-ai-rules", sleep: async () => {} },
      sources: LIVE_SOURCES,
      now: () => now,
      datasetKind: "fixture",
    });
    await syncSocialSources(sql, deps(fakeYouTube(FX_YT_VIDEOS).fetch, NOW).providers);
  });

  it("fontes: estado honesto por plataforma; sem acesso não pode ser ativada", async () => {
    const s = await listSocialSources(sql);
    expect(s.find((x) => x.id === "youtube")?.accessStatus).toBe("configured");
    expect(s.find((x) => x.id === "tiktok")?.accessStatus).toBe("unsupported");
    await expect(setSocialSourceEnabled(sql, "x", true)).rejects.toThrow(/sem acesso/);
    await setSocialSourceEnabled(sql, "youtube", true);
  });

  it("monitor → worker → YouTube → Neon: conteúdos, análise, entidades, janelas (inclui fonte sem acesso)", async () => {
    await upsertMonitor(sql, { id: "mon-debate", name: "Debate presidencial", electionYear: 2026, officeIds: [1], candidacyIds: [helena, rafael], parties: ["PFA"], ufs: [], terms: ["debate presidencial", "Helena Duarte"], platforms: ["youtube", "x"], intervalS: 3600, status: "active", debateId: null });
    const [m] = await listMonitors(sql, "active");
    await socialTick(sql, m, deps(fakeYouTube(FX_YT_VIDEOS).fetch, NOW));
    expect(await n(sql, "select count(*)::int n from social_record")).toBe(6);
    expect(await n(sql, "select count(*)::int n from social_analysis")).toBe(6);
    expect(await n(sql, "select count(*)::int n from social_record where author_display_name is not null and content_type in ('comment','reply')")).toBe(0);
    const w = (await sql`select source_id, status, items from social_collection_window order by source_id`) as Record<string, unknown>[];
    expect(w).toEqual([{ source_id: "x", status: "requires_authorization", items: null }, { source_id: "youtube", status: "collected", items: 6 }]);
    expect(((await sql`select access_status from social_source where id = 'youtube'`) as { access_status: string }[])[0].access_status).toBe("active");
    const prov = (await sql`select sr.provider_id, rr.payload->>'video_id' as vid from social_record s join source_record sr on sr.id = s.source_record_id join raw_record rr on rr.source_record_id = sr.id where s.id = 'youtube:video:vid00000001'`) as Record<string, unknown>[];
    expect(prov[0]).toEqual({ provider_id: "youtube-data-api", vid: "vid00000001" });
  });

  it("deduplicação: nova execução não duplica; métricas atualizadas sem nova versão do vídeo", async () => {
    const videos = FX_YT_VIDEOS.map((v) => (v.id === "vid00000001" ? { ...v, publishedAt: "2026-10-02T00:10:00Z", stats: { viewCount: "3000", likeCount: "90", commentCount: "3" } } : v));
    // força a mesma janela para testar dedup (monitor fora do intervalo ⇒ ajusta last_run)
    await sql`update social_monitor set last_run_at = null`;
    await sql`delete from social_collection_window`;
    const [m] = await listMonitors(sql, "active");
    await socialTick(sql, m, deps(fakeYouTube(videos).fetch, NOW + 60_000));
    expect(await n(sql, "select count(*)::int n from social_record")).toBe(6);
    expect(await n(sql, "select version as n from social_record where id = 'youtube:video:vid00000001'")).toBe(1);
    expect(((await sql`select metrics from social_record where id = 'youtube:video:vid00000001'`) as { metrics: Record<string, number> }[])[0].metrics).toEqual({ views: 3000, likes: 90, comments: 3 });
    expect(((await sql`select metrics from social_record where id = 'youtube:video:vid00000002'`) as { metrics: Record<string, number> }[])[0].metrics).toEqual({ views: 5400, comments: 0 });
  });

  it("KPIs, funil e cobertura com dados reais do período; 'não coletado' ≠ 0", async () => {
    const k = await kpis(sql, F(), NOW);
    expect(k).toMatchObject({ collected: true, contents: 6, comments: 4, posts: 2 });
    expect(k.engagement.likes).not.toBeNull();
    expect(k.coverage.find((c) => c.platform === "x")?.periodStatus).toBe("unavailable");
    const fn = await funnel(sql, F(), NOW);
    expect(fn[0]).toMatchObject({ key: "collected", count: 6 });
    expect(fn.map((x) => x.count)).toEqual([...fn.map((x) => x.count)].sort((a, b) => b - a).length ? fn.map((x) => x.count) : []);
    const empty = await kpis(sql, F({ period: { preset: "custom", from: "2026-09-01T00:00:00.000Z", to: "2026-09-02T00:00:00.000Z" } }), NOW);
    expect(empty).toMatchObject({ collected: false, contents: null, mentions: null });
    const cov = await coverage(sql, F({ period: { preset: "custom", from: "2026-09-01T00:00:00.000Z", to: "2026-09-02T00:00:00.000Z" } }), NOW);
    expect(cov.find((c) => c.platform === "youtube")?.periodStatus).toBe("not_collected");
  });

  it("candidatos: menções, apoio explícito ≠ menção, crítica explícita; sem pontuação geral", async () => {
    const t = await candidateTable(sql, F(), NOW);
    const h = t.find((x) => x.candidacyId === helena)!;
    const r = t.find((x) => x.candidacyId === rafael)!;
    expect(h.explicitSupport).toBe(1);
    expect(r.explicitCritique).toBe(2);
    expect(h.mentions).toBeGreaterThan(h.explicitSupport);
    expect(Object.keys(h)).not.toContain("score");
  });

  it("filtros combinados: plataforma + tipo + sentimento + candidato + UF + tema", async () => {
    expect((await kpis(sql, F({ contentTypes: ["reply"] }), NOW)).contents).toBe(1);
    expect((await kpis(sql, F({ candidacyIds: [rafael] }), NOW)).contents).toBe(3);
    expect((await kpis(sql, F({ parties: ["PFB"] }), NOW)).contents).toBe(3);
    expect((await kpis(sql, F({ ufs: ["SP"] }), NOW)).contents).toBe(1);
    expect((await kpis(sql, F({ platforms: ["x"] }), NOW)).contents).toBeNull(); // X não coletado ⇒ null, não 0
    expect((await kpis(sql, F({ topics: ["seguranca"] }), NOW)).contents).toBe(1);
    const geo = await byUf(sql, F(), NOW);
    expect(geo.byUf).toEqual([{ uf: "SP", count: 1 }]);
    expect(geo.unknown).toBe(5);
  });

  it("série temporal por plataforma/candidato; feed paginado por cursor; busca global", async () => {
    const s = await series(sql, F(), "hour", "platform", NOW);
    expect(s.reduce((a, x) => a + x.count, 0)).toBe(6);
    const c = await series(sql, F(), "hour", "candidate", NOW);
    expect(new Set(c.map((x) => x.key))).toEqual(new Set([String(helena), String(rafael)]));
    const p1 = await feed(sql, F(), null, 4, NOW);
    expect(p1.items).toHaveLength(4);
    const p2 = await feed(sql, F(), p1.nextCursor, 4, NOW);
    expect(p2.items).toHaveLength(2);
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(6);
    const g = await globalSearch(sql, "Helena", F(), NOW);
    expect(g.contents.length).toBeGreaterThan(0);
    expect((g.candidacies as Record<string, unknown>[]).map((x) => x.ballot_name)).toContain("HELENA DUARTE");
  });

  it("cota esgotada ⇒ janela rate_limited (itens null) e fonte marcada; nada inventado", async () => {
    await sql`update social_monitor set last_run_at = null`;
    const [m] = await listMonitors(sql, "active");
    await socialTick(sql, m, deps(fakeYouTube([], { quotaExceeded: true }).fetch, NOW + 7_200_000));
    const [w] = (await sql`select status, items from social_collection_window where source_id = 'youtube' order by window_end desc limit 1`) as Record<string, unknown>[];
    expect(w).toEqual({ status: "rate_limited", items: null });
    expect(((await sql`select access_status, last_error from social_source where id = 'youtube'`) as Record<string, string>[])[0].access_status).toBe("error");
    expect(await n(sql, "select count(*)::int n from social_record")).toBe(6);
  });
});
