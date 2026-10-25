#!/usr/bin/env node
/**
 * Locais de votação (escolas) e votação por local — TSE · Dados Abertos.
 *   node scripts/import-locais.mjs --env production --confirm-production --year 2026 [--round 1] [--dir .monitora/tse]
 *
 * Fontes oficiais (baixadas para --dir; reaproveitadas se já existirem):
 *   votacao_secao/votacao_secao_<ANO>_BR.zip          (Presidente, por seção: município, zona, local, votos)
 *   eleitorado_locais_votacao/eleitorado_local_votacao_<ANO>.zip  (endereço, bairro, latitude/longitude, eleitorado)
 *
 * Agrega seção ⇒ local (soma de votos por NR_VOTAVEL; 95 branco, 96 nulo). Cria municípios em `territory`
 * (id 100000 + código TSE; Exterior ⇒ pai 99). Idempotente (upsert). Nada é estimado: local sem coordenada fica sem ponto.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { neon } from "@neondatabase/serverless";
import { loadLocalEnv, URL_VAR } from "./env.mjs";

loadLocalEnv();
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const env = arg("--env");
if (!URL_VAR[env]) {
  console.error("uso: --env development|test|production --year 2026 [--round 1]");
  process.exit(2);
}
if (env === "production" && !args.includes("--confirm-production")) {
  console.error("produção exige --confirm-production");
  process.exit(2);
}
const year = Number(arg("--year", "2026"));
const round = Number(arg("--round", "1"));
const dir = arg("--dir", path.join(process.cwd(), ".monitora", "tse"));
mkdirSync(dir, { recursive: true });
const sql = neon(process.env[URL_VAR[env]]);
const log = (msg, extra = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), component: "import-locais", msg, ...extra }));

const BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele";
const SECAO = `${BASE}/votacao_secao/votacao_secao_${year}_BR.zip`;
const LOCAIS = `${BASE}/eleitorado_locais_votacao/eleitorado_local_votacao_${year}.zip`;
const UF_IBGE = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };

function download(url) {
  const file = path.join(dir, path.basename(url));
  if (!existsSync(file)) {
    log("download", { url });
    if (spawnSync("curl", ["-sSf", "-o", file, url], { stdio: "inherit" }).status !== 0) throw new Error(`download falhou: ${url}`);
  }
  return file;
}
async function sha256(file) {
  const h = createHash("sha256");
  for await (const c of createReadStream(file)) h.update(c);
  return h.digest("hex");
}
/** Linhas do CSV (latin1, ';', aspas) de um membro do ZIP, como objetos por cabeçalho. */
async function* rows(file, member) {
  const p = spawn("unzip", ["-p", file, member], { stdio: ["ignore", "pipe", "inherit"] });
  p.stdout.setEncoding("latin1");
  let head = null;
  for await (const line of readline.createInterface({ input: p.stdout, crlfDelay: Infinity })) {
    const cols = line.split(";").map((c) => c.replace(/^"|"$/g, "").trim());
    if (!head) {
      head = cols;
      continue;
    }
    yield Object.fromEntries(head.map((h, i) => [h, cols[i]]));
  }
}
const member = (file, re) => spawnSync("unzip", ["-Z1", file], { encoding: "utf8", maxBuffer: 1 << 24 }).stdout.split("\n").find((n) => re.test(n));
const num = (s) => (s === undefined || s === "" || s === "#NULO#" || Number(s) < 0 ? null : Number(s));
const coord = (s) => {
  const v = s ? Number(s.replace(",", ".")) : NaN;
  return Number.isFinite(v) && v !== 0 && Math.abs(v) <= 180 ? v : null;
};

async function provenance(id, url, file) {
  await sql`insert into dataset (id, kind, description) values (${`tse-dados-abertos-${year}`}, 'production', ${`TSE · Dados Abertos ${year}`}) on conflict (id) do nothing`;
  await sql`insert into source (id, dataset_id, name, type, provider, provider_id, provider_kind, url, status, description)
    values ('src-tse', ${`tse-dados-abertos-${year}`}, 'TSE · Dados Abertos', 'official', 'TSE', 'tse-dados-abertos', 'election', 'https://dadosabertos.tse.jus.br', 'connected', 'Arquivos públicos de resultados e locais de votação.')
    on conflict (id) do nothing`;
  await sql`insert into source_record (id, dataset_id, source_id, provider_id, external_id, schema, content_type, source_url, collected_at, content_hash)
    values (${id}, ${`tse-dados-abertos-${year}`}, 'src-tse', 'tse-dados-abertos', ${path.basename(url)}, 'tse.csv/v1', 'application/zip', ${url}, now(), ${await sha256(file)})
    on conflict (id) do update set collected_at = excluded.collected_at, content_hash = excluded.content_hash`;
}

async function batch(list, size, fn) {
  for (let i = 0; i < list.length; i += size) await fn(list.slice(i, i + size));
}

