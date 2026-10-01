import { randomUUID } from "node:crypto";
import type { Sql } from "@/persistence/db";
import { BR, MAJORITARIAN, UF_IBGE } from "@/elections/reference";
import { log } from "@/infrastructure/log";
import { seedReference } from "@/elections/tse/importer";
import { countFileUrl, discoverElections, scopesFor, type CountElection } from "./config";
import { normalizeCountFile, type NormalizedCount } from "./normalize";
import { COUNT_PROVIDER_ID, COUNT_SCHEMA, COUNT_SOURCE_ID, type TseCountProvider } from "./provider";

/**
 * WORKER DA APURAÇÃO — incremental, idempotente e tolerante a falhas.
 *   configuração oficial → eleições/cargos → um arquivo por (cargo × abrangência) → RAW → retrato normalizado.
 * Checkpoint por arquivo (ingestion_checkpoint): cursor = hash do conteúdo apurado; mesmo hash ⇒ nada é gravado.
 * Estado da última tentativa em `<stream>:status` (ok | not_published | error:…) ⇒ UI distingue "não coletada"/"indisponível".
 * Granularidade (limite de 512 MB do Neon): majoritários por BR/UF (+ municípios sob opção), proporcionais por UF
 * com apenas o retrato mais recente mantendo a votação por candidatura (cabeçalhos e RAW são preservados).
 */
export interface CountTarget {
  election: CountElection;
  officeId: number;
  uf: string;
  municipality: { tseCode: number; territoryId: number } | null;
}

export interface CountTickOptions {
  year: number;
  round: 1 | 2;
  offices?: number[];
  ufs?: string[];
  /** Coleta municipal (majoritários): ~5 570 arquivos por cargo — desligada por padrão. */
  municipalities?: boolean;
  datasetKind?: "production" | "fixture";
  now?: () => number;
}

export interface CountTickResult {
  runId: string;
  targets: number;
  newSnapshots: number;
  unchanged: number;
  notPublished: number;
  errors: number;
}

/** Intervalo mínimo entre RAWs de arquivos proporcionais (fora dos marcos). */
export const RAW_EVERY_MS = 30 * 60_000;

export const streamOf = (t: Pick<CountTarget, "officeId" | "uf" | "municipality"> & { year: number; round: number }) =>
  `apuracao:${t.year}:${t.round}:${t.officeId}:${t.uf.toLowerCase()}${t.municipality ? String(t.municipality.tseCode).padStart(5, "0") : ""}`;

export async function planTargets(sql: Sql, elections: CountElection[], o: CountTickOptions): Promise<CountTarget[]> {
  const out: CountTarget[] = [];
  const wantUf = (uf: string) => !o.ufs?.length || uf === "BR" || o.ufs.includes(uf);
  for (const e of elections)
    for (const office of e.offices) {
      if (o.offices?.length && !o.offices.includes(office.id)) continue;
      for (const uf of scopesFor(office.id).filter(wantUf)) out.push({ election: e, officeId: office.id, uf, municipality: null });
      if (o.municipalities && MAJORITARIAN.has(office.id)) {
        const muns = (await sql.query("select id, uf, tse_code from territory where level = 'municipio' and tse_code is not null and ($1::text[] = '{}' or uf = any($1::text[])) order by uf, tse_code", [o.ufs ?? []])) as { id: number; uf: string; tse_code: number }[];
        for (const m of muns) if (m.uf !== "ZZ") out.push({ election: e, officeId: office.id, uf: m.uf, municipality: { tseCode: Number(m.tse_code), territoryId: m.id } });
      }
    }
  return out;
}

async function ensureProvenance(sql: Sql, year: number, kind: "production" | "fixture") {
  const datasetId = `tse-apuracao-${year}`;
  await sql`insert into dataset (id, kind, description) values (${datasetId}, ${kind}, ${`Apuração oficial ${year} — sistema de divulgação de resultados do TSE`}) on conflict (id) do nothing`;
  await sql`insert into source (id, dataset_id, name, type, provider, provider_id, provider_kind, url, status, description)
    values (${COUNT_SOURCE_ID}, ${datasetId}, 'TSE · Divulgação de resultados', 'official', 'TSE', ${COUNT_PROVIDER_ID}, 'election', 'https://resultados.tse.jus.br', 'connected', 'Totalização oficial em tempo real (arquivos públicos do sistema de divulgação do TSE).')
    on conflict (id) do update set updated_at = now()`;
  return datasetId;
}

async function setCheckpoint(sql: Sql, stream: string, cursor: string, at: string) {
  await sql`insert into ingestion_checkpoint (provider_id, stream, cursor, updated_at) values (${COUNT_PROVIDER_ID}, ${stream}, ${cursor}, ${at})
    on conflict (provider_id, stream) do update set cursor = excluded.cursor, updated_at = excluded.updated_at`;
}

function territoryOf(t: CountTarget) {
  if (t.municipality) return t.municipality.territoryId;
  return t.uf === "BR" ? BR : UF_IBGE[t.uf];
}

