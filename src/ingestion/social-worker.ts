import { beat } from "@/infrastructure/heartbeat";
import type { Sql } from "@/persistence/db";
import type { Source } from "@/domain/types";
import type { SocialMonitor } from "@/domain/social";
import type { SocialListeningProvider } from "@/providers/contracts";
import type { SocialContext } from "@/ai/social";
import { listMonitors, markSocialSource } from "@/control/social";
import { runIngestion, type ProviderSet } from "./worker";
import { log, newRequestId } from "@/infrastructure/log";

/**
 * WORKER SOCIAL (separado do histórico e do editorial). Para cada monitor ativo e vencido:
 *   janela [fim da última janela coletada, agora) → providers das plataformas do monitor → RAW → normalização → análise → Neon.
 * Plataforma sem acesso ⇒ janela registrada como requires_authorization/unsupported (o dashboard mostra; nunca "0").
 */
export interface SocialWorkerDeps {
  providers: SocialListeningProvider[];
  base: Omit<ProviderSet, "listening">;
  sources: Source[];
  now?: () => number;
  datasetKind?: "production" | "fixture" | "validation";
}

async function contextFor(sql: Sql, m: SocialMonitor): Promise<SocialContext> {
  const cands = m.candidacyIds.length ? ((await sql`select id, name, ballot_name from candidacy where id = any(${m.candidacyIds}::int[])`) as { id: number; name: string; ballot_name: string }[]) : [];
  const parties = m.parties.length ? ((await sql`select distinct acronym, name from party_registration where acronym = any(${m.parties}::text[])`) as { acronym: string; name: string }[]) : [];
  return { candidacies: cands.map((c) => ({ id: c.id, name: c.name, ballotName: c.ballot_name })), parties };
}

export async function socialTick(sql: Sql, m: SocialMonitor, deps: SocialWorkerDeps) {
  const nowMs = (deps.now ?? Date.now)();
  if (m.lastRunAt && nowMs - Date.parse(m.lastRunAt) < m.intervalS * 1000 - 500) return { skipped: true as const };
  const until = new Date(nowMs).toISOString();
  const context = await contextFor(sql, m);
  const listening = [];
  const blocked: { platform: string; status: string; reason: string }[] = [];
  for (const platform of m.platforms) {
    const [src] = (await sql`select enabled, access_status from social_source where id = ${platform}`) as { enabled: boolean; access_status: string }[];
    const p = deps.providers.find((x) => x.info.platform === platform);
    const st = p?.accessStatus() ?? { status: "unsupported", reason: "provider não implementado" };
    if (!p || !src?.enabled || !["configured", "active", "error"].includes(st.status)) {
      blocked.push({ platform, status: !src?.enabled && ["configured", "active"].includes(st.status) ? "disabled" : st.status, reason: st.reason });
      continue;
    }
    const [last] = (await sql`select max(window_end) as e from social_collection_window where source_id = ${platform} and monitor_id = ${m.id} and status in ('collected', 'partial')`) as { e: string | null }[];
    const since = last?.e ? new Date(last.e).toISOString() : new Date(nowMs - m.intervalS * 1000).toISOString();
    listening.push({ provider: p, monitor: m, query: { terms: m.terms, since, until }, context });
  }
  // Janela sem acesso: registrada (status), sem itens (null ≠ 0)
  for (const b of blocked) {
    if (b.status === "disabled") continue;
    await sql`insert into social_collection_window (source_id, monitor_id, window_start, window_end, status, items, error)
      values (${b.platform}, ${m.id}, ${new Date(nowMs - m.intervalS * 1000).toISOString()}, ${until}, ${b.status === "unsupported" ? "unsupported" : "requires_authorization"}, null, ${b.reason})
      on conflict do nothing`.catch(() => {});
  }
  let res = null;
  if (listening.length) {
    res = await runIngestion(sql, { ...deps.base, listening }, { datasetId: `social-${m.electionYear ?? "geral"}`, datasetKind: deps.datasetKind ?? "production", description: "Social listening (fontes conectadas)", sources: deps.sources, requestId: newRequestId(), skipIdleRuns: true, logFields: { monitor_id: m.id } });
    for (const l of listening) {
      const run = res.runs.find((r) => r.kind === `social:listening:${m.id}` && r.providerId === l.provider.info.id);
      const [w] = (await sql`select status, quota_used, error from social_collection_window where source_id = ${l.provider.info.platform} and monitor_id = ${m.id} and window_start = ${l.query.since}`) as { status: string; quota_used: number | null; error: string | null }[];
      const ok = w && (w.status === "collected" || w.status === "partial");
      await markSocialSource(sql, l.provider.info.platform, ok ? { ok: true, quotaUsed: w.quota_used } : { ok: false, error: w?.error ?? run?.status ?? "falha", status: w?.status });
    }
  }
  await sql`update social_monitor set last_run_at = ${until}, last_error = ${blocked.length && !listening.length ? `sem fonte com acesso: ${blocked.map((b) => `${b.platform}=${b.status}`).join(", ")}` : null} where id = ${m.id}`;
  log("info", "social.tick", { monitor_id: m.id, platforms: listening.length, blocked: blocked.length });
  return { skipped: false as const, res, blocked };
}

export async function runSocialWorker(sql: Sql, deps: SocialWorkerDeps, o: { intervalMs: number; shouldStop: () => boolean; sleep?: (ms: number) => Promise<void> }) {
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  while (!o.shouldStop()) {
    const t0 = Date.now();
    let error: string | null = null;
    try {
      for (const m of await listMonitors(sql, "active")) {
        if (o.shouldStop()) break;
        await socialTick(sql, m, deps).catch((e) => {
          error = `${m.id}: ${(e as Error).message}`;
          log("error", "social.tick_failed", { monitor_id: m.id, error: (e as Error).message });
        });
      }
    } catch (e) {
      error = (e as Error).message;
      log("error", "social.db_unavailable", { error: error });
    }
    await beat(sql, "social", { ok: !error, error, durationMs: Date.now() - t0, intervalS: Math.round(o.intervalMs / 1000) }).catch(() => {});
    if (!o.shouldStop()) await sleep(o.intervalMs);
  }
}