// 1) Votação por seção ⇒ local
const secFile = download(SECAO);
const secMember = member(secFile, /\.csv$/i);
const places = new Map();
const muns = new Map();
let read = 0;
for await (const r of rows(secFile, secMember)) {
  read++;
  if (Number(r.CD_CARGO) !== 1 || Number(r.NR_TURNO) !== round) continue;
  const mun = Number(r.CD_MUNICIPIO);
  const key = `${mun}|${r.NR_ZONA}|${r.NR_LOCAL_VOTACAO}`;
  let p = places.get(key);
  if (!p) {
    p = { uf: r.SG_UF, mun, zone: Number(r.NR_ZONA), place: Number(r.NR_LOCAL_VOTACAO), name: r.NM_LOCAL_VOTACAO, address: r.DS_LOCAL_VOTACAO_ENDERECO || null, sections: new Set(), votes: {} };
    places.set(key, p);
  }
  p.sections.add(r.NR_SECAO);
  p.votes[r.NR_VOTAVEL] = (p.votes[r.NR_VOTAVEL] ?? 0) + Number(r.QT_VOTOS);
  if (!muns.has(mun)) muns.set(mun, { uf: r.SG_UF, name: r.NM_MUNICIPIO });
}
log("secao.read", { read, places: places.size, municipalities: muns.size });
if (!places.size) throw new Error(`nenhuma seção de Presidente no ${round}º turno em ${path.basename(SECAO)}`);

// 2) Locais: endereço, bairro, coordenadas, eleitorado
const locFile = download(LOCAIS);
const locMember = member(locFile, /BRASIL\.csv$/i);
let withCoords = 0;
for await (const r of rows(locFile, locMember)) {
  const p = places.get(`${Number(r.CD_MUNICIPIO)}|${r.NR_ZONA}|${r.NR_LOCAL_VOTACAO}`);
  if (!p) continue;
  if (p.lat === undefined) {
    p.lat = coord(r.NR_LATITUDE);
    p.lon = coord(r.NR_LONGITUDE);
    if (p.lat === null || p.lon === null) p.lat = p.lon = null;
    else withCoords++;
    p.neighborhood = r.NM_BAIRRO || null;
    p.address ??= r.DS_ENDERECO || null;
    p.electorate = 0;
  }
  p.electorate += num(r.QT_ELEITOR_SECAO) ?? 0;
}
log("locais.read", { withCoords });

// 3) Gravação
const srId = `tse-dados-abertos:votacao_secao:${year}:${round}`;
await provenance(srId, SECAO, secFile);
await provenance(`tse-dados-abertos:locais:${year}`, LOCAIS, locFile);

const terr = [...muns].map(([tse, m]) => ({ id: 100000 + tse, name: m.name, uf: m.uf, parent: m.uf === "ZZ" ? 99 : UF_IBGE[m.uf], tse }));
await batch(terr, 2000, (b) =>
  sql.query(
    `insert into territory (id, level, name, uf, parent_id, tse_code)
     select id, 'municipio', name, uf, parent, tse from jsonb_to_recordset($1::jsonb) as t(id int, name text, uf text, parent int, tse int)
     on conflict (id) do update set name = excluded.name`,
    [JSON.stringify(b)],
  ),
);
const list = [...places.values()];
await batch(list, 1500, (b) =>
  sql.query(
    `insert into polling_place (year, uf, municipality_tse, zone, place, name, address, neighborhood, lat, lon, electorate)
     select $2, uf, mun, zone, place, name, address, neighborhood, lat, lon, electorate
     from jsonb_to_recordset($1::jsonb) as t(uf text, mun int, zone int, place int, name text, address text, neighborhood text, lat numeric, lon numeric, electorate int)
     on conflict (year, municipality_tse, zone, place) do update set name = excluded.name, address = excluded.address, neighborhood = excluded.neighborhood,
       lat = excluded.lat, lon = excluded.lon, electorate = excluded.electorate`,
    [JSON.stringify(b.map((p) => ({ ...p, lat: p.lat ?? null, lon: p.lon ?? null, neighborhood: p.neighborhood ?? null, electorate: p.electorate ?? null, sections: undefined, votes: undefined }))), year],
  ),
);
await batch(list, 1500, (b) =>
  sql.query(
    `insert into place_result (year, round, office_id, municipality_tse, zone, place, sections, votes, source_record_id)
     select $2, $3, 1, mun, zone, place, sections, votes, $4 from jsonb_to_recordset($1::jsonb) as t(mun int, zone int, place int, sections int, votes jsonb)
     on conflict (year, round, office_id, municipality_tse, zone, place) do update set sections = excluded.sections, votes = excluded.votes, source_record_id = excluded.source_record_id`,
    [JSON.stringify(b.map((p) => ({ mun: p.mun, zone: p.zone, place: p.place, sections: p.sections.size, votes: p.votes }))), year, round, srId],
  ),
);
const [chk] = await sql`select count(*)::int as places, sum((select sum(v::bigint) from jsonb_each_text(votes) as e(k, v) where k::int < 90))::bigint as valid
  from place_result where year = ${year} and round = ${round} and office_id = 1`;
log("done", { year, round, ...chk });
