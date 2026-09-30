import { NextResponse } from "next/server";
import { adminEnabled, checkAdmin, controlSql } from "@/control/access";
import { setSourceEnabled } from "@/control/sources";
import { G1LiveEditorialProvider } from "@/providers/g1";

const deny = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/**
 * Ações sobre uma fonte: { action: "enable" | "disable" | "test" }.
 * "test" coleta UMA vez e só extrai (não grava nada) — URL restrita à allowlist (sem SSRF).
 */
export async function POST(req: Request, ctx: { params: Promise<{ sid: string }> }) {
  if (!adminEnabled()) return deny(503, "admin desativado");
  if (!checkAdmin(req)) return deny(401, "token inválido");
  const { sid } = await ctx.params;
  const b = (await req.json().catch(() => null)) as { action?: string } | null;
  const sql = controlSql();
  try {
    if (b?.action === "enable" || b?.action === "disable") {
      try {
        await setSourceEnabled(sql, sid, b.action === "enable");
      } catch (e) {
        return deny(409, e instanceof Error ? e.message : "recusado");
      }
      return NextResponse.json({ data: { id: sid, enabled: b.action === "enable" } });
    }
    if (b?.action === "test") {
      const rows = (await sql`select debate_id, source_url from debate_source where id = ${sid}`) as { debate_id: string; source_url: string | null }[];
      if (!rows[0]) return deny(404, "fonte não cadastrada");
      if (!rows[0].source_url) return deny(409, "URL pendente");
      const t0 = Date.now();
      const p = new G1LiveEditorialProvider({ debateId: rows[0].debate_id, sourceUrl: rows[0].source_url });
      const page = await p.fetchUpdates();
      const times = page.items.map((r) => r.publishedAt).filter((x): x is string => !!x).sort();
      return NextResponse.json({ data: { ok: true, ms: Date.now() - t0, updates: page.items.length, strategy: p.lastSnapshot()?.strategy ?? null, latestPublishedAt: times.at(-1) ?? null } });
    }
    return deny(400, "ação inválida");
  } catch (e) {
    return NextResponse.json({ data: { ok: false, error: e instanceof Error ? e.message : String(e) } }, { status: 200 });
  }
}