/** Persiste um arquivo já normalizado. Retorna "new" | "unchanged". Idempotente: pode ser reprocessado com segurança. */
export async function persistCount(sql: Sql, t: CountTarget, n: NormalizedCount, file: { url: string; body: string; sha256: string; etag: string | null; lastModified: string | null }, ctx: { datasetId: string; runId: string; collectedAt: string }) {
  if (n.officeId !== t.officeId || n.electionCode !== t.election.code) throw new Error(`arquivo não corresponde ao alvo (cargo ${n.officeId}/${t.officeId}, eleição ${n.electionCode}/${t.election.code})`);
  const stream = streamOf({ ...t, year: t.election.year, round: t.election.round });
  const srId = `${COUNT_PROVIDER_ID}:${stream.slice("apuracao:".length)}`;
  await sql`insert into source_record (id, dataset_id, source_id, provider_id, external_id, schema, source_url, etag, last_modified, published_at, collected_at, content_hash)
    values (${srId}, ${ctx.datasetId}, ${COUNT_SOURCE_ID}, ${COUNT_PROVIDER_ID}, ${stream}, ${COUNT_SCHEMA}, ${file.url}, ${file.etag}, ${file.lastModified}, ${n.generatedAt}, ${ctx.collectedAt}, ${file.sha256})
    on conflict (id) do update set source_url = excluded.source_url, etag = excluded.etag, last_modified = excluded.last_modified, published_at = excluded.published_at, collected_at = excluded.collected_at, content_hash = excluded.content_hash`;
  const [cp] = (await sql`select cursor from ingestion_checkpoint where provider_id = ${COUNT_PROVIDER_ID} and stream = ${stream}`) as { cursor: string | null }[];
  if (cp?.cursor === n.contentHash) return "unchanged" as const;
  const territoryId = territoryOf(t);
  // RAW imutável (uma linha por versão do arquivo). Proporcionais (arquivos de centenas de KB): RAW nos MARCOS —
  // primeiro arquivo, mudança de fase, totalização final e no máximo um a cada RAW_EVERY_MS — para caber no Neon.
  let storeRaw = MAJORITARIAN.has(t.officeId) || n.phase === "final";
  if (!storeRaw) {
    const [last] = (await sql`select s.phase, rr.received_at from count_snapshot s left join raw_record rr on rr.source_record_id = ${srId}
      where s.year = ${t.election.year} and s.round = ${t.election.round} and s.office_id = ${t.officeId} and s.territory_id = ${territoryId}
      order by s.source_generated_at desc, s.id desc, rr.received_at desc nulls last limit 1`) as { phase: string; received_at: string | null }[];
    const lastRaw = (await sql`select max(received_at) as at from raw_record where source_record_id = ${srId}`) as { at: string | null }[];
    storeRaw = !last || last.phase !== n.phase || !lastRaw[0].at || Date.parse(ctx.collectedAt) - Date.parse(lastRaw[0].at) >= RAW_EVERY_MS;
  }
  let rawId: string | null = null;
  if (storeRaw) {
    const ins = (await sql`insert into raw_record (source_record_id, ingestion_run_id, schema_version, provider_version, payload, hash, received_at)
      values (${srId}, ${ctx.runId}, ${COUNT_SCHEMA}, 'resultados.tse.jus.br', ${file.body}::jsonb, ${file.sha256}, ${ctx.collectedAt}) on conflict (source_record_id, hash) do nothing returning id`) as { id: string }[];
    rawId = ins[0]?.id ?? ((await sql`select id from raw_record where source_record_id = ${srId} and hash = ${file.sha256}`) as { id: string }[])[0].id;
  }
  const m = (x: { value: number | null; status: string }) => [x.value, x.status];
  const [snap] = (await sql.query(
    `insert into count_snapshot (year, round, office_id, territory_id, tse_election_code, phase, source_generated_at, source_totalized_at, collected_at,
       sections_total, sections_total_status, sections_counted, sections_counted_status, counted_pct, counted_pct_status, electorate, electorate_status,
       turnout, turnout_status, abstention, abstention_status, valid_votes, valid_votes_status, blank_votes, blank_votes_status, null_votes, null_votes_status,
       content_hash, source_record_id, raw_record_id, ingestion_run_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
     on conflict (year, round, office_id, territory_id, content_hash) do nothing returning id`,
    [t.election.year, t.election.round, t.officeId, territoryId, t.election.code, n.phase, n.generatedAt, n.totalizedAt, ctx.collectedAt,
      ...m(n.sectionsTotal), ...m(n.sectionsCounted), ...m(n.countedPct), ...m(n.electorate), ...m(n.turnout), ...m(n.abstention), ...m(n.validVotes), ...m(n.blankVotes), ...m(n.nullVotes),
      n.contentHash, srId, rawId, ctx.runId],
  )) as { id: string }[];
  if (snap) {
    const rows = n.candidates.map((c) => ({ sq: c.sqCandidato, num: c.ballotNumber, name: c.ballotName, party: c.party, votes: c.votes.value, vs: c.votes.status, pct: c.pct.value, ps: c.pct.status, dest: c.voteDestination, sit: c.situation, el: c.elected }));
    await sql.query(
      `insert into count_candidate (snapshot_id, sq_candidato, candidacy_id, ballot_number, ballot_name, party_acronym, votes, votes_status, pct, pct_status, vote_destination, situation, elected)
       select $1, r.sq, c.id, r.num, r.name, r.party, r.votes, r.vs::value_status, r.pct, r.ps::value_status, r.dest, r.sit, r.el
       from jsonb_to_recordset($2::jsonb) as r(sq bigint, num int, name text, party text, votes int, vs text, pct numeric, ps text, dest text, sit text, el boolean)
       left join candidacy c on c.year = $3 and c.sq_candidato = r.sq
       on conflict (snapshot_id, sq_candidato) do nothing`,
      [snap.id, JSON.stringify(rows), t.election.year],
    );
    // Proporcionais: só o retrato mais recente mantém a votação por candidatura (cabeçalho e RAW permanecem).
    if (!MAJORITARIAN.has(t.officeId))
      await sql`delete from count_candidate where snapshot_id in (select id from count_snapshot where year = ${t.election.year} and round = ${t.election.round} and office_id = ${t.officeId} and territory_id = ${territoryId} and id <> ${snap.id})`;
    if (n.phase !== "not_started") await sql`update election set status = 'results_partial' where year = ${t.election.year} and status in ('scheduled', 'candidacies_only')`;
  }
  await setCheckpoint(sql, stream, n.contentHash, ctx.collectedAt);
  return snap ? ("new" as const) : ("unchanged" as const);
}

