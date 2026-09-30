import { NextResponse } from "next/server";
import { adminEnabled, checkAdmin, controlSql } from "@/control/access";
import { createControl, listControls, validateControl, type NewDebateControl } from "@/control/debates";

const deny = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function GET(req: Request) {
  if (!adminEnabled()) return deny(503, "admin desativado (ADMIN_TOKEN ausente ou perfil sem banco)");
  if (!checkAdmin(req)) return deny(401, "token inválido");
  return NextResponse.json({ data: await listControls(controlSql()) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!adminEnabled()) return deny(503, "admin desativado (ADMIN_TOKEN ausente ou perfil sem banco)");
  if (!checkAdmin(req)) return deny(401, "token inválido");
  const b = (await req.json().catch(() => null)) as Partial<NewDebateControl> | null;
  if (!b) return deny(400, "JSON inválido");
  const c: NewDebateControl = {
    id: String(b.id ?? ""),
    title: String(b.title ?? ""),
    officeLabel: String(b.officeLabel ?? ""),
    jurisdiction: b.jurisdiction ? String(b.jurisdiction) : null,
    scheduledStart: String(b.scheduledStart ?? ""),
    sourceName: String(b.sourceName ?? ""),
    sourceUrl: b.sourceUrl ? String(b.sourceUrl) : null,
    providerId: String(b.providerId ?? ""),
    sourceMode: b.sourceMode === "live" || b.sourceMode === "file" ? b.sourceMode : "replay",
    replayOf: b.replayOf ? String(b.replayOf) : null,
    replaySpeed: b.replaySpeed ? (Number(b.replaySpeed) as NewDebateControl["replaySpeed"]) : null,
    candidates: Array.isArray(b.candidates) ? b.candidates.map(String) : [],
  };
  const errs = validateControl(c);
  if (errs.length) return deny(400, errs.join("; "));
  try {
    await createControl(controlSql(), c);
  } catch (e) {
    return deny(409, e instanceof Error ? e.message : "erro ao cadastrar");
  }
  return NextResponse.json({ data: { id: c.id, status: "scheduled" } }, { status: 201 });
}
