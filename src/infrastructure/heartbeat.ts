import type { Sql } from "@/persistence/db";

/**
 * BATIMENTO DE WORKERS independentes (TSE apuração, social, g1, pesquisas) — sem nova tabela:
 * reaproveita ingestion_checkpoint (provider_id = "monitora-worker", stream = "heartbeat:<worker>").
 * Permite à UI/admin distinguir "operacional", "sem sinal" e "com erro" sem inventar estado.
 */
export const HEARTBEAT_PROVIDER = "monitora-worker";
export type WorkerId = "apuracao" | "social" | "g1" | "pesquisas" | "tse-historico";

export interface Heartbeat {
  worker: WorkerId;
  at: string;
  /** Último ciclo concluído sem erro. */
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  durationMs: number | null;
  collected: number | null;
  changed: number | null;
  rejected: number | null;
  intervalS: number | null;
}

export async function beat(sql: Sql, worker: WorkerId, r: { ok: boolean; error?: string | null; durationMs?: number; collected?: number; changed?: number; rejected?: number; intervalS?: number; at?: string }) {
  const at = r.at ?? new Date().toISOString();
  const [prev] = (await sql`select cursor from ingestion_checkpoint where provider_id = ${HEARTBEAT_PROVIDER} and stream = ${`heartbeat:${worker}`}`) as { cursor: string }[];
  const p = prev ? (JSON.parse(prev.cursor) as Heartbeat) : null;
  const h: Heartbeat = {
    worker,
    at,
    lastSuccessAt: r.ok ? at : (p?.lastSuccessAt ?? null),
    lastErrorAt: r.ok ? (p?.lastErrorAt ?? null) : at,
    lastError: r.ok ? (p?.lastError ?? null) : (r.error ?? "erro").slice(0, 300),
    durationMs: r.durationMs ?? null,
    collected: r.collected ?? null,
    changed: r.changed ?? null,
    rejected: r.rejected ?? null,
    intervalS: r.intervalS ?? p?.intervalS ?? null,
  };
  await sql`insert into ingestion_checkpoint (provider_id, stream, cursor, updated_at) values (${HEARTBEAT_PROVIDER}, ${`heartbeat:${worker}`}, ${JSON.stringify(h)}, ${at})
    on conflict (provider_id, stream) do update set cursor = excluded.cursor, updated_at = excluded.updated_at`;
  return h;
}

export type WorkerState = "operacional" | "atrasado" | "com_erro" | "sem_sinal";
/** Estado derivado: sem batimento ⇒ sem sinal; atraso > 3× intervalo (mín. 5 min) ⇒ atrasado; último ciclo com erro ⇒ com erro. */
export function workerState(h: Heartbeat | null, nowMs = Date.now()): WorkerState {
  if (!h) return "sem_sinal";
  const limit = Math.max(300, 3 * (h.intervalS ?? 60)) * 1000;
  if (nowMs - Date.parse(h.at) > limit) return "atrasado";
  if (h.lastErrorAt && (!h.lastSuccessAt || h.lastErrorAt >= h.lastSuccessAt)) return "com_erro";
  return "operacional";
}

export async function readHeartbeats(sql: Sql): Promise<Heartbeat[]> {
  const rows = (await sql`select cursor from ingestion_checkpoint where provider_id = ${HEARTBEAT_PROVIDER} and stream like 'heartbeat:%'`) as { cursor: string }[];
  return rows.map((r) => JSON.parse(r.cursor) as Heartbeat);
}
