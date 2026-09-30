/** Semente determinística do E2E de inteligência (banco de TESTE apenas). */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertTestDatabase, createSql } from "@/persistence/db";
import { resetTestDatabase } from "@/persistence/testing";
import { importCandidacies, importResults, resolveIdentities } from "@/elections/tse/importer";
import { FX_CANDIDACIES, FX_VOTES, candCsv, voteCsv } from "@/elections/tse/fixtures";
import { FileRegistryElectionProvider, FilePressProvider, FileTranscriptProvider, UnconfiguredSocialProvider } from "@/providers/files";
import { LIVE_SOURCES } from "@/providers/files/sources";
import { RuleBasedSpeechClassifier } from "@/ai/classifiers";
import { YouTubeProvider } from "@/providers/youtube";
import { FX_YT_VIDEOS, fakeYouTube } from "@/providers/youtube/fixtures";
import { PLATFORM_MATRIX, UnavailableSocialProvider } from "@/providers/social/catalog";
import { listMonitors } from "@/control/social";
import { socialTick } from "@/ingestion/social-worker";

export const NOW = Date.parse("2026-10-02T01:00:00Z");
const RAFAEL = { year: 2026, uf: "BR", office: 1, sq: "280000000003", number: 93, name: "RAFAEL MONTEIRO", ballot: "RAFAEL MONTEIRO", party: [92, "PFB", "PARTIDO FICTÍCIO B"] as [number, string, string], title: "000000000494", cpf: "-4", status: "#NULO" };

export async function seedElections(url: string) {
  const sql = createSql(url, "DATABASE_URL_TEST");
  await assertTestDatabase(sql);
  await resetTestDatabase(sql);
  const opt = { datasetId: "e2e-tse", datasetKind: "fixture" as const, hmacKey: "e2e" };
  const all = [...FX_CANDIDACIES, RAFAEL];
  for (const y of [2014, 2018, 2022, 2026]) await importCandidacies(sql, y, candCsv(all.filter((c) => c.year === y)), opt);
  for (const y of [2014, 2022]) await importResults(sql, y, [voteCsv(FX_VOTES.filter((v) => v.year === y))], opt);
  await resolveIdentities(sql);
  const ids = (await sql`select c.sq_candidato::text as sq, c.id, l.person_id from candidacy c left join identity_link l on l.candidacy_id = c.id`) as { sq: string; id: number; person_id: number | null }[];
  return Object.fromEntries(ids.map((r) => [r.sq, { id: r.id, personId: r.person_id }]));
}

/** Executa o worker social (um tick por monitor ativo) com a API do YouTube simulada (fixture). */
export async function runWorker(url: string) {
  const sql = createSql(url, "DATABASE_URL_TEST");
  await assertTestDatabase(sql);
  const empty = mkdtempSync(path.join(tmpdir(), "monitora-e2e-"));
  const fetchImpl = fakeYouTube(FX_YT_VIDEOS).fetch;
  for (const m of await listMonitors(sql, "active"))
    await socialTick(sql, m, {
      providers: [new YouTubeProvider({ apiKey: "fixture", hashKey: "e2e" }, fetchImpl, () => NOW), ...PLATFORM_MATRIX.filter((e) => e.platform !== "youtube").map((e) => new UnavailableSocialProvider(e))],
      base: { mode: "live", election: new FileRegistryElectionProvider(empty), transcript: new FileTranscriptProvider(empty), social: new UnconfiguredSocialProvider(), media: new FilePressProvider(empty), classifier: (s) => new RuleBasedSpeechClassifier(() => [...s.candidates.values()]), aiSourceId: "src-ai-rules", sleep: async () => {} },
      sources: LIVE_SOURCES,
      now: () => NOW,
      datasetKind: "fixture",
    });
}
