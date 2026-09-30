import type { Sql } from "@/persistence/db";
import type { Source } from "@/domain/types";
import { activeControls, getControl, transition, type DebateControl } from "@/control/debates";
import { runIngestion, type ProviderSet } from "./worker";
import { dueSources, markSourceResult } from "@/control/sources";
import { log, newRequestId } from "@/infrastructure/log";

/**
 * WORKER CONTÍNUO: a cada intervalo, para cada debate em `connecting`/`live` (debate_control):
 *   provider (só o que foi liberado desde o checkpoint) → RAW → normalização → análise → Neon.
 * Reinício seguro: checkpoints e dedup estão no banco; o relógio do replay (started_at) também.
 * Falhas: retry/backoff do provider (pipeline) + backoff por debate; após MAX_FAILURES → status `error`.
 */
export const MAX_FAILURES = 5;

export interface LiveWorkerDeps {
  /** `editorial`: fontes editoriais com intervalo vencido neste ciclo (debate_source). */
  providersFor: (c: DebateControl, editorial: { providerId: string; sourceUrl: string }[]) => ProviderSet & { transcript: ProviderSet["transcript"] & { progress?: () => Promise<{ released: number; total: number; finished: boolean }> } };
  sources: Source[];
  spoolDir?: string;
  /** Relógio (testes). */
  now?: () => number;
}

export async function liveTick(sql: Sql, control: DebateControl, deps: LiveWorkerDeps) {
  let c = control;
  if (c.status === "connecting") c = await transition(sql, c.id, "live", "worker conectado à fonte");
  const due = await dueSources(sql, c.id, (deps.now ?? Date.now)());
  // Debate só com cobertura editorial: sem fonte vencida neste ciclo ⇒ nada a coletar (apenas batimento).
  if (c.providerId === "manifest-only" && !due.length) {
    await sql`update debate_control set last_heartbeat_at = now() where id = ${c.id}`;
    return { requestId: null, res: null, progress: null, transcriptFailed: false, skipped: true };
  }
  const providers = deps.providersFor(c, due);
  const requestId = newRequestId();
  const res = await runIngestion(sql, providers, {
    datasetId: c.sourceMode === "replay" ? `replay-${c.replayOf}` : `live-${c.id}`,
    // Fixtures de E2E rodam com MONITORA_DATASET_KIND=fixture (produção recusa fixture no gravador).
    datasetKind: (process.env.MONITORA_DATASET_KIND as "fixture" | undefined) ?? "validation",
    description: c.sourceMode === "replay" ? `REPLAY de ${c.replayOf} (horários sintéticos)` : `Ingestão ao vivo de ${c.id}`,
    sources: deps.sources,
    requestId,
    skipIdleRuns: true,
    spoolDir: deps.spoolDir,
    logFields: { debate_id: c.id, provider: c.providerId },
  });
  await sql`update debate_control set last_heartbeat_at = now() where id = ${c.id}`;
  for (const d of due) {
    const run = res.runs.find((r) => r.providerId === d.providerId && r.kind === `media:editorial:${c.id}`);
    await markSourceResult(sql, d.id, run?.status === "failed" ? { ok: false, error: "coleta falhou (ver ingestion_run / ingestion_error)" } : { ok: true });
  }
  const progress = providers.transcript.progress ? await providers.transcript.progress() : null;
  const transcriptFailed = res.runs.some((r) => r.kind.startsWith("transcript:") && r.status === "failed");
  if (progress?.finished && !transcriptFailed) await transition(sql, c.id, "finished", `fonte concluída (${progress.released}/${progress.total})`);
  return { requestId, res, progress, transcriptFailed, skipped: false };
}

export interface LoopOptions {
  intervalMs: number;
  /** Encerramento gracioso: quando `true`, termina após o ciclo atual (nunca no meio de uma gravação). */
  shouldStop: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  maxTicks?: number;
}

export async function runLiveWorker(sql: Sql, deps: LiveWorkerDeps, o: LoopOptions) {
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const failures = new Map<string, number>();
  let dbFailures = 0;
  for (let tick = 0; !o.shouldStop() && (o.maxTicks === undefined || tick < o.maxTicks); tick++) {
    let controls: DebateControl[] = [];
    try {
      controls = await activeControls(sql);
      dbFailures = 0;
    } catch (e) {
      dbFailures++;
      const wait = Math.min(60_000, o.intervalMs * 2 ** dbFailures);
      log("error", "live_worker.db_unavailable", { attempt: dbFailures, retry_in_ms: wait, error: e instanceof Error ? e.message : String(e) });
      await sleep(wait);
      continue;
    }
    for (const c of controls) {
      if (o.shouldStop()) break;
      try {
        const r = await liveTick(sql, c, deps);
        failures.set(c.id, r.transcriptFailed ? (failures.get(c.id) ?? 0) + 1 : 0);
        if (r.transcriptFailed) await sql`update debate_control set last_error_at = now(), last_error = ${"provider de transcrição indisponível (ver ingestion_run/ingestion_error)"} where id = ${c.id}`;
      } catch (e) {
        failures.set(c.id, (failures.get(c.id) ?? 0) + 1);
        await sql`update debate_control set last_error_at = now(), last_error = ${e instanceof Error ? e.message.slice(0, 500) : String(e)} where id = ${c.id}`.catch(() => {});
        log("error", "live_worker.tick_failed", { debate_id: c.id, provider: c.providerId, failures: failures.get(c.id), error: e instanceof Error ? e.message : String(e) });
      }
      if ((failures.get(c.id) ?? 0) >= MAX_FAILURES) {
        const cur = await getControl(sql, c.id).catch(() => null);
        if (cur && (cur.status === "live" || cur.status === "connecting")) await transition(sql, c.id, "error", `${MAX_FAILURES} falhas consecutivas de ingestão`).catch(() => {});
        failures.delete(c.id);
      }
    }
    // Backoff exponencial quando algum debate está falhando; intervalo normal caso contrário.
    const worst = Math.max(0, ...failures.values());
    if (!o.shouldStop()) await sleep(worst ? Math.min(60_000, o.intervalMs * 2 ** worst) : o.intervalMs);
  }
  log("info", "live_worker.stopped", {});
}
