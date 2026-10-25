import { createHash } from "node:crypto";
import type { Sql } from "@/persistence/db";
import { log } from "@/infrastructure/log";
import { MAJORITARIAN } from "@/elections/reference";

/**
 * FOTOS OFICIAIS de candidatura — TSE · Dados Abertos (pacote candidatos-<ano>, arquivos foto_cand<ano>_<UF>_div.zip).
 * Nome do membro: F<UF><SQ_CANDIDATO>_div.jpg ⇒ vínculo direto com candidacy.sq_candidato.
 * Por orçamento de armazenamento (Neon 512 MB) guardamos só cargos majoritários (Presidente, Governador, Senador);
 * demais cargos usam monograma na UI (nunca imagem de outra origem).
 */
export const photosUrl = (year: number, uf: string) => `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes${year}/fotos/foto_cand${year}_${uf.toUpperCase()}_div.zip`;
export const MEMBER_RE = /^F([A-Z]{2})(\d{6,15})_div\.(jpe?g|png)$/i;

export interface PhotoEntry {
  member: string;
  bytes: Buffer;
}

/** SQs de cargos majoritários do ano (os únicos cujas fotos guardamos). */
export async function wantedSqs(sql: Sql, year: number) {
  const rows = (await sql.query("select sq_candidato::text as sq from candidacy where year = $1 and office_id = any($2::int[])", [year, [...MAJORITARIAN]])) as { sq: string }[];
  return new Set(rows.map((r) => r.sq));
}

export async function importPhotos(sql: Sql, year: number, entries: Iterable<PhotoEntry>, o: { sourceUrl: string; zipSha256?: string | null; wanted: Set<string> }) {
  let read = 0;
  let written = 0;
  let skipped = 0;
  for (const e of entries) {
    read++;
    const m = MEMBER_RE.exec(e.member.split("/").pop() ?? "");
    if (!m || !o.wanted.has(m[2])) {
      skipped++;
      continue;
    }
    const mime = m[3].toLowerCase() === "png" ? "image/png" : "image/jpeg";
    // assinatura do arquivo (JPEG FFD8 / PNG 89504E47) — rejeita conteúdo que não seja imagem
    const sig = e.bytes.subarray(0, 4).toString("hex");
    if (!(sig.startsWith("ffd8") || sig === "89504e47") || e.bytes.length > 2_000_000) {
      skipped++;
      continue;
    }
    const sha = createHash("sha256").update(e.bytes).digest("hex");
    await sql.query(
      `insert into candidate_photo (year, sq_candidato, mime, bytes, sha256, source_url, source_member, source_zip_sha256)
       values ($1, $2, $3, decode($4, 'base64'), $5, $6, $7, $8)
       on conflict (year, sq_candidato) do update set mime = excluded.mime, bytes = excluded.bytes, sha256 = excluded.sha256,
         source_url = excluded.source_url, source_member = excluded.source_member, source_zip_sha256 = excluded.source_zip_sha256, collected_at = now()
       where candidate_photo.sha256 <> excluded.sha256`,
      [year, m[2], mime, e.bytes.toString("base64"), sha, o.sourceUrl, e.member, o.zipSha256 ?? null],
    );
    written++;
  }
  log("info", "tse.photos.imported", { year, read, written, skipped, source: o.sourceUrl });
  return { read, written, skipped };
}

/** Pacotes oficiais baixados por instância (um download por UF/ano, reaproveitado por 30 min; falha expira em 5 min). */
const zips = new Map<string, { at: number; ttl: number; zip: Promise<Buffer | null> }>();

async function officialZip(url: string, fetchImpl: typeof fetch): Promise<Buffer | null> {
  const hit = zips.get(url);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.zip;
  const entry = { at: Date.now(), ttl: 30 * 60_000, zip: Promise.resolve<Buffer | null>(null) };
  entry.zip = (async () => {
    try {
      const res = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
      const len = Number(res.headers.get("content-length") ?? 0);
      if (!res.ok || len > 80_000_000) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      entry.ttl = 5 * 60_000;
      log("warn", "tse.photos.fetch_failed", { url, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  })();
  zips.set(url, entry);
  return entry.zip;
}

/**
 * Foto oficial sob demanda: candidatura majoritária ainda sem foto no banco ⇒ busca o membro F<UF><SQ>_div no pacote
 * oficial do TSE, valida e grava (mesma rotina do importador, com proveniência). Sem pacote/membro ⇒ false (monograma).
 */
export async function fetchOfficialPhoto(sql: Sql, year: number, sq: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const [scope] = (await sql`select s.office_id, t.uf from count_candidate cc join count_snapshot s on s.id = cc.snapshot_id join territory t on t.id = s.territory_id
    where s.year = ${year} and cc.sq_candidato = ${sq} order by s.office_id limit 1`) as { office_id: number; uf: string | null }[];
  if (!scope || !MAJORITARIAN.has(scope.office_id)) return false;
  const uf = scope.office_id === 1 ? "BR" : scope.uf;
  if (!uf || !/^[A-Z]{2}$/.test(uf)) return false;
  const url = photosUrl(year, uf);
  const zip = await officialZip(url, fetchImpl);
  if (!zip) return false;
  const { listZip, readZipMember } = await import("./zip");
  const member = listZip(zip).find((m) => {
    const r = MEMBER_RE.exec(m.name.split("/").pop() ?? "");
    return r && r[2] === sq;
  });
  if (!member) return false;
  const res = await importPhotos(sql, year, [{ member: member.name, bytes: readZipMember(zip, member) }], { sourceUrl: url, zipSha256: createHash("sha256").update(zip).digest("hex"), wanted: new Set([sq]) });
  return res.written > 0;
}