/** Uma passada completa (todas as abrangências do escopo). Falha de um arquivo não interrompe os demais. */
export async function countTick(sql: Sql, provider: TseCountProvider, o: CountTickOptions): Promise<CountTickResult> {
  const now = o.now ?? Date.now;
  await seedReference(sql);
  const datasetId = await ensureProvenance(sql, o.year, o.datasetKind ?? "production");
  const runId = randomUUID();
  await sql`insert into ingestion_run (id, dataset_id, provider_id, source_id, kind, status, started_at) values (${runId}, ${datasetId}, ${COUNT_PROVIDER_ID}, ${COUNT_SOURCE_ID}, 'election:count', 'running', ${new Date(now()).toISOString()})`;
  const r: CountTickResult = { runId, targets: 0, newSnapshots: 0, unchanged: 0, notPublished: 0, errors: 0 };
  let message: string | null = null;
  try {
    const elections = discoverElections(await provider.fetchConfig(), o.year, o.round);
    if (!elections.length) message = `configuração oficial sem eleição geral ${o.year} (${o.round}º turno)`;
    const targets = await planTargets(sql, elections, o);
    r.targets = targets.length;
    for (const t of targets) {
      const stream = streamOf({ ...t, year: o.year, round: o.round });
      const url = countFileUrl(t.election, t.officeId, { uf: t.uf, municipalityTseCode: t.municipality?.tseCode });
      try {
        const f = await provider.get(url);
        if (f.status === "not_published") {
          r.notPublished++;
          await setCheckpoint(sql, `${stream}:status`, "not_published", new Date(now()).toISOString());
          continue;
        }
        const n = normalizeCountFile(f.json);
        const res = await persistCount(sql, t, n, f, { datasetId, runId, collectedAt: new Date(now()).toISOString() });
        if (res === "new") r.newSnapshots++;
        else r.unchanged++;
        await setCheckpoint(sql, `${stream}:status`, "ok", new Date(now()).toISOString());
      } catch (e) {
        r.errors++;
        const msg = e instanceof Error ? e.message : String(e);
        await sql`insert into ingestion_error (ingestion_run_id, external_id, code, message) values (${runId}, ${stream}, 'count_file', ${msg.slice(0, 500)})`;
        await setCheckpoint(sql, `${stream}:status`, `error:${msg.slice(0, 200)}`, new Date(now()).toISOString());
      }
    }
  } catch (e) {
    r.errors++;
    message = e instanceof Error ? e.message : String(e);
    await sql`insert into ingestion_error (ingestion_run_id, code, message) values (${runId}, 'count_config', ${message.slice(0, 500)})`;
  }
  const status = r.errors && !r.newSnapshots && !r.unchanged ? "failed" : r.errors ? "partial" : "completed";
  await sql`update ingestion_run set status = ${status}, finished_at = ${new Date(now()).toISOString()}, received_count = ${r.newSnapshots + r.unchanged}, normalized_count = ${r.newSnapshots}, unchanged_count = ${r.unchanged}, error_count = ${r.errors}, message = ${message} where id = ${runId}`;
  log("info", "apuracao.tick", { run: runId, ...r, status });
  return r;
}
