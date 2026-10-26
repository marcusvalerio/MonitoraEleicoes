import { after } from "next/server";
import { intelSql } from "@/services/intelligence";
import { listZip, readZipMember } from "@/elections/tse/zip";
import { readBoletim } from "@/elections/tse/bu";
import { takeLease } from "@/elections/apuracao/onDemand";
import { UF_IBGE } from "@/elections/reference";
import { log } from "@/infrastructure/log";

/**
 * 2º turno POR ESCOLA a partir dos Boletins de Urna oficiais (um por seção, publicados pelo TSE na noite da eleição).
 * Etapas (idempotentes, retomáveis): 1) seção → escola pelo cadastro oficial (eleitorado_local_votacao);
 * 2) para cada município ainda sem resultado, lê o BU de cada seção e soma por escola (place_result, turno 2).
 * Cada chamada trabalha ~4 min e encadeia a próxima até terminar; uma concessão no banco impede execuções paralelas.
 */
export const maxDuration = 300;
const YEAR = 2026, ROUND = 2, PLEITO = 3221, ELEICAO = 6258;
const BU = `https://resultados.tse.jus.br/oficial/ele${YEAR}/arquivo-urna/${PLEITO}`;
const LOCAIS = `https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_${YEAR}.zip`;
const BUDGET = 230_000;

type Sql = NonNullable<Awaited<ReturnType<typeof intelSql>>>;

export async function GET(req: Request) {
  const sql = await intelSql();
  if (!sql) return Response.json({ error: "banco indisponível" }, { status: 503 });
  if (!(await takeLease(sql, YEAR, 9200 + ROUND, 200))) return Response.json({ skipped: "importação em andamento" });
  const t0 = Date.now();
  const report: Record<string, unknown> = {};
  try {
    // 1) seção → escola
    const have = new Set(((await sql`select distinct p.uf from section_place s join polling_place p using (year, municipality_tse, zone, place) where s.year = ${YEAR}`) as { uf: string }[]).map((r) => r.uf));
    const missingUf = Object.keys(UF_IBGE).filter((u) => !have.has(u));
    if (missingUf.length) {
      const zip = Buffer.from(await (await fetch(LOCAIS, { signal: AbortSignal.timeout(150_000) })).arrayBuffer());
      const members = listZip(zip);
      for (const uf of missingUf) {
        if (Date.now() - t0 > BUDGET) break;
        const m = members.find((x) => x.name.endsWith(`_${uf}.csv`));
        if (!m) continue;
        report[`secoes_${uf}`] = await loadSections(sql, readZipMember(zip, m));
      }
    } else {
      // 2) boletins de urna por município
      const todo = (await sql`select p.uf, s.municipality_tse as mun from section_place s join polling_place p using (year, municipality_tse, zone, place)
        where s.year = ${YEAR} and not exists (select 1 from place_result r where r.year = ${YEAR} and r.round = ${ROUND} and r.office_id = 1 and r.municipality_tse = s.municipality_tse)
        group by p.uf, s.municipality_tse order by p.uf, s.municipality_tse`) as { uf: string; mun: number }[];
      report.municipios_restantes = todo.length;
      const cs = new Map<string, Map<number, { zone: number; section: number }[]>>();
      let done = 0;
      for (const { uf, mun } of todo) {
        if (Date.now() - t0 > BUDGET) break;
        if (!cs.has(uf)) cs.set(uf, await sectionsOf(uf).catch(() => new Map()));
        const secs = cs.get(uf)!.get(mun) ?? [];
        await importMunicipality(sql, uf, mun, secs);
        done++;
      }
      report.municipios_feitos = done;
      report.fim = done === todo.length;
    }
  } catch (e) {
    log("warn", "importar.turno2.failed", { error: e instanceof Error ? e.message : String(e) });
    report.erro = e instanceof Error ? e.message : String(e);
  }
  // encadeia a próxima etapa enquanto houver trabalho
  if (report.fim !== true) {
    const self = new URL(req.url);
    after(async () => {
      await sql.query("update ingestion_checkpoint set updated_at = now() - interval '1 hour' where stream = $1", [`ondemand:${YEAR}:${9200 + ROUND}`]);
      await fetch(self, { signal: AbortSignal.timeout(5_000) }).catch(() => {});
    });
  }
  return Response.json(report);
}

