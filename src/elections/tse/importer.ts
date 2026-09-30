import { createHmac, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { Sql } from "@/persistence/db";
import { log } from "@/infrastructure/log";
import { tseNull, tseRows } from "./csv";
import { BR, EXTERIOR, MAJORITARIAN, OFFICE_IDS, OFFICES, REGIONS, UF_IBGE, UF_NAME, municipalityTerritory, normalizeName, regionOfUf, ufTerritory } from "../reference";

/**
 * IMPORTADOR TSE (Dados Abertos). Fontes oficiais:
 *   candidatos: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_<ANO>.zip
 *   resultados: https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_<ANO>.zip
 * Privacidade: CPF e título eleitoral NUNCA são gravados; só HMAC-SHA256 com IDENTITY_HASH_KEY (para vincular ciclos).
 * Agregação: majoritários por município; proporcionais por UF (plano de armazenamento — docs/ELECTION-HISTORY.md).
 */
export const TSE_BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele";
export const candidaciesUrl = (y: number) => `${TSE_BASE}/consulta_cand/consulta_cand_${y}.zip`;
export const resultsUrl = (y: number) => `${TSE_BASE}/votacao_candidato_munzona/votacao_candidato_munzona_${y}.zip`;

type Row = Record<string, unknown>;
async function bulk(sql: Sql, table: string, cols: [string, string][], rows: Row[], conflict: string, returning = "", chunk = 2000) {
  const out: Row[] = [];
  const names = cols.map((c) => c[0]).join(", ");
  const defs = cols.map(([n, t]) => `${n} ${t}`).join(", ");
  for (let i = 0; i < rows.length; i += chunk) {
    const q = `insert into ${table} (${names}) select ${names} from jsonb_to_recordset($1::jsonb) as x(${defs}) ${conflict}${returning ? ` returning ${returning}` : ""}`;
    out.push(...((await sql.query(q, [JSON.stringify(rows.slice(i, i + chunk))])) as Row[]));
  }
  return out;
}

const hmac = (key: string | undefined, kind: string, v: string | null) => (key && v && /^\d{6,}$/.test(v) ? createHmac("sha256", key).update(`${kind}:${v}`).digest("hex") : null);

/** Referência fixa: eleições, turnos, cargos, Brasil/regiões/UFs/Exterior (idempotente). */
export async function seedReference(sql: Sql) {
  await bulk(sql, "election", [["year", "smallint"], ["name", "text"], ["election_type", "text"], ["status", "text"], ["source", "text"]],
    [2014, 2018, 2022, 2026].map((y) => ({ year: y, name: `Eleições Gerais ${y}`, election_type: "geral", status: y === 2026 ? "candidacies_only" : "scheduled", source: "TSE · Dados Abertos (dadosabertos.tse.jus.br)" })),
    "on conflict (year) do nothing");
  await bulk(sql, "election_round", [["year", "smallint"], ["round", "smallint"]], [2014, 2018, 2022, 2026].flatMap((y) => [1, 2].map((r) => ({ year: y, round: r }))), "on conflict do nothing");
  await bulk(sql, "office", [["id", "smallint"], ["slug", "text"], ["name", "text"], ["scope", "text"]], OFFICES.map((o) => ({ id: o.id, slug: o.slug, name: o.name, scope: o.scope })), "on conflict (id) do nothing");
  const terr: Row[] = [{ id: BR, level: "pais", name: "Brasil", uf: null, parent_id: null }];
  for (const r of REGIONS) terr.push({ id: r.id, level: "regiao", name: r.name, uf: null, parent_id: BR });
  for (const [uf, code] of Object.entries(UF_IBGE)) terr.push({ id: code, level: "uf", name: UF_NAME[uf], uf, parent_id: regionOfUf(uf), ibge_code: code });
  terr.push({ id: EXTERIOR, level: "uf", name: "Exterior", uf: "ZZ", parent_id: BR });
  await bulk(sql, "territory", [["id", "int"], ["level", "text"], ["name", "text"], ["uf", "text"], ["parent_id", "int"], ["ibge_code", "int"]], terr, "on conflict (id) do nothing");
}

async function startBatch(sql: Sql, year: number, kind: string, url: string, sha256: string | null) {
  const id = randomUUID();
  await sql`insert into import_batch (id, year, kind, source_url, file_sha256, status) values (${id}, ${year}, ${kind}, ${url}, ${sha256}, 'running')`;
  return id;
}
async function finishBatch(sql: Sql, id: string, c: { read: number; written: number; rejected: number; error?: string }) {
  await sql`update import_batch set status = ${c.error ? "failed" : "completed"}, rows_read = ${c.read}, rows_written = ${c.written}, rows_rejected = ${c.rejected}, error = ${c.error ?? null}, finished_at = now() where id = ${id}`;
}
async function sourceRecord(sql: Sql, o: { datasetId: string; datasetKind: string; kind: string; year: number; url: string; sha256: string | null }) {
  await sql`insert into dataset (id, kind, description) values (${o.datasetId}, ${o.datasetKind}, 'Histórico eleitoral oficial (TSE · Dados Abertos)') on conflict (id) do nothing`;
  await sql`insert into source (id, dataset_id, name, type, provider, provider_id, provider_kind, url, status, description)
    values ('src-tse', ${o.datasetId}, 'TSE · Dados Abertos', 'official', 'TSE', 'tse-dados-abertos', 'election', 'https://dadosabertos.tse.jus.br', 'connected', 'Candidaturas e resultados oficiais por município/zona (arquivos públicos).')
    on conflict (id) do update set status = 'connected', description = excluded.description`;
  const id = `tse:${o.kind}:${o.year}`;
  await sql`insert into source_record (id, dataset_id, source_id, provider_id, external_id, schema, content_type, source_url, collected_at, content_hash)
    values (${id}, ${o.datasetId}, 'src-tse', 'tse-dados-abertos', ${`${o.kind}_${o.year}`}, ${`tse.${o.kind}/csv`}, 'application/zip', ${o.url}, now(), ${o.sha256 ?? "desconhecido"})
    on conflict (provider_id, external_id) do update set content_hash = excluded.content_hash, collected_at = excluded.collected_at`;
  return id;
}

export interface ImportOptions {
  datasetId?: string;
  datasetKind?: "production" | "fixture" | "validation";
  url?: string;
  sha256?: string | null;
  hmacKey?: string;
}

/** Candidaturas (consulta_cand): uma por SQ_CANDIDATO; situação por turno; partido por ciclo. */
export async function importCandidacies(sql: Sql, year: number, input: Readable, o: ImportOptions = {}) {
  await seedReference(sql);
  const url = o.url ?? candidaciesUrl(year);
  const batch = await startBatch(sql, year, "candidacies", url, o.sha256 ?? null);
  const rec = await sourceRecord(sql, { datasetId: o.datasetId ?? "tse-oficial", datasetKind: o.datasetKind ?? "production", kind: "consulta_cand", year, url, sha256: o.sha256 ?? null });
  const cands = new Map<string, Row>();
  const parties = new Map<number, Row>();
  let read = 0;
  let rejected = 0;
  try {
    for await (const r of tseRows(input)) {
      read++;
      const office = Number(r.CD_CARGO);
      if (Number(r.ANO_ELEICAO) !== year || !OFFICE_IDS.has(office)) continue;
      const terr = ufTerritory(r.SG_UF === "BR" || office === 1 ? "BR" : r.SG_UF);
      if (terr === null || !r.SQ_CANDIDATO) {
        rejected++;
        continue;
      }
      const round = Number(r.NR_TURNO);
      const key = r.SQ_CANDIDATO;
      const prev = cands.get(key);
      const status = tseNull(r.DS_SIT_TOT_TURNO);
      const partyNumber = Number(tseNull(r.NR_PARTIDO)) || null;
      const c = prev ?? {
        year,
        sq_candidato: key,
        office_id: office,
        territory_id: terr,
        ballot_number: Number(tseNull(r.NR_CANDIDATO)) || null,
        name: r.NM_CANDIDATO,
        ballot_name: r.NM_URNA_CANDIDATO,
        normalized_name: normalizeName(r.NM_CANDIDATO),
        party_number: partyNumber,
        party_acronym: tseNull(r.SG_PARTIDO),
        coalition: tseNull(r.NM_COLIGACAO),
        federation: tseNull(r.NM_FEDERACAO),
        situation: tseNull(r.DS_SITUACAO_CANDIDATURA),
        status_round1: null,
        status_round2: null,
        title_hmac: hmac(o.hmacKey, "titulo", tseNull(r.NR_TITULO_ELEITORAL_CANDIDATO)),
        cpf_hmac: hmac(o.hmacKey, "cpf", tseNull(r.NR_CPF_CANDIDATO)),
        source_record_id: rec,
      };
      if (round === 2) c.status_round2 = status;
      else c.status_round1 = status;
      cands.set(key, c);
      if (partyNumber && tseNull(r.SG_PARTIDO)) parties.set(partyNumber, { year, number: partyNumber, acronym: r.SG_PARTIDO, name: r.NM_PARTIDO, federation: tseNull(r.NM_FEDERACAO) });
    }
    await bulk(sql, "party_registration", [["year", "smallint"], ["number", "smallint"], ["acronym", "text"], ["name", "text"], ["federation", "text"]], [...parties.values()], "on conflict (year, number) do update set acronym = excluded.acronym, name = excluded.name, federation = excluded.federation");
    const cols: [string, string][] = [["year", "smallint"], ["sq_candidato", "bigint"], ["office_id", "smallint"], ["territory_id", "int"], ["ballot_number", "int"], ["name", "text"], ["ballot_name", "text"], ["normalized_name", "text"], ["party_number", "smallint"], ["party_acronym", "text"], ["coalition", "text"], ["federation", "text"], ["situation", "text"], ["status_round1", "text"], ["status_round2", "text"], ["title_hmac", "text"], ["cpf_hmac", "text"], ["source_record_id", "text"]];
    await bulk(sql, "candidacy", cols, [...cands.values()], `on conflict (year, sq_candidato) do update set name = excluded.name, ballot_name = excluded.ballot_name, normalized_name = excluded.normalized_name, party_number = excluded.party_number, party_acronym = excluded.party_acronym,
       coalition = excluded.coalition, federation = excluded.federation, situation = excluded.situation, status_round1 = excluded.status_round1, status_round2 = excluded.status_round2,
       title_hmac = coalesce(excluded.title_hmac, candidacy.title_hmac), cpf_hmac = coalesce(excluded.cpf_hmac, candidacy.cpf_hmac)`);
    await finishBatch(sql, batch, { read, written: cands.size, rejected });
    log("info", "tse.candidacies.imported", { year, read, written: cands.size, rejected, parties: parties.size });
    return { read, written: cands.size, rejected, batch };
  } catch (e) {
    await finishBatch(sql, batch, { read, written: 0, rejected, error: (e as Error).message });
    throw e;
  }
}

/**
 * Resultados (votacao_candidato_munzona): soma QT_VOTOS_NOMINAIS_VALIDOS por zona ⇒ município (majoritários) ou UF (proporcionais).
 * Candidaturas desconhecidas (não importadas) são contadas como rejeitadas — nunca criadas a partir do arquivo de votos.
 */
export async function importResults(sql: Sql, year: number, inputs: AsyncIterable<Readable> | Readable[], o: ImportOptions = {}) {
  await seedReference(sql);
  const url = o.url ?? resultsUrl(year);
  const batch = await startBatch(sql, year, "results", url, o.sha256 ?? null);
  await sourceRecord(sql, { datasetId: o.datasetId ?? "tse-oficial", datasetKind: o.datasetKind ?? "production", kind: "votacao_candidato_munzona", year, url, sha256: o.sha256 ?? null });
  const ids = new Map((((await sql`select id, sq_candidato::text as sq from candidacy where year = ${year}`) as { id: number; sq: string }[]).map((r) => [r.sq, r.id])));
  const agg = new Map<string, { round: number; office: number; cand: number; terr: number; votes: number }>();
  const munis = new Map<number, Row>();
  let read = 0;
  let rejected = 0;
  let voteColumn: string | null = null;
  try {
    for await (const input of inputs as AsyncIterable<Readable>) {
      for await (const r of tseRows(input)) {
        read++;
        const office = Number(r.CD_CARGO);
        if (Number(r.ANO_ELEICAO) !== year || !OFFICE_IDS.has(office)) continue;
        const cand = ids.get(r.SQ_CANDIDATO);
        // 2018+: QT_VOTOS_NOMINAIS_VALIDOS. 2014: a coluna não existe ⇒ QT_VOTOS_NOMINAIS (pode incluir votos de
        // candidaturas depois anuladas — limitação registrada no lote e em docs/ELECTION-HISTORY.md).
        const hasValid = r.QT_VOTOS_NOMINAIS_VALIDOS !== undefined;
        voteColumn ??= hasValid ? "QT_VOTOS_NOMINAIS_VALIDOS" : "QT_VOTOS_NOMINAIS";
        const votes = Number(hasValid ? r.QT_VOTOS_NOMINAIS_VALIDOS : r.QT_VOTOS_NOMINAIS);
        if (!cand || !Number.isFinite(votes)) {
          rejected++;
          continue;
        }
        let terr: number | null;
        if (MAJORITARIAN.has(office)) {
          const code = Number(r.CD_MUNICIPIO);
          terr = municipalityTerritory(code);
          if (!munis.has(terr)) munis.set(terr, { id: terr, level: "municipio", name: r.NM_MUNICIPIO, uf: r.SG_UF, parent_id: ufTerritory(r.SG_UF), tse_code: code });
        } else terr = ufTerritory(r.SG_UF);
        if (terr === null) {
          rejected++;
          continue;
        }
        const round = Number(r.NR_TURNO);
        const k = `${round}|${cand}|${terr}`;
        const a = agg.get(k);
        if (a) a.votes += votes;
        else agg.set(k, { round, office, cand, terr, votes });
      }
    }
    await bulk(sql, "territory", [["id", "int"], ["level", "text"], ["name", "text"], ["uf", "text"], ["parent_id", "int"], ["tse_code", "int"]], [...munis.values()], "on conflict (id) do update set name = excluded.name");
    const rows = [...agg.values()].map((a) => ({ year, round: a.round, office_id: a.office, candidacy_id: a.cand, territory_id: a.terr, votes: a.votes, votes_status: "value" }));
    await bulk(sql, "result_candidacy", [["year", "smallint"], ["round", "smallint"], ["office_id", "smallint"], ["candidacy_id", "int"], ["territory_id", "int"], ["votes", "int"], ["votes_status", "value_status"]], rows, "on conflict (year, round, candidacy_id, territory_id) do update set votes = excluded.votes, votes_status = excluded.votes_status", "", 5000);
    await sql`update election set status = 'results_official', imported_at = now() where year = ${year}`;
    await finishBatch(sql, batch, { read, written: rows.length, rejected });
    await sql`update import_batch set error = ${voteColumn === "QT_VOTOS_NOMINAIS" ? "nota: coluna QT_VOTOS_NOMINAIS (arquivo sem QT_VOTOS_NOMINAIS_VALIDOS)" : null} where id = ${batch}`;
    log("info", "tse.results.imported", { year, read, written: rows.length, rejected, municipalities: munis.size, vote_column: voteColumn });
    return { read, written: rows.length, rejected, batch, voteColumn };
  } catch (e) {
    await finishBatch(sql, batch, { read, written: 0, rejected, error: (e as Error).message });
    throw e;
  }
}

/**
 * IDENTIDADE HISTÓRICA: vincula candidaturas de ciclos diferentes à mesma pessoa SOMENTE por identificador forte
 * (HMAC do título eleitoral; na falta, do CPF). Sem identificador ⇒ `unresolved` (revisão manual no admin).
 * Nunca por nome. Vínculos manuais existentes não são tocados.
 */
export async function resolveIdentities(sql: Sql) {
  const rows = (await sql`select c.id, c.name, c.year, c.title_hmac, c.cpf_hmac from candidacy c
    left join identity_link l on l.candidacy_id = c.id where l.candidacy_id is null or l.status = 'unresolved' order by c.year desc`) as { id: number; name: string; year: number; title_hmac: string | null; cpf_hmac: string | null }[];
  const existing = (await sql`select c.title_hmac, c.cpf_hmac, l.person_id from identity_link l join candidacy c on c.id = l.candidacy_id where l.person_id is not null`) as { title_hmac: string | null; cpf_hmac: string | null; person_id: number }[];
  const byTitle = new Map(existing.filter((e) => e.title_hmac).map((e) => [e.title_hmac!, e.person_id]));
  const byCpf = new Map(existing.filter((e) => e.cpf_hmac).map((e) => [e.cpf_hmac!, e.person_id]));
  const newPersons = new Map<string, { name: string; key: string }>();
  for (const r of rows) {
    const key = r.title_hmac ? `t:${r.title_hmac}` : r.cpf_hmac ? `c:${r.cpf_hmac}` : null;
    if (!key || byTitle.has(r.title_hmac ?? "") || byCpf.has(r.cpf_hmac ?? "") || newPersons.has(key)) continue;
    newPersons.set(key, { name: r.name, key });
  }
  const created = await bulk(sql, "person", [["canonical_name", "text"]], [...newPersons.values()].map((p) => ({ canonical_name: p.name })), "", "id");
  [...newPersons.values()].forEach((p, i) => {
    const pid = Number(created[i].id);
    if (p.key.startsWith("t:")) byTitle.set(p.key.slice(2), pid);
    else byCpf.set(p.key.slice(2), pid);
  });
  const links = rows.map((r) => {
    const byT = r.title_hmac ? byTitle.get(r.title_hmac) : undefined;
    const byC = !byT && r.cpf_hmac ? byCpf.get(r.cpf_hmac) : undefined;
    const pid = byT ?? byC ?? null;
    return pid
      ? { candidacy_id: r.id, person_id: pid, status: "resolved", method: byT ? "title_hmac" : "cpf_hmac", confidence: "high", note: null }
      : { candidacy_id: r.id, person_id: null, status: "unresolved", method: "none", confidence: "unknown", note: "sem identificador oficial divulgável; requer revisão manual" };
  });
  await bulk(sql, "identity_link", [["candidacy_id", "int"], ["person_id", "int"], ["status", "text"], ["method", "text"], ["confidence", "text"], ["note", "text"]], links,
    "on conflict (candidacy_id) do update set person_id = excluded.person_id, status = excluded.status, method = excluded.method, confidence = excluded.confidence, note = excluded.note where identity_link.status not in ('manual', 'rejected')");
  const resolved = links.filter((l) => l.status === "resolved").length;
  log("info", "tse.identity.resolved", { candidacies: links.length, resolved, unresolved: links.length - resolved, persons_created: created.length });
  return { candidacies: links.length, resolved, unresolved: links.length - resolved, personsCreated: created.length };
}

/** Vínculo manual (admin): associa ou separa uma candidatura de uma pessoa. */
export async function setManualIdentity(sql: Sql, candidacyId: number, personId: number | null, note: string) {
  if (personId === null)
    await sql`insert into identity_link (candidacy_id, person_id, status, method, confidence, note, reviewed_at) values (${candidacyId}, null, 'rejected', 'manual', 'unknown', ${note}, now())
      on conflict (candidacy_id) do update set person_id = null, status = 'rejected', method = 'manual', confidence = 'unknown', note = excluded.note, reviewed_at = now()`;
  else
    await sql`insert into identity_link (candidacy_id, person_id, status, method, confidence, note, reviewed_at) values (${candidacyId}, ${personId}, 'manual', 'manual', 'high', ${note}, now())
      on conflict (candidacy_id) do update set person_id = excluded.person_id, status = 'manual', method = 'manual', confidence = 'high', note = excluded.note, reviewed_at = now()`;
}
