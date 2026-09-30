import { NextResponse } from "next/server";
import { adminEnabled, checkAdmin, controlSql } from "@/control/access";
import { CONTROL_STATUSES, controlHistory, transition, type ControlStatus } from "@/control/debates";

const deny = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Transição de estado: { to, reason }. Inválidas → 409 (validadas no domínio). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!adminEnabled()) return deny(503, "admin desativado");
  if (!checkAdmin(req)) return deny(401, "token inválido");
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => null)) as { to?: string; reason?: string } | null;
  if (!b?.to || !(CONTROL_STATUSES as readonly string[]).includes(b.to)) return deny(400, "status inválido");
  try {
    const c = await transition(controlSql(), id, b.to as ControlStatus, (b.reason ?? "admin").slice(0, 300));
    return NextResponse.json({ data: c });
  } catch (e) {
    return deny(409, e instanceof Error ? e.message : "transição recusada");
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!adminEnabled()) return deny(503, "admin desativado");
  if (!checkAdmin(req)) return deny(401, "token inválido");
  const { id } = await ctx.params;
  return NextResponse.json({ data: await controlHistory(controlSql(), id) }, { headers: { "Cache-Control": "no-store" } });
}
