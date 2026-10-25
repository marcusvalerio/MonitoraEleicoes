import type { Sql } from "@/persistence/db";
import { log } from "@/infrastructure/log";
import { countTick } from "./worker";
import { COUNT_PROVIDER_ID, TseCountProvider } from "./provider";

/** Intervalo mínimo entre coletas disparadas por visita (todas as instâncias somadas). */
export const REFRESH_EVERY_S = 60;

/**
 * Concessão de 60 s gravada no banco (funciona entre instâncias serverless, sem lock de sessão): só quem conseguir
 * renovar a linha `ondemand:<ano>:<turno>` vencida faz a coleta. Retorna true se esta chamada ficou com a vez.
 */
export async function takeLease(sql: Sql, year: number, round: number, everyS = REFRESH_EVERY_S): Promise<boolean> {
  const rows = (await sql.query(
    `insert into ingestion_checkpoint (provider_id, stream, cursor, updated_at) values ($1, $2, 'lease', now())
     on conflict (provider_id, stream) do update set updated_at = now()
       where ingestion_checkpoint.updated_at < now() - make_interval(secs => $3)
     returning 1 as ok`,
    [COUNT_PROVIDER_ID, `ondemand:${year}:${round}`, everyS],
  )) as { ok: number }[];
  return rows.length > 0;
}

/**
 * APURAÇÃO SOB DEMANDA — sem servidor dedicado: cada visita à apuração (depois de responder) pode disparar UMA
 * passada do worker oficial (Presidente: Brasil, UFs e Exterior; mesmos arquivos, normalização e gravação idempotente
 * do worker). No máximo uma vez por minuto no total. Falha não afeta a página (registrada no log).
 */
export async function refreshCountIfStale(sql: Sql, year: number, round: 1 | 2, provider = new TseCountProvider()) {
  try {
    if (!(await takeLease(sql, year, round))) return null;
    const r = await countTick(sql, provider, { year, round, offices: [1], concurrency: 8 });
    log("info", "apuracao.ondemand", { year, round, ...r });
    return r;
  } catch (e) {
    log("warn", "apuracao.ondemand.failed", { year, round, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
