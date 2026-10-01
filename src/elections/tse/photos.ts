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