/** CSV latin1 ';' com aspas → linhas seção/escola (prefere o 2º turno quando o arquivo traz os dois). */
async function loadSections(sql: Sql, csv: Buffer) {
  const lines = new TextDecoder("latin1").decode(csv).split(/\r?\n/);
  const head = split(lines[0]);
  const ix = (k: string) => head.indexOf(k);
  const [iT, iM, iZ, iS, iL] = [ix("NR_TURNO"), ix("CD_MUNICIPIO"), ix("NR_ZONA"), ix("NR_SECAO"), ix("NR_LOCAL_VOTACAO")];
  const rows = new Map<string, { m: number; z: number; s: number; l: number; t: number }>();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = split(lines[i]);
    const r = { m: Number(c[iM]), z: Number(c[iZ]), s: Number(c[iS]), l: Number(c[iL]), t: Number(c[iT]) };
    const k = `${r.m}|${r.z}|${r.s}`;
    const prev = rows.get(k);
    if (!prev || r.t >= prev.t) rows.set(k, r);
  }
  const all = [...rows.values()];
  for (let i = 0; i < all.length; i += 3000) {
    await sql.query(
      `insert into section_place (year, municipality_tse, zone, section, place)
       select $1, x.m, x.z, x.s, x.l from jsonb_to_recordset($2::jsonb) as x(m int, z int, s int, l int)
       on conflict (year, municipality_tse, zone, section) do update set place = excluded.place`,
      [YEAR, JSON.stringify(all.slice(i, i + 3000))],
    );
  }
  return all.length;
}
const split = (line: string) => line.split(";").map((v) => v.replace(/^"|"$/g, ""));

async function sectionsOf(uf: string) {
  const j = await (await fetch(`${BU}/config/${uf.toLowerCase()}/${uf.toLowerCase()}-p00${PLEITO}-cs.json`, { signal: AbortSignal.timeout(60_000) })).json();
  const out = new Map<number, { zone: number; section: number }[]>();
  for (const m of j.abr[0].mu) out.set(Number(m.cd), m.zon.flatMap((z: { cd: string; sec: { ns: string }[] }) => z.sec.map((s) => ({ zone: Number(z.cd), section: Number(s.ns) }))));
  return out;
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

async function boletim(uf: string, mun: number, zone: number, section: number): Promise<Record<string, number> | null> {
  const u = uf.toLowerCase();
  const dir = `${BU}/dados/${u}/${pad(mun, 5)}/${pad(zone, 4)}/${pad(section, 4)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const aux = await (await fetch(`${dir}/p00${PLEITO}-${u}-m${pad(mun, 5)}-z${pad(zone, 4)}-s${pad(section, 4)}-aux.json`, { signal: AbortSignal.timeout(20_000) })).json();
      const h = (aux.hashes as { hash: string; st: string; arq: { nm: string; tp: string }[] }[]).filter((x) => x.arq?.some((a) => a.tp === "bu")).at(-1);
      if (!h) return null;
      const file = h.arq.find((a) => a.tp === "bu")!.nm;
      const r = await fetch(`${dir}/${h.hash}/${file}`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return null;
      return readBoletim(new Uint8Array(await r.arrayBuffer()), ELEICAO);
    } catch {
      await new Promise((ok) => setTimeout(ok, 500 * (attempt + 1)));
    }
  }
  return null;
}

async function importMunicipality(sql: Sql, uf: string, mun: number, secs: { zone: number; section: number }[]) {
  const map = new Map(((await sql`select zone, section, place from section_place where year = ${YEAR} and municipality_tse = ${mun}`) as { zone: number; section: number; place: number }[]).map((r) => [`${r.zone}|${r.section}`, Number(r.place)]));
  const places = new Map<string, { zone: number; place: number; sections: number; votes: Record<string, number> }>();
  let i = 0;
  const worker = async () => {
    while (i < secs.length) {
      const s = secs[i++];
      const place = map.get(`${s.zone}|${s.section}`);
      if (place === undefined) continue;
      const v = await boletim(uf, mun, s.zone, s.section);
      if (!v) continue;
      const k = `${s.zone}|${place}`;
      const p = places.get(k) ?? { zone: s.zone, place, sections: 0, votes: {} };
      p.sections++;
      for (const [n, q] of Object.entries(v)) p.votes[n] = (p.votes[n] ?? 0) + q;
      places.set(k, p);
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  const rows = [...places.values()];
  if (!rows.length) return;
  await sql.query(
    `insert into place_result (year, round, office_id, municipality_tse, zone, place, sections, votes)
     select $1, $2, 1, $3, x.zone, x.place, x.sections, x.votes from jsonb_to_recordset($4::jsonb) as x(zone int, place int, sections int, votes jsonb)
     where exists (select 1 from polling_place p where p.year = $1 and p.municipality_tse = $3 and p.zone = x.zone and p.place = x.place)
     on conflict (year, round, office_id, municipality_tse, zone, place) do update set sections = excluded.sections, votes = excluded.votes`,
    [YEAR, ROUND, mun, JSON.stringify(rows)],
  );
}
