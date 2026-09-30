import type { Sql } from "@/persistence/db";
import type { EditorialSourceStatus } from "@/domain/editorial";
import { assertAllowedG1Url, G1_PROVIDER_ID } from "@/providers/g1";

/**
 * FONTES POR DEBATE (debate_source): URL, intervalo e ativação configuráveis por dados.
 * Nenhum componente de UI conhece a URL; o worker lê daqui a cada ciclo.
 */
export const EDITORIAL_PROVIDERS = [G1_PROVIDER_ID] as const;
export type EditorialProviderId = (typeof EDITORIAL_PROVIDERS)[number];

export interface SourceInput {
  debateId: string;
  providerId: string;
  /** null = URL ainda pendente (fonte cadastrada, sem coleta possível). */
  sourceUrl: string | null;
  pollingIntervalMs: number;
  enabled: boolean;
}

export function validateSource(s: SourceInput): string[] {
  const e: string[] = [];
  if (!(EDITORIAL_PROVIDERS as readonly string[]).includes(s.providerId)) e.push("provider não suportado");
  if (!s.debateId) e.push("debate obrigatório");
  if (!Number.isInteger(s.pollingIntervalMs) || s.pollingIntervalMs < 5000 || s.pollingIntervalMs > 600_000) e.push("intervalo deve estar entre 5 000 e 600 000 ms");
  if (s.sourceUrl) {
    try {
      assertAllowedG1Url(s.sourceUrl);
    } catch (err) {
      e.push((err as Error).message);
    }
  }
  if (s.enabled && !s.sourceUrl) e.push("fonte sem URL (pendente) não pode ser ativada");
  return e;
}

export const sourceId = (debateId: string, providerId: string) => `${debateId}:${providerId}`;

export async function upsertSource(sql: Sql, s: SourceInput) {
  const errs = validateSource(s);
  if (errs.length) throw new Error(errs.join("; "));
  await sql`insert into debate_source (id, debate_id, provider_id, source_url, polling_interval_ms, enabled)
    values (${sourceId(s.debateId, s.providerId)}, ${s.debateId}, ${s.providerId}, ${s.sourceUrl}, ${s.pollingIntervalMs}, ${s.enabled})
    on conflict (id) do update set source_url = excluded.source_url, polling_interval_ms = excluded.polling_interval_ms, enabled = excluded.enabled, updated_at = now()`;
}

export async function setSourceEnabled(sql: Sql, id: string, enabled: boolean) {
  const rows = (await sql`select source_url from debate_source where id = ${id}`) as { source_url: string | null }[];
  if (!rows[0]) throw new Error(`fonte não cadastrada: ${id}`);
  if (enabled && !rows[0].source_url) throw new Error("fonte sem URL (pendente) não pode ser ativada");
  await sql`update debate_source set enabled = ${enabled}, updated_at = now() where id = ${id}`;
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/** Estado das fontes. Contagens `null` quando a fonte nunca coletou (não coletado ≠ 0). */
export async function listSources(sql: Sql, debateId?: string): Promise<EditorialSourceStatus[]> {
  const rows = (await sql`
    select s.*,
      (select count(*)::int from editorial_event e where e.debate_id = s.debate_id and e.provider_id = s.provider_id and e.removed_at is null) as records,
      (select count(*)::int from ingestion_error x join ingestion_run r on r.id = x.ingestion_run_id where r.provider_id = s.provider_id and r.kind = 'media:editorial:' || s.debate_id) as rejected,
      (select percentile_cont(0.5) within group (order by extract(epoch from e.collected_at - e.published_at))
         from (select collected_at, published_at from editorial_event e where e.debate_id = s.debate_id and e.provider_id = s.provider_id and e.published_at is not null and e.collected_at >= e.published_at order by e.published_at desc limit 20) e) as latency
    from debate_source s where ${debateId ?? null}::text is null or s.debate_id = ${debateId ?? null}
    order by s.debate_id, s.provider_id`) as Row[];
  return rows.map((r) => {
    const collected = !!r.last_collected_at;
    return {
      id: r.id as string,
      debateId: r.debate_id as string,
      providerId: r.provider_id as string,
      sourceUrl: (r.source_url as string) ?? null,
      pollingIntervalMs: r.polling_interval_ms as number,
      enabled: r.enabled as boolean,
      lastHeartbeatAt: iso(r.last_heartbeat_at),
      lastCollectedAt: iso(r.last_collected_at),
      lastUpdateAt: iso(r.last_update_at),
      lastError: (r.last_error as string) ?? null,
      lastErrorAt: iso(r.last_error_at),
      records: collected ? (r.records as number) : null,
      rejected: collected ? (r.rejected as number) : null,
      collectionLatencyS: r.latency === null || r.latency === undefined ? null : Math.round(Number(r.latency) * 10) / 10,
    };
  });
}

/** Fontes ativas, com URL, cujo intervalo venceu. */
export async function dueSources(sql: Sql, debateId: string, nowMs: number) {
  const rows = (await sql`select id, provider_id, source_url, polling_interval_ms, last_collected_at, last_heartbeat_at from debate_source
    where debate_id = ${debateId} and enabled and source_url is not null`) as Row[];
  return rows
    .filter((r) => {
      const last = r.last_heartbeat_at ? Date.parse(iso(r.last_heartbeat_at)!) : 0;
      return nowMs - last >= (r.polling_interval_ms as number) - 250;
    })
    .map((r) => ({ id: r.id as string, providerId: r.provider_id as string, sourceUrl: r.source_url as string }));
}

export async function markSourceResult(sql: Sql, id: string, r: { ok: boolean; error?: string | null }) {
  if (r.ok)
    await sql`update debate_source s set last_heartbeat_at = now(), last_collected_at = now(), last_error = null,
      last_update_at = (select max(e.published_at) from editorial_event e where e.debate_id = s.debate_id and e.provider_id = s.provider_id)
      where s.id = ${id}`;
  else await sql`update debate_source set last_heartbeat_at = now(), last_error = ${(r.error ?? "falha").slice(0, 500)}, last_error_at = now() where id = ${id}`;
}
