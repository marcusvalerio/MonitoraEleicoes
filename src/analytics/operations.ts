import type { Sql } from "@/persistence/db";
import { readHeartbeats, workerState, type Heartbeat, type WorkerState } from "@/infrastructure/heartbeat";

/**
 * OBSERVABILIDADE das fontes — estado operacional de cada fonte e worker, a partir do que foi REGISTRADO
 * (ingestion_run, import_batch, heartbeats, social_source). Nada registrado ⇒ "sem sinal"/"não configurada".
 */
export type OpsState = WorkerState | "nao_configurada" | "sem_acesso";
export const OPS_LABEL: Record<OpsState, string> = {
  operacional: "Operacional",
  atrasado: "Atrasado",
  com_erro: "Com erro",
  sem_sinal: "Sem sinal",
  nao_configurada: "Não configurada",
  sem_acesso: "Sem acesso à API",
};

export interface OpsRow {
  id: string;
  name: string;
  group: "Dado oficial" | "Cobertura" | "Conversação" | "Pesquisas";
  state: OpsState;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastRun: { status: string; at: string; received: number; changed: number; errors: number; durationMs: number | null } | null;
  detail: string;
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

async function lastRun(sql: Sql, where: string, params: unknown[]) {
  const [r] = (await sql.query(
    `select status, started_at, finished_at, received_count, normalized_count, error_count, message from ingestion_run where ${where} order by started_at desc limit 1`,
    params,
  )) as Row[];
  if (!r) return null;
  return { status: r.status as string, at: iso(r.started_at)!, received: Number(r.received_count), changed: Number(r.normalized_count), errors: Number(r.error_count), durationMs: r.finished_at ? Date.parse(r.finished_at as string) - Date.parse(r.started_at as string) : null };
}

export async function operationsStatus(sql: Sql, nowMs = Date.now()): Promise<OpsRow[]> {
  const beats = new Map<string, Heartbeat>((await readHeartbeats(sql)).map((h) => [h.worker, h]));
  const fromBeat = (h: Heartbeat | undefined) => ({ state: workerState(h ?? null, nowMs) as OpsState, lastSuccessAt: h?.lastSuccessAt ?? null, lastErrorAt: h?.lastErrorAt ?? null, lastError: h?.lastError ?? null });
  const rows: OpsRow[] = [];

  // TSE · histórico (Dados Abertos): importações em lote
  const [imp] = (await sql`select max(finished_at) filter (where status = 'completed') as ok_at, max(finished_at) filter (where status = 'failed') as err_at,
      (select error from import_batch where status = 'failed' order by started_at desc limit 1) as err, count(*)::int as n from import_batch`) as Row[];
  const [el] = (await sql`select count(*)::int as cycles, count(*) filter (where status = 'results_official')::int as official from election`) as Row[];
  rows.push({
    id: "tse-historico",
    name: "TSE · Dados Abertos (histórico)",
    group: "Dado oficial",
    state: !imp.n ? "nao_configurada" : imp.err_at && (!imp.ok_at || imp.err_at > imp.ok_at) ? "com_erro" : "operacional",
    lastSuccessAt: iso(imp.ok_at),
    lastErrorAt: iso(imp.err_at),
    lastError: (imp.err as string) ?? null,
    lastRun: null,
    detail: `${el.official} de ${el.cycles} ciclos com resultados oficiais importados (lote, sob demanda)`,
  });

  // TSE · apuração (worker contínuo)
  const ap = beats.get("apuracao");
  rows.push({ id: "tse-apuracao", name: "TSE · Apuração (divulgação)", group: "Dado oficial", ...fromBeat(ap), lastRun: await lastRun(sql, "kind = 'election:count'", []), detail: ap ? `worker a cada ${ap.intervalS ?? "?"} s` : "worker --apuracao não iniciado" });

  // g1 · cobertura editorial
  const g1 = await lastRun(sql, "kind like 'media:editorial:%'", []);
  const [g1err] = (await sql`select max(last_error_at) as at, (select last_error from debate_control where last_error is not null order by last_error_at desc limit 1) as e from debate_control`) as Row[];
  rows.push({
    id: "g1",
    name: "g1 · Cobertura editorial",
    group: "Cobertura",
    state: !g1 ? "sem_sinal" : g1.status === "failed" ? "com_erro" : nowMs - Date.parse(g1.at) > 30 * 60_000 ? "sem_sinal" : "operacional",
    lastSuccessAt: g1 && g1.status !== "failed" ? g1.at : null,
    lastErrorAt: iso(g1err?.at),
    lastError: (g1err?.e as string) ?? null,
    lastRun: g1,
    detail: "coletado durante eventos ao vivo cadastrados (debate_control)",
  });

  // Redes sociais: acesso por plataforma + worker social
  const social = beats.get("social");
  const sources = (await sql`select id, name, access_status, enabled, last_success_at, last_error_at, last_error, notes from social_source order by id`) as Row[];
  for (const s of sources) {
    const access = s.access_status as string;
    const blocked = access === "unsupported" || access === "requires_authorization";
    const st: OpsState = blocked ? (access === "unsupported" ? "sem_acesso" : "nao_configurada") : !s.enabled ? "nao_configurada" : access === "error" ? "com_erro" : fromBeat(social).state;
    rows.push({ id: `social-${s.id}`, name: s.name as string, group: "Conversação", state: st, lastSuccessAt: iso(s.last_success_at), lastErrorAt: iso(s.last_error_at), lastError: (s.last_error as string) ?? null, lastRun: null, detail: blocked ? String(s.notes ?? "") : s.enabled ? "coleta pelo worker social" : "fonte desativada" });
  }
  if (!sources.length) rows.push({ id: "social", name: "Redes sociais", group: "Conversação", state: "nao_configurada", lastSuccessAt: null, lastErrorAt: null, lastError: null, lastRun: null, detail: "nenhuma fonte sincronizada" });

  // Pesquisas eleitorais
  const pq = beats.get("pesquisas");
  rows.push({ id: "pesquisas", name: "Pesquisas eleitorais (registro TSE)", group: "Pesquisas", ...(pq ? fromBeat(pq) : { state: "nao_configurada" as OpsState, lastSuccessAt: null, lastErrorAt: null, lastError: null }), lastRun: await lastRun(sql, "kind like 'polls:%'", []), detail: pq ? "worker de pesquisas" : "importação de pesquisas não iniciada" });
  return rows;
}
