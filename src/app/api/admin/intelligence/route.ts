import { NextResponse } from "next/server";
import { adminEnabled, checkAdmin, controlSql } from "@/control/access";
import { listMonitors, listSocialSources, markSocialSource, setMonitorStatus, setSocialSourceEnabled, syncSocialSources, upsertMonitor, validateMonitor, type MonitorInput } from "@/control/social";
import { buildSocialProviders } from "@/providers/registry";
import { electionsSummary } from "@/analytics/elections";
import { setManualIdentity } from "@/elections/tse/importer";
import { operationsStatus } from "@/analytics/operations";

const deny = (status: number, message: string) => NextResponse.json({ error: message }, { status });
const guard = (req: Request) => (!adminEnabled() ? deny(503, "admin desativado (ADMIN_TOKEN ausente ou perfil sem banco)") : !checkAdmin(req) ? deny(401, "token inválido") : null);

/** Estado da inteligência: fontes sociais, monitores, importações TSE e fila de identidades não resolvidas. */
export async function GET(req: Request) {
  const g = guard(req);
  if (g) return g;
  const sql = controlSql();
  await syncSocialSources(sql, buildSocialProviders());
  const [ops, sources, monitors, elections, imports, unresolved] = await Promise.all([
    operationsStatus(sql),
    listSocialSources(sql),
    listMonitors(sql),
    electionsSummary(sql),
    sql`select id, year, kind, status, rows_read, rows_written, rows_rejected, error, started_at, finished_at from import_batch order by started_at desc limit 20`,
    sql`select c.id, c.year, c.ballot_name, c.name, c.party_acronym, c.office_id, t.uf from identity_link l join candidacy c on c.id = l.candidacy_id join territory t on t.id = c.territory_id where l.status = 'unresolved' order by c.year desc, c.name limit 50`,
  ]);
  return NextResponse.json({ data: { ops, sources, monitors, elections, imports, unresolved } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const g = guard(req);
  if (g) return g;
  const sql = controlSql();
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return deny(400, "JSON inválido");
  try {
    switch (b.action) {
      case "source_enable":
        await setSocialSourceEnabled(sql, String(b.id), b.enabled === true);
        break;
      case "source_test": {
        const p = buildSocialProviders().find((x) => x.info.platform === b.id);
        if (!p) return deny(404, "fonte desconhecida");
        const h = await p.health();
        await markSocialSource(sql, String(b.id), { ok: h.status === "connected", error: h.status === "connected" ? null : (h.message ?? h.status), status: h.status === "not_configured" ? "requires_authorization" : "error" });
        return NextResponse.json({ data: h });
      }
      case "monitor_upsert": {
        const m = b.monitor as MonitorInput;
        const errs = validateMonitor(m);
        if (errs.length) return deny(400, errs.join("; "));
        await upsertMonitor(sql, m);
        break;
      }
      case "monitor_status":
        await setMonitorStatus(sql, String(b.id), String(b.status) as MonitorInput["status"]);
        break;
      case "identity_manual": {
        const note = String(b.note ?? "").trim();
        if (!note) return deny(400, "justificativa obrigatória");
        await setManualIdentity(sql, Number(b.candidacyId), b.personId === null || b.personId === "" ? null : Number(b.personId), note);
        break;
      }
      default:
        return deny(400, "ação desconhecida");
    }
  } catch (e) {
    return deny(409, e instanceof Error ? e.message : "erro");
  }
  return NextResponse.json({ data: { ok: true } });
}
