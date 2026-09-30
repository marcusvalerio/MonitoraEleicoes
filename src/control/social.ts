import type { Sql } from "@/persistence/db";
import type { SocialListeningProvider } from "@/providers/contracts";
import { PLATFORM_MATRIX } from "@/providers/social/catalog";
import type { SocialMonitor } from "@/domain/social";
import { PLATFORM_IDS, UFS } from "@/domain/filters";

/**
 * Fontes sociais e monitores configuráveis por dados. O estado de acesso de cada plataforma é gravado
 * exatamente como é (requires_authorization / unsupported / configured / active / error) — o dashboard o exibe.
 */
export async function syncSocialSources(sql: Sql, providers: SocialListeningProvider[]) {
  for (const e of PLATFORM_MATRIX) {
    const p = providers.find((x) => x.info.platform === e.platform);
    const st = p ? p.accessStatus() : { status: e.defaultStatus, reason: e.limitations };
    await sql`insert into social_source (id, platform, name, access_status, enabled, capabilities, notes, docs_url)
      values (${e.platform}, ${e.platform}, ${e.name}, ${st.status}, false, ${JSON.stringify(e.capabilities)}::jsonb, ${`${e.api} · ${e.auth} · ${e.cost}. ${e.limitations}`}, ${e.docsUrl})
      on conflict (id) do update set name = excluded.name, capabilities = excluded.capabilities, notes = excluded.notes, docs_url = excluded.docs_url,
        access_status = case when social_source.access_status in ('active', 'error') and excluded.access_status = 'configured' then social_source.access_status else excluded.access_status end,
        updated_at = now()`;
  }
}

export interface SocialSourceRow {
  id: string;
  platform: string;
  name: string;
  accessStatus: string;
  enabled: boolean;
  capabilities: Record<string, unknown>;
  notes: string;
  docsUrl: string | null;
  quota: Record<string, unknown> | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}
type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export async function listSocialSources(sql: Sql): Promise<SocialSourceRow[]> {
  return ((await sql`select * from social_source order by (access_status = 'active') desc, enabled desc, id`) as Row[]).map((r) => ({
    id: r.id as string,
    platform: r.platform as string,
    name: r.name as string,
    accessStatus: r.access_status as string,
    enabled: r.enabled as boolean,
    capabilities: r.capabilities as Record<string, unknown>,
    notes: r.notes as string,
    docsUrl: (r.docs_url as string) ?? null,
    quota: (r.quota as Record<string, unknown>) ?? null,
    lastSuccessAt: iso(r.last_success_at),
    lastErrorAt: iso(r.last_error_at),
    lastError: (r.last_error as string) ?? null,
  }));
}

export async function setSocialSourceEnabled(sql: Sql, id: string, enabled: boolean) {
  const [s] = (await sql`select access_status from social_source where id = ${id}`) as { access_status: string }[];
  if (!s) throw new Error(`fonte social desconhecida: ${id}`);
  if (enabled && !["configured", "active", "error"].includes(s.access_status)) throw new Error(`fonte '${id}' sem acesso (${s.access_status}) não pode ser ativada`);
  await sql`update social_source set enabled = ${enabled}, updated_at = now() where id = ${id}`;
}

export async function markSocialSource(sql: Sql, id: string, r: { ok: boolean; error?: string | null; quotaUsed?: number | null; status?: string }) {
  if (r.ok) await sql`update social_source set access_status = 'active', last_success_at = now(), last_error = null, quota = jsonb_build_object('last_run_units', ${r.quotaUsed ?? null}::int, 'at', now()), updated_at = now() where id = ${id}`;
  else await sql`update social_source set access_status = case when ${r.status ?? "error"} = 'requires_authorization' then 'requires_authorization' else 'error' end, last_error = ${(r.error ?? "falha").slice(0, 500)}, last_error_at = now(), updated_at = now() where id = ${id}`;
}

// ───────── Monitores ─────────
export type MonitorInput = Omit<SocialMonitor, "lastRunAt" | "lastError">;

export function validateMonitor(m: MonitorInput): string[] {
  const e: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(m.id)) e.push("id: minúsculas, números e hífen");
  if (!m.name.trim()) e.push("nome obrigatório");
  if (!m.terms.length || m.terms.some((t) => t.trim().length < 3 || t.length > 100)) e.push("termos: 1+ termos de 3–100 caracteres");
  if (m.terms.length > 10) e.push("no máximo 10 termos (cota das APIs)");
  if (m.platforms.some((p) => !(PLATFORM_IDS as readonly string[]).includes(p))) e.push("plataforma desconhecida");
  if (m.ufs.some((u) => !(UFS as readonly string[]).includes(u))) e.push("UF inválida");
  if (!Number.isInteger(m.intervalS) || m.intervalS < 60 || m.intervalS > 86400) e.push("intervalo entre 60 s e 24 h");
  if (m.electionYear !== null && ![2014, 2018, 2022, 2026].includes(m.electionYear)) e.push("eleição inválida");
  return e;
}

export async function upsertMonitor(sql: Sql, m: MonitorInput) {
  const errs = validateMonitor(m);
  if (errs.length) throw new Error(errs.join("; "));
  await sql`insert into social_monitor (id, name, election_year, office_ids, candidacy_ids, parties, ufs, terms, platforms, interval_s, status, debate_id)
    values (${m.id}, ${m.name}, ${m.electionYear}, ${m.officeIds}, ${m.candidacyIds}, ${m.parties}, ${m.ufs}, ${m.terms}, ${m.platforms}, ${m.intervalS}, ${m.status}, ${m.debateId})
    on conflict (id) do update set name = excluded.name, election_year = excluded.election_year, office_ids = excluded.office_ids, candidacy_ids = excluded.candidacy_ids,
      parties = excluded.parties, ufs = excluded.ufs, terms = excluded.terms, platforms = excluded.platforms, interval_s = excluded.interval_s, status = excluded.status, debate_id = excluded.debate_id, updated_at = now()`;
}

const mapMonitor = (r: Row): SocialMonitor => ({
  id: r.id as string,
  name: r.name as string,
  electionYear: (r.election_year as number) ?? null,
  officeIds: (r.office_ids as number[]) ?? [],
  candidacyIds: (r.candidacy_ids as number[]) ?? [],
  parties: (r.parties as string[]) ?? [],
  ufs: (r.ufs as string[]) ?? [],
  terms: r.terms as string[],
  platforms: (r.platforms as string[]) ?? [],
  intervalS: r.interval_s as number,
  status: r.status as SocialMonitor["status"],
  debateId: (r.debate_id as string) ?? null,
  lastRunAt: iso(r.last_run_at),
  lastError: (r.last_error as string) ?? null,
});
export async function listMonitors(sql: Sql, status?: string) {
  return ((status ? await sql`select * from social_monitor where status = ${status} order by id` : await sql`select * from social_monitor order by status, id`) as Row[]).map(mapMonitor);
}
export async function setMonitorStatus(sql: Sql, id: string, status: SocialMonitor["status"]) {
  await sql`update social_monitor set status = ${status}, updated_at = now() where id = ${id}`;
}
