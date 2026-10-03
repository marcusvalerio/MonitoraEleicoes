import { beforeAll, describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { loadLocalEnv } from "../../../scripts/env.mjs";
import { assertTestDatabase, createSql, type Sql } from "@/persistence/db";
import { resetTestDatabase } from "@/persistence/testing";
import { DEFAULT_FILTER, type FilterSpec } from "@/domain/filters";
import { listPolls, pollsSummary } from "@/analytics/polls";
import { importPolls } from "./importer";

loadLocalEnv();
const DB = process.env.DATABASE_URL_TEST;
/** CSV de TESTE no layout oficial (institutos, contratantes e documentos fictícios). */
const H = '"DT_GERACAO";"HH_GERACAO";"AA_ELEICAO";"CD_ELEICAO";"NM_ELEICAO";"SG_UF";"SG_UE";"NM_UE";"NR_PROTOCOLO_REGISTRO";"DT_REGISTRO";"ST_PESQUISA_PROPRIA";"NR_CNPJ_EMPRESA";"NM_EMPRESA";"NM_EMPRESA_FANTASIA";"DS_CARGO";"DT_INICIO_PESQUISA";"DT_FIM_PESQUISA";"DT_DIVULGACAO";"QT_ENTREVISTADO";"CD_CONRE";"NM_ESTATISTICO_RESP";"VR_PESQUISA";"DS_METODOLOGIA_PESQUISA";"DS_PLANO_AMOSTRAL";"DS_SISTEMA_CONTROLE";"DS_DADO_MUNICIPIO"';
const row = (p: string, uf: string, cargo: string, rel: string, n: string, emp: string) => `"30/09/2026";"05:46:47";2026;81;"Eleições Gerais 2026";"${uf}";"${uf}";"X";"${p}";"2026-09-01 10:00:00";"N";"${emp.endsWith("A") ? "00000000000191" : "00000000000353"}";"${emp} LTDA";"${emp}";"${cargo}";"2026-09-01 00:00:00";"2026-09-03 00:00:00";"${rel} 00:00:00";${n};"1";"Estatístico de Teste";"1000,00";"metodologia\r\ncom quebra";"plano";"controle";"#NULO#"`;
const polls = () => Readable.from([Buffer.from([H, row("BR000012026", "BR", "Presidente", "2026-09-05", "2000", "INSTITUTO TESTE A"), row("SP000022026", "SP", "Governador, Senador", "2026-09-10", "1200", "INSTITUTO TESTE B"), row("RJ000032026", "RJ", "Governador", "2026-09-12", "#NULO#", "INSTITUTO TESTE A")].join("\r\n"), "latin1")]);
const contractors = () => Readable.from([Buffer.from(['"DT_GERACAO";"HH_GERACAO";"AA_ELEICAO";"NR_PROTOCOLO_REGISTRO";"CD_CONTRATANTE";"NR_CPF_CNPJ_CONTRATANTE";"NM_CONTRATANTE";"VR_PAGO_CONTRATANTE";"ST_CONTRATANTE_PAGANTE";"DS_ORIGEM_RECURSO"', '"x";"x";2026;"BR000012026";1;"00000000000272";"CONTRATANTE PJ TESTE";"0,00";"S";"#NULO#"', '"x";"x";2026;"SP000022026";2;"12345678909";"PESSOA FISICA TESTE";"500,00";"S";"#NULO#"'].join("\r\n"), "latin1")]);
const F = (o: Partial<FilterSpec> = {}): FilterSpec => ({ ...DEFAULT_FILTER, year: 2026, ...o });

describe.skipIf(!DB)("pesquisas registradas (PesqEle) → Neon → leitura", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = createSql(DB, "DATABASE_URL_TEST");
    await assertTestDatabase(sql);
    await resetTestDatabase(sql);
  });

  it("importa registro + contratantes; CPF nunca armazenado; resultados = not_available", async () => {
    const r = await importPolls(sql, 2026, polls(), contractors(), { datasetId: "t-polls", datasetKind: "fixture" });
    expect(r).toMatchObject({ read: 3, written: 3, rejected: 0, contractors: 2 });
    const pf = (await sql`select kind, cnpj, name from poll_contractor where protocol = 'SP000022026'`) as Record<string, unknown>[];
    expect(pf).toEqual([{ kind: "pessoa_fisica", cnpj: null, name: "PESSOA FISICA TESTE" }]);
    expect(JSON.stringify(await sql`select * from poll_contractor`)).not.toContain("12345678909");
    const [p] = (await sql`select office_ids, sample_size, results_status, methodology, source_record_id from poll where protocol = 'SP000022026'`) as Record<string, unknown>[];
    expect(p).toMatchObject({ office_ids: [3, 5], sample_size: 1200, results_status: "not_available", methodology: "metodologia\ncom quebra", source_record_id: "tse:pesquisa_eleitoral:2026" });
    expect(((await sql`select sample_size from poll where protocol = 'RJ000032026'`) as { sample_size: number | null }[])[0].sample_size).toBeNull(); // ausente ≠ 0
  });

  it("reimportação idempotente", async () => {
    await importPolls(sql, 2026, polls(), contractors(), { datasetId: "t-polls", datasetKind: "fixture" });
    expect(((await sql`select count(*)::int n from poll`) as { n: number }[])[0].n).toBe(3);
    expect(((await sql`select count(*)::int n from poll_contractor`) as { n: number }[])[0].n).toBe(2);
  });

  it("filtros no SQL (UF, cargo, instituto, período) e cursor", async () => {
    expect((await listPolls(sql, F({ ufs: ["SP"] }))).items.map((x) => x.protocol)).toEqual(["SP000022026"]);
    expect((await listPolls(sql, F({ offices: [3] }))).items.map((x) => x.protocol)).toEqual(["RJ000032026", "SP000022026"]);
    expect((await listPolls(sql, F(), { company: "teste a" })).items).toHaveLength(2);
    expect((await listPolls(sql, F({ period: { preset: "custom", from: "2026-09-09T00:00:00.000Z", to: "2026-09-11T00:00:00.000Z" } }))).items.map((x) => x.protocol)).toEqual(["SP000022026"]);
    const p1 = await listPolls(sql, F(), { limit: 2 });
    const p2 = await listPolls(sql, F(), { limit: 2, cursor: p1.nextCursor });
    expect([...p1.items, ...p2.items].map((x) => x.protocol)).toEqual(["RJ000032026", "SP000022026", "BR000012026"]);
    expect(p2.nextCursor).toBeNull();
    const s = await pollsSummary(sql, F());
    expect(s).toMatchObject({ total: 3, companies: 2, national: 1, interviews: 3200 });
  });
});
