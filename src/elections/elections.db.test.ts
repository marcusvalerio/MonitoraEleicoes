import { beforeAll, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../../scripts/env.mjs";
import { assertTestDatabase, createSql, type Sql } from "@/persistence/db";
import { resetTestDatabase } from "@/persistence/testing";
import { importCandidacies, importResults, resolveIdentities, setManualIdentity } from "./tse/importer";
import { FX_CANDIDACIES, FX_VOTES, candCsv, voteCsv } from "./tse/fixtures";
import { candidacyByUf, candidacyStanding, compareCycles, electionsSummary, partyByUf, partyElected, partyProfile, leadersByUf, listCandidacies, municipalitiesOf, partyHistory, personHistory, resultsTable, searchCandidacies } from "@/analytics/elections";
import { DEFAULT_FILTER, type FilterSpec } from "@/domain/filters";

loadLocalEnv();
const DB = process.env.DATABASE_URL_TEST;
const KEY = "chave-de-teste-nao-secreta";
const n = async (sql: Sql, q: string, p: unknown[] = []) => ((await sql.query(q, p)) as { n: number }[])[0].n;
const opt = { datasetId: "t-tse", datasetKind: "fixture" as const, hmacKey: KEY };

describe.skipIf(!DB)("histórico eleitoral TSE (fixture no formato oficial)", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = createSql(DB, "DATABASE_URL_TEST");
    await assertTestDatabase(sql);
    await resetTestDatabase(sql);
    for (const y of [2014, 2018, 2022, 2026]) await importCandidacies(sql, y, candCsv(FX_CANDIDACIES.filter((c) => c.year === y)), opt);
    for (const y of [2014, 2022]) await importResults(sql, y, [voteCsv(FX_VOTES.filter((v) => v.year === y))], opt);
  });

  it("candidaturas por ciclo; turnos consolidados; cargo fora do escopo ignorado; CPF/título nunca gravados em claro", async () => {
    expect(await n(sql, "select count(*)::int n from candidacy")).toBe(7);
    const h = ((await sql`select status_round1, status_round2, title_hmac, cpf_hmac from candidacy where sq_candidato = 190000000101`) as Record<string, string>[])[0];
    expect(h).toMatchObject({ status_round1: "2º TURNO", status_round2: "ELEITO" });
    expect(h.title_hmac).toMatch(/^[0-9a-f]{64}$/);
    const dump = JSON.stringify(await sql`select * from candidacy`);
    expect(dump).not.toContain("000000000191");
    expect(dump).not.toContain("11111111111");
    expect(await n(sql, "select count(*)::int n from party_registration where year = 2022")).toBe(2);
  });

  it("resultados: zonas somadas por município (majoritário) e por UF (proporcional); desconhecidos rejeitados", async () => {
    const rio = ((await sql`select votes from result_candidacy r join candidacy c on c.id = r.candidacy_id where c.sq_candidato = 190000000101 and r.round = 1 and r.territory_id = ${100000 + 60011}`) as { votes: number }[])[0];
    expect(rio.votes).toBe(1500);
    const zero = ((await sql`select votes, votes_status from result_candidacy r join candidacy c on c.id = r.candidacy_id where c.sq_candidato = 190000000102 and r.territory_id = ${100000 + 58190}`) as Record<string, unknown>[])[0];
    expect(zero).toEqual({ votes: 0, votes_status: "value" }); // zero REAL (o arquivo diz 0) ≠ ausência
    const dep = ((await sql`select r.territory_id, votes from result_candidacy r join candidacy c on c.id = r.candidacy_id where c.sq_candidato = 250000000001`) as Record<string, number>[])[0];
    expect(dep).toEqual({ territory_id: 35, votes: 420 });
    expect(((await sql`select rows_rejected from import_batch where kind = 'results' and year = 2022`) as { rows_rejected: number }[])[0].rows_rejected).toBe(1);
    expect(await n(sql, "select count(*)::int n from territory where level = 'municipio' and parent_id = 33")).toBe(2);
  });

  it("2026: candidaturas sim, resultados não publicados (status do ciclo; nenhum 0 inventado)", async () => {
    expect(((await sql`select status from election where year = 2026`) as { status: string }[])[0].status).toBe("candidacies_only");
    expect(await n(sql, "select count(*)::int n from result_candidacy where year = 2026")).toBe(0);
    expect(((await sql`select status from election where year = 2022`) as { status: string }[])[0].status).toBe("results_official");
  });

  it("identidade: título liga 4 ciclos; homônimos separados; sem identificador ⇒ unresolved; nunca por nome", async () => {
    const r = await resolveIdentities(sql);
    expect(r.unresolved).toBe(1);
    const helena = (await sql`select distinct l.person_id from identity_link l join candidacy c on c.id = l.candidacy_id where c.normalized_name = 'HELENA DUARTE'`) as unknown[];
    expect(helena).toHaveLength(1);
    expect(await n(sql, "select count(*)::int n from identity_link l join candidacy c on c.id = l.candidacy_id where c.normalized_name = 'HELENA DUARTE' and l.method = 'title_hmac'")).toBe(4);
    const jose = (await sql`select l.person_id, l.status from identity_link l join candidacy c on c.id = l.candidacy_id where c.normalized_name = 'JOSE SILVA' order by c.year`) as { person_id: number | null; status: string }[];
    expect(jose.map((j) => j.status)).toEqual(["resolved", "resolved", "unresolved"]);
    expect(jose[0].person_id).not.toBe(jose[1].person_id);
    expect(jose[2].person_id).toBeNull();
    // reexecutar não altera vínculos
    const again = await resolveIdentities(sql);
    expect(again.personsCreated).toBe(0);
  });

  it("revisão manual prevalece e não é sobrescrita pela resolução automática", async () => {
    const [c] = (await sql`select id from candidacy where sq_candidato = 280000000002`) as { id: number }[];
    const [p] = (await sql`select l.person_id from identity_link l join candidacy c on c.id = l.candidacy_id where c.sq_candidato = 190000000102`) as { person_id: number }[];
    await setManualIdentity(sql, c.id, p.person_id, "revisão: mesmo candidato (documento público)");
    await resolveIdentities(sql);
    expect(((await sql`select status, person_id from identity_link where candidacy_id = ${c.id}`) as Record<string, unknown>[])[0]).toEqual({ status: "manual", person_id: p.person_id });
  });

  it("reimportar é idempotente", async () => {
    await importCandidacies(sql, 2022, candCsv(FX_CANDIDACIES.filter((c) => c.year === 2022)), opt);
    await importResults(sql, 2022, [voteCsv(FX_VOTES.filter((v) => v.year === 2022))], opt);
    expect(await n(sql, "select count(*)::int n from candidacy")).toBe(7);
    expect(await n(sql, "select count(*)::int n from result_candidacy where year = 2022")).toBe(6);
  });

  const F = (o: Partial<FilterSpec>): FilterSpec => ({ ...DEFAULT_FILTER, ...o });

  it("analytics: tabela de resultados no recorte (UF), percentual sobre votos nominais válidos, colocação", async () => {
    const t = await resultsTable(sql, F({ year: 2022, offices: [3], ufs: ["RJ"] }));
    expect(t.pctStatus).toBe("value");
    expect(t.totalNominalVotes).toBe(2500);
    expect(t.rows.map((r) => [r.ballotName, r.votes, r.rank])).toEqual([["HELENA", 1700, 1], ["ZE SILVA", 800, 2]]);
    expect(t.rows[0].pct).toBeCloseTo(0.68);
    const mun = await resultsTable(sql, F({ year: 2022, offices: [3], municipality: 100000 + 58190 }));
    expect(mun.rows.map((r) => r.votes)).toEqual([200, 0]); // zero real exibido como zero
    const t2 = await resultsTable(sql, F({ year: 2022, round: 2, offices: [3], ufs: ["RJ"] }));
    expect(t2.rows[0].status).toBe("ELEITO");
  });

  it("recorte com várias disputas estaduais ⇒ percentual/colocação não se aplicam", async () => {
    const t = await resultsTable(sql, F({ year: 2022, offices: [3] }));
    expect(t.pctStatus).toBe("not_applicable");
    expect(t.rows.every((r) => r.pct === null && r.rank === null)).toBe(true);
  });

  it("filtros combinados: partido + nome + região", async () => {
    expect((await resultsTable(sql, F({ year: 2022, offices: [3], ufs: ["RJ"], parties: ["PFB"] }))).rows.map((r) => r.ballotName)).toEqual(["ZE SILVA"]);
    expect((await resultsTable(sql, F({ year: 2022, offices: [3], regions: [3], candidateQuery: "helena" }))).rows).toHaveLength(1);
    expect((await resultsTable(sql, F({ year: 2022, offices: [3], regions: [2] }))).rows).toHaveLength(0);
    expect((await searchCandidacies(sql, F({ year: 2026, candidateQuery: "jose" }))).map((r) => r.identity_status)).toEqual(["manual"]);
  });

  it("2026 sem resultados: tabela vazia com nota; histórico por partido distingue não coletado × indisponível", async () => {
    const t = await resultsTable(sql, F({ year: 2026, offices: [1] }));
    expect(t.rows).toEqual([]);
    expect(t.note).toMatch(/não publicados/);
    const h = await partyHistory(sql, F({ offices: [3], ufs: ["RJ"] }), ["PFA"]);
    expect(h.find((x) => x.year === 2022)?.parties[0]).toEqual({ party: "PFA", votes: 1700, votesStatus: "value" });
    expect(h.find((x) => x.year === 2026)?.parties[0].votesStatus).toBe("not_collected");
    expect((await electionsSummary(sql)).map((e) => e.year)).toEqual([2026, 2022, 2018, 2014]);
  });

  it("histórico da pessoa: 4 ciclos por identidade (não por nome), com votos quando publicados", async () => {
    const [p] = (await sql`select l.person_id from identity_link l join candidacy c on c.id = l.candidacy_id where c.sq_candidato = 280000000001`) as { person_id: number }[];
    const hist = await personHistory(sql, p.person_id);
    expect(hist.map((h) => [h.year, h.office, h.votesRound1])).toEqual([[2026, "Presidente", null], [2022, "Governador", 1700], [2018, "Governador", null], [2014, "Deputado Federal", 420]]);
  });

  it("mapa: mais votado por UF soma municípios da UF (majoritário); UF sem dados fica ausente (nunca 0)", async () => {
    const l = await leadersByUf(sql, F({ year: 2022, offices: [3] }));
    expect(l.map((x) => x.uf)).toEqual(["RJ"]);
    expect(l[0]).toMatchObject({ ballot_name: "HELENA", votes: "1700" });
    expect(l[0].share).toBeCloseTo(1700 / 2500, 6);
  });

  it("comparação entre ciclos no mesmo recorte: votos null com status quando não há resultado", async () => {
    const c = await compareCycles(sql, F({ offices: [3], ufs: ["RJ"] }));
    const y = Object.fromEntries(c.map((x) => [x.year, x]));
    expect(y[2022]).toMatchObject({ nominalVotes: 2500, votesStatus: "value", partiesWithVotes: 2 });
    expect(y[2018]).toMatchObject({ nominalVotes: null });
    expect(y[2026]).toMatchObject({ nominalVotes: null, votesStatus: "not_collected" });
    const m = await municipalitiesOf(sql, "RJ");
    expect(m.map((x) => x.name)).toEqual(["NITERÓI", "RIO DE JANEIRO"]);
    const mun = await compareCycles(sql, F({ offices: [3], ufs: ["RJ"], municipality: m[0].id }));
    expect(mun.find((x) => x.year === 2022)).toMatchObject({ nominalVotes: 200, candidacies: null });
  });

  it("candidaturas 2026 no recorte (ordem alfabética, sem ranking) com filtro de partido/nome", async () => {
    const r = await listCandidacies(sql, F({ year: 2026, offices: [1] }));
    expect(r.total).toBe(2);
    expect((await listCandidacies(sql, F({ year: 2026, offices: [1], parties: ["PFB"] }))).rows.map((x) => x.ballotName)).toEqual(["ZE SILVA"]);
    expect((await listCandidacies(sql, F({ year: 2026, offices: [1], candidateQuery: "helena" }))).total).toBe(1);
  });

  it("partido: candidaturas, eleitos (situação oficial) e votos por ciclo; UF; sigla inexistente ⇒ null", async () => {
    const p = (await partyProfile(sql, "PFA"))!;
    const g22 = p.byOffice.find((r) => r.year === 2022 && r.officeId === 3)!;
    expect(g22).toMatchObject({ candidacies: 1, elected: 1, votes: 1700, votesStatus: "value" });
    expect(p.byOffice.find((r) => r.year === 2026)).toMatchObject({ votes: null, votesStatus: "not_collected" });
    expect(await partyProfile(sql, "NAOEXISTE")).toBeNull();
    const uf = await partyByUf(sql, "PFA", 2022, 3);
    expect(uf).toEqual([{ uf: "RJ", votes: "1700", total: "2500", share: 0.68 }]);
    expect((await partyElected(sql, "PFA", 2022)).map((e) => e.ballot_name)).toEqual(["HELENA"]);
  });

  it("candidatura: % e colocação na própria disputa; por UF", async () => {
    const [c] = (await sql`select id from candidacy where sq_candidato = 190000000101`) as { id: number }[];
    expect(await candidacyStanding(sql, c.id)).toEqual({ rank: 1, of: 2, votes: 1700, pct: 0.68 });
    const [z] = (await sql`select id from candidacy where sq_candidato = 190000000102`) as { id: number }[];
    expect((await candidacyStanding(sql, z.id))!.rank).toBe(2);
    expect((await candidacyByUf(sql, c.id)).map((u) => [u.uf, u.votes])).toEqual([["RJ", "1700"]]);
    const [x] = (await sql`select id from candidacy where sq_candidato = 280000000001`) as { id: number }[];
    expect(await candidacyStanding(sql, x.id)).toBeNull(); // 2026: sem resultado ⇒ null, nunca 0
  });
});
