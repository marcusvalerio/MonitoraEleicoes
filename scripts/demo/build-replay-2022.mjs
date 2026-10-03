#!/usr/bin/env node
/**
 * DEMONSTRAÇÃO (somente teste/dev) — monta um REPLAY da apuração presidencial de 2022 (1º turno) no formato "-u.json"
 * do sistema de divulgação do TSE, a partir de dados OFICIAIS:
 *   - votos por candidatura e UF: result_candidacy (TSE · Dados Abertos, já importado no dev);
 *   - eleitorado, seções, comparecimento, abstenção, válidos, brancos e nulos: detalhe_votacao_munzona_2022 (TSE).
 * Nada é estimado: cada UF passa de "não iniciada" ao seu total oficial final. O arquivo BR é a soma oficial das UFs já
 * liberadas (marcado como replay). Saída: .monitora/demo/replay-2022/ (gitignored).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { loadLocalEnv } from "../env.mjs";

loadLocalEnv();
const root = process.cwd();
const out = path.join(root, ".monitora", "demo", "replay-2022");
mkdirSync(out, { recursive: true });

// 1) Totais oficiais por UF (detalhe_votacao_munzona_2022, 1º turno, Presidente)
const zip = path.join(root, ".monitora", "tse", "detalhe_votacao_munzona_2022.zip");
const p = spawn("unzip", ["-p", zip, "detalhe_votacao_munzona_2022_BRASIL.csv"]);
p.stdout.setEncoding("latin1");
const rl = createInterface({ input: p.stdout, crlfDelay: Infinity });
let header = null;
const tot = {};
const num = (v) => Number(String(v).replace(/"/g, "")) || 0;
for await (const line of rl) {
  const c = line.split(";").map((x) => x.replace(/^"|"$/g, ""));
  if (!header) { header = c; continue; }
  const r = Object.fromEntries(header.map((h, i) => [h, c[i]]));
  if (r.NR_TURNO !== "1" || r.CD_CARGO !== "1") continue;
  const t = (tot[r.SG_UF] ??= { te: 0, ts: 0, c: 0, a: 0, vv: 0, vb: 0, vn: 0 });
  t.te += num(r.QT_APTOS); t.ts += num(r.QT_TOTAL_SECOES); t.c += num(r.QT_COMPARECIMENTO); t.a += num(r.QT_ABSTENCOES);
  t.vv += num(r.QT_TOTAL_VOTOS_VALIDOS); t.vb += num(r.QT_VOTOS_BRANCOS); t.vn += num(r.QT_TOTAL_VOTOS_NULOS);
}
// 2) Votos oficiais por candidatura e UF (dev)
const sql = neon(process.env.DATABASE_URL);
const cands = await sql.query(`select c.id, c.sq_candidato::text as sq, c.ballot_number as n, c.ballot_name as nmu, c.name as nm, c.party_acronym as sg, c.status_round1 as st
  from candidacy c where c.year = 2022 and c.office_id = 1 order by c.ballot_number`);
const votes = await sql.query(`select t.uf, r.candidacy_id as id, sum(r.votes)::bigint as v from result_candidacy r join territory t on t.id = r.territory_id
  where r.year = 2022 and r.round = 1 and r.office_id = 1 and r.votes_status = 'value' group by 1, 2`);
const byUf = {};
for (const v of votes) (byUf[v.uf] ??= {})[v.id] = Number(v.v);
const check = Object.values(byUf).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0);
writeFileSync(path.join(out, "data.json"), JSON.stringify({ source: ["TSE · Dados Abertos: votacao_candidato_munzona_2022 (via result_candidacy)", "TSE · Dados Abertos: detalhe_votacao_munzona_2022"], totals: tot, candidates: cands, votesByUf: byUf }, null, 1));
console.log(JSON.stringify({ ufs: Object.keys(tot).length, candidates: cands.length, nominalVotes: check, validVotesDetalhe: Object.values(tot).reduce((a, t) => a + t.vv, 0) }));
