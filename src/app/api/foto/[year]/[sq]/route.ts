import { intelSql } from "@/services/intelligence";

/** Foto OFICIAL de candidatura (TSE · Dados Abertos). 404 ⇒ a UI usa monograma. Proveniência nos cabeçalhos. */
export async function GET(req: Request, { params }: { params: Promise<{ year: string; sq: string }> }) {
  const { year, sq } = await params;
  if (!/^\d{4}$/.test(year) || !/^\d{6,15}$/.test(sq)) return new Response("parâmetros inválidos", { status: 400 });
  const sql = await intelSql();
  if (!sql) return new Response("fonte indisponível", { status: 503 });
  const [p] = (await sql`select mime, encode(bytes, 'base64') as b64, sha256, source_url, source_member from candidate_photo where year = ${Number(year)} and sq_candidato = ${sq}`) as { mime: string; b64: string; sha256: string; source_url: string; source_member: string }[];
  if (!p) return new Response("sem foto oficial", { status: 404, headers: { "cache-control": "public, max-age=3600" } });
  const etag = `"${p.sha256}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  return new Response(Buffer.from(p.b64, "base64"), {
    headers: { "content-type": p.mime, "cache-control": "public, max-age=86400, stale-while-revalidate=604800", etag, "x-source": `TSE · ${p.source_url} · ${p.source_member}`, "x-content-type-options": "nosniff" },
  });
}
