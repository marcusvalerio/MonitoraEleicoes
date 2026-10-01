import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../../../scripts/env.mjs";
import { assertTestDatabase, createSql, type Sql } from "@/persistence/db";
import { resetTestDatabase } from "@/persistence/testing";
import { importCandidacies } from "@/elections/tse/importer";
import { candCsv } from "@/elections/tse/fixtures";
import { countByUf, countView } from "@/analytics/apuracao";
import { TseCountProvider } from "./provider";
import { countTick } from "./worker";

loadLocalEnv();
const DB = process.env.DATABASE_URL_TEST;
const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", f), "utf-8");
const n = async (sql: Sql, q: string) => ((await sql.query(q)) as { n: number }[])[0].n;
const NOW = Date.parse("2026-10-04T23:00:00Z");
const BASE = "https://resultados.tse.jus.br/oficial";
const PRE = JSON.parse(fx("br-c0001-e006257-u.json"));
const GOV = JSON.parse(fx("ac-c0003-e006259-u.json"));

/** Servidor TSE simulado: arquivos oficiais das fixtures; o resto 404. `files` permite substituir conteúdo. */
function fakeTse(files: Record<string, unknown | Error>) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const path = url.replace(BASE, "");
    const v = path === "/comum/config/ele-c.json" ? JSON.parse(fx("ele-c.json")) : files[path];
    if (v instanceof Error) throw v;
    return v === undefined ? new Response("not found", { status: 404 }) : new Response(JSON.stringify(v), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
const P_BR = "/ele2026/6257/dados/br/br-c0001-e006257-u.json";
const G_AC = "/ele2026/6259/dados/ac/ac-c0003-e006259-u.json";
const D_AC = "/ele2026/6259/dados/ac/ac-c0006-e006259-u.json";
/** Arquivo derivado do oficial com números de TESTE (totalização iniciada). */
function partial(base: typeof PRE, st: string, votes: string[], tf = "n") {
  const j = structuredClone(base);
  j.s.st = st;
  j.s.pst = "50,00";
  j.e.c = "1000";
  j.v.vv = "900";
  j.tf = tf;
  j.carg[0].agr.flatMap((a: { par: { cand: { vap: string }[] }[] }) => a.par.flatMap((p) => p.cand)).forEach((c: { vap: string }, i: number) => (c.vap = votes[i] ?? "0"));
  return j;
}
const opts = { year: 2026, round: 1 as const, offices: [1, 3], ufs: ["AC"], datasetKind: "fixture" as const };
const tick = (sql: Sql, files: Record<string, unknown>, now = NOW, o: Partial<typeof opts> & { offices?: number[] } = {}) => countTick(sql, new TseCountProvider(fakeTse(files).fetch, { retries: 0, sleep: async () => {} }), { ...opts, ...o, now: () => now });

describe.skipIf(!DB)("apuração oficial (fixtures TSE → worker → Neon test → leitura)", () => {
  let sql: Sql;
  let lula = 0;
  beforeAll(async () => {
    sql = createSql(DB, "DATABASE_URL_TEST");
    await assertTestDatabase(sql);
    await resetTestDatabase(sql);
    // candidatura de teste com o SQ publicado no arquivo oficial (verifica vínculo sqcand = SQ_CANDIDATO)
    await importCandidacies(sql, 2026, candCsv([{ year: 2026, uf: "BR", office: 1, sq: "280002542548", number: 13, name: "CANDIDATURA DE TESTE", ballot: "LULA", party: [13, "PT", "PARTIDO DOS TRABALHADORES"], title: "-4", cpf: "-4", status: "#NULO" }]), { datasetId: "t-cand", datasetKind: "fixture", hmacKey: "k" });
    lula = ((await sql`select id from candidacy where sq_candidato = 280002542548`) as { id: number }[])[0].id;
  });

  it("pré-eleição: arquivos publicados ⇒ 'não iniciada', votos NOT_COLLECTED; não publicado ⇒ 'indisponível'; sem tentativa ⇒ 'não coletada'", async () => {
    const r = await tick(sql, { [P_BR]: PRE, [G_AC]: GOV });
    expect(r).toMatchObject({ targets: 3, newSnapshots: 2, notPublished: 1, errors: 0 });
    const br = await countView(sql, { year: 2026, round: 1, officeId: 1, territoryId: 0 }, NOW);
    expect(br.state).toBe("nao_iniciada");
    expect(br.snapshot!.turnout).toEqual({ value: null, status: "not_collected" });
    expect(br.snapshot!.electorate.status).toBe("value");
    expect(br.snapshot!.sourceUrl).toBe(BASE + P_BR);
    expect(br.candidates.every((c) => c.votes.value === null && c.votes.status === "not_collected")).toBe(true);
    expect(br.candidates.find((c) => c.sqCandidato === 280002542548)!.candidacyId).toBe(lula);
    expect((await countView(sql, { year: 2026, round: 1, officeId: 1, territoryId: 12 }, NOW)).state).toBe("indisponivel");
    expect((await countView(sql, { year: 2026, round: 1, officeId: 1, territoryId: 35 }, NOW)).state).toBe("nao_coletada");
    expect(await n(sql, "select count(*)::int n from count_candidate where votes = 0")).toBe(0); // nenhum "0 votos" inventado
  });

  it("idempotente: mesma publicação (ou republicação com nova data de geração) não duplica nada", async () => {
    const before = await n(sql, "select count(*)::int n from count_snapshot");
    const raw = await n(sql, "select count(*)::int n from raw_record");
    const re = { ...structuredClone(PRE), dg: "04/10/2026", hg: "08:00:00", idg: "1" };
    const r = await tick(sql, { [P_BR]: re, [G_AC]: GOV });
    expect(r).toMatchObject({ newSnapshots: 0, unchanged: 2 });
    expect(await n(sql, "select count(*)::int n from count_snapshot")).toBe(before);
    expect(await n(sql, "select count(*)::int n from raw_record")).toBe(raw);
  });

  it("totalização parcial ⇒ 'em apuração' (coleta em dia) e 'parcial' (coleta atrasada); zero real é valor", async () => {
    const r = await tick(sql, { [P_BR]: partial(PRE, "250000", ["500", "300", "0"]), [G_AC]: GOV });
    expect(r.newSnapshots).toBe(1);
    const v = await countView(sql, { year: 2026, round: 1, officeId: 1, territoryId: 0 }, NOW);
    expect(v.state).toBe("em_apuracao");
    expect(v.candidates[0]).toMatchObject({ votes: { value: 500, status: "value" } });
    expect(v.candidates.find((c) => c.votes.value === 0)?.votes.status).toBe("value");
    expect((await countView(sql, { year: 2026, round: 1, officeId: 1, territoryId: 0 }, NOW + 3_600_000)).state).toBe("parcial");
    expect(((await sql`select status from election where year = 2026`) as { status: string }[])[0].status).toBe("results_partial");
  });

  it("falha de rede no arquivo: registra erro, preserva último retrato e marca 'parcial'", async () => {
    const r = await tick(sql, { [P_BR]: new Error("ECONNRESET") as unknown as object, [G_AC]: GOV }, NOW + 60_000);
    expect(r.errors).toBe(1);
    expect(await n(sql, `select count(*)::int n from ingestion_error where ingestion_run_id = '${r.runId}'`)).toBe(1);
    expect(((await sql`select status from ingestion_run where id = ${r.runId}`) as { status: string }[])[0].status).toBe("partial");
    const v = await countView(sql, { year: 2026, round: 1, officeId: 1, territoryId: 0 }, NOW + 60_000);
    expect(v.state).toBe("parcial");
    expect(v.candidates[0].votes.value).toBe(500);
  });

  it("totalizada (tf = 's') ⇒ 'totalizada'", async () => {
    await tick(sql, { [P_BR]: partial(PRE, "499248", ["700", "300", "0"], "s"), [G_AC]: GOV }, NOW + 120_000);
    expect((await countView(sql, { year: 2026, round: 1, officeId: 1, territoryId: 0 }, NOW + 9e9)).state).toBe("totalizada");
  });

  it("reprocessamento seguro: checkpoint apagado ⇒ nada duplicado", async () => {
    const s = await n(sql, "select count(*)::int n from count_snapshot");
    const c = await n(sql, "select count(*)::int n from count_candidate");
    await sql`delete from ingestion_checkpoint where provider_id = 'tse-divulgacao'`;
    await tick(sql, { [P_BR]: partial(PRE, "499248", ["700", "300", "0"], "s"), [G_AC]: GOV }, NOW + 180_000);
    expect(await n(sql, "select count(*)::int n from count_snapshot")).toBe(s);
    expect(await n(sql, "select count(*)::int n from count_candidate")).toBe(c);
  });

  it("proporcional (UF): só o retrato mais recente guarda votação por candidatura; RAW nos marcos (fase/30 min/final)", async () => {
    const dep = (st: string) => {
      const j = partial(GOV, st, ["10", "20"]);
      j.carg[0].cd = "6";
      return j;
    };
    const raws = () => n(sql, "select count(*)::int n from raw_record r join source_record sr on sr.id = r.source_record_id where sr.external_id like 'apuracao:2026:1:6:%'");
    await tick(sql, { [D_AC]: dep("10") }, NOW, { offices: [6] });
    await tick(sql, { [D_AC]: dep("20") }, NOW + 60_000, { offices: [6] }); // mesma fase, < 30 min ⇒ sem novo RAW
    expect(await raws()).toBe(1);
    await tick(sql, { [D_AC]: dep("30") }, NOW + 31 * 60_000, { offices: [6] }); // ≥ 30 min ⇒ RAW
    expect(await raws()).toBe(2);
    expect(await n(sql, "select count(*)::int n from count_snapshot where office_id = 6")).toBe(3);
    expect(await n(sql, "select count(*)::int n from count_snapshot where office_id = 6 and source_record_id is not null and collected_at is not null")).toBe(3);
    expect(await n(sql, "select count(distinct snapshot_id)::int n from count_candidate cc join count_snapshot s on s.id = cc.snapshot_id where s.office_id = 6")).toBe(1);
  });

  it("mapa por UF: líder só com votos apurados; demais UFs com estado explícito", async () => {
    const ufs = await countByUf(sql, { year: 2026, round: 1, officeId: 3 }, NOW);
    expect(ufs).toHaveLength(27);
    const ac = ufs.find((u) => u.uf === "AC")!;
    expect(ac).toMatchObject({ state: "nao_iniciada", leader: null });
    expect(ufs.find((u) => u.uf === "SP")!.state).toBe("nao_coletada");
  });

  it("configuração oficial inacessível ⇒ execução 'failed', nada gravado como resultado", async () => {
    const s = await n(sql, "select count(*)::int n from count_snapshot");
    const f = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const r = await countTick(sql, new TseCountProvider(f, { retries: 0 }), { ...opts, now: () => NOW });
    expect(((await sql`select status from ingestion_run where id = ${r.runId}`) as { status: string }[])[0].status).toBe("failed");
    expect(await n(sql, "select count(*)::int n from count_snapshot")).toBe(s);
  });
});
