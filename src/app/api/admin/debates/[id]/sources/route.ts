import { NextResponse } from "next/server";
import { adminEnabled, checkAdmin, controlSql } from "@/control/access";
import { listSources, upsertSource, validateSource } from "@/control/sources";

const deny = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Fontes editoriais de um debate: listar (GET) e cadastrar/configurar (POST). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!adminEnabled()) return deny(503, "admin desativado");
  if (!checkAdmin(req)) return deny(401, "token inválido");
  const { id } = await ctx.params;
  return NextResponse.json({ data: await listSources(controlSql(), id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!adminEnabled()) return deny(503, "admin desativado");
  if (!checkAdmin(req)) return deny(401, "token inválido");
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return deny(400, "JSON inválido");
  const input = { debateId: id, providerId: String(b.providerId ?? "g1-live-editorial"), sourceUrl: b.sourceUrl ? String(b.sourceUrl) : null, pollingIntervalMs: Number(b.pollingIntervalMs ?? 15000), enabled: b.enabled === true };
  const errs = validateSource(input);
  if (errs.length) return deny(400, errs.join("; "));
  await upsertSource(controlSql(), input);
  return NextResponse.json({ data: (await listSources(controlSql(), id)).find((s) => s.providerId === input.providerId) }, { status: 201 });
}
