import type { Sql } from "@/persistence/db";
import { log } from "@/infrastructure/log";

/**
 * CONTROLE DE DEBATE — cadastro e ciclo de vida por DADOS (tabela debate_control), sem alterar código.
 * O worker só ingere debates em `connecting` / `live`. Transições são validadas e registradas.
 */
export const CONTROL_STATUSES = ["scheduled", "preparing", "connecting", "live", "paused", "finished", "processing", "archived", "error"] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];

export const TRANSITIONS: Record<ControlStatus, ControlStatus[]> = {
  scheduled: ["preparing", "archived", "error"],
  preparing: ["connecting", "scheduled", "error"],
  connecting: ["live", "paused", "error"],
  live: ["paused", "finished", "error"],
  paused: ["live", "finished", "error"],
  finished: ["processing", "archived"],
  processing: ["archived", "error"],
  error: ["preparing", "archived"],
  archived: [],
};

export const CONTROL_LABEL: Record<ControlStatus, string> = {
  scheduled: "Agendado",
  preparing: "Preparando",
  connecting: "Conectando",
  live: "Em andamento",
  paused: "Pausado",
  finished: "Encerrado",
  processing: "Processando",
  archived: "Arquivado",
  error: "Erro",
};

export interface DebateControl {
  id: string;
  title: string;
  officeLabel: string;
  jurisdiction: string | null;
  scheduledStart: string;
  sourceName: string;
  sourceUrl: string | null;
  providerId: string;
  sourceMode: "live" | "replay" | "file";
  replayOf: string | null;
  replaySpeed: 1 | 2 | 5 | 10 | null;
  candidates: string[];
  status: ControlStatus;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const map = (r: Row): DebateControl => ({
  id: r.id as string,
  title: r.title as string,
  officeLabel: r.office_label as string,
  jurisdiction: (r.jurisdiction as string) ?? null,
  scheduledStart: iso(r.scheduled_start)!,
  sourceName: r.source_name as string,
  sourceUrl: (r.source_url as string) ?? null,
  providerId: r.provider_id as string,
  sourceMode: r.source_mode as DebateControl["sourceMode"],
  replayOf: (r.replay_of as string) ?? null,
  replaySpeed: r.replay_speed === null || r.replay_speed === undefined ? null : (Number(r.replay_speed) as DebateControl["replaySpeed"]),
  candidates: (r.candidates as string[]) ?? [],
  status: r.status as ControlStatus,
  startedAt: iso(r.started_at),
  endedAt: iso(r.ended_at),
  error: (r.error as string) ?? null,
  lastHeartbeatAt: iso(r.last_heartbeat_at),
  lastError: (r.last_error as string) ?? null,
  lastErrorAt: iso(r.last_error_at),
});

export type NewDebateControl = Omit<DebateControl, "status" | "startedAt" | "endedAt" | "error" | "lastHeartbeatAt" | "lastError" | "lastErrorAt">;

export function validateControl(c: NewDebateControl): string[] {
  const errs: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{2,120}$/.test(c.id)) errs.push("id: use minúsculas, números e hífen");
  if (!c.title.trim()) errs.push("título obrigatório");
  if (!c.officeLabel.trim()) errs.push("cargo obrigatório");
  if (Number.isNaN(Date.parse(c.scheduledStart))) errs.push("data/horário inválidos");
  if (!["replay-transcript", "manifest-only"].includes(c.providerId)) errs.push("provider de transcrição deve ser 'replay-transcript' ou 'manifest-only' (cobertura só editorial)");
  if (c.sourceUrl && !/^https:\/\//.test(c.sourceUrl)) errs.push("URL da fonte deve ser https");
  if (c.sourceMode === "replay" && (!c.replayOf || !c.replaySpeed)) errs.push("replay exige debate de origem e velocidade (1, 2, 5, 10)");
  return errs;
}

export async function createControl(sql: Sql, c: NewDebateControl) {
  const errs = validateControl(c);
  if (errs.length) throw new Error(errs.join("; "));
  await sql`insert into debate_control (id, title, office_label, jurisdiction, scheduled_start, source_name, source_url, provider_id, source_mode, replay_of, replay_speed, candidates)
    values (${c.id}, ${c.title}, ${c.officeLabel}, ${c.jurisdiction}, ${c.scheduledStart}, ${c.sourceName}, ${c.sourceUrl}, ${c.providerId}, ${c.sourceMode}, ${c.replayOf}, ${c.replaySpeed}, ${c.candidates})`;
  await sql`insert into debate_control_event (control_id, from_status, to_status, reason) values (${c.id}, null, 'scheduled', 'cadastro')`;
}

export async function listControls(sql: Sql): Promise<DebateControl[]> {
  return ((await sql`select * from debate_control order by scheduled_start desc`) as Row[]).map(map);
}

export async function getControl(sql: Sql, id: string): Promise<DebateControl | null> {
  const rows = (await sql`select * from debate_control where id = ${id}`) as Row[];
  return rows[0] ? map(rows[0]) : null;
}

export async function activeControls(sql: Sql): Promise<DebateControl[]> {
  return ((await sql`select * from debate_control where status in ('connecting', 'live') order by scheduled_start`) as Row[]).map(map);
}

/**
 * Transição validada e atômica (compare-and-set no status atual). Efeitos:
 *   → live (1ª vez): started_at = agora · retomada após pausa: started_at avança o tempo pausado
 *   → finished: ended_at = agora · → error: guarda a mensagem
 */
export async function transition(sql: Sql, id: string, to: ControlStatus, reason = ""): Promise<DebateControl> {
  const cur = await getControl(sql, id);
  if (!cur) throw new Error(`debate não cadastrado: ${id}`);
  if (!TRANSITIONS[cur.status].includes(to)) throw new Error(`transição inválida: ${cur.status} → ${to}`);
  let pausedAt: string | null = null;
  if (to === "live" && cur.status === "paused") {
    const ev = (await sql`select at from debate_control_event where control_id = ${id} and to_status = 'paused' order by at desc limit 1`) as { at: string }[];
    pausedAt = ev[0] ? new Date(ev[0].at).toISOString() : null;
  }
  const res = (await sql.transaction([
    sql.query(
      `update debate_control set status = $2, updated_at = now(),
         started_at = case when $2 = 'live' and started_at is null then now() when $2 = 'live' and $5::timestamptz is not null then started_at + (now() - $5::timestamptz) else started_at end,
         ended_at = case when $2 = 'finished' then now() else ended_at end,
         error = case when $2 = 'error' then $4 when $2 in ('preparing', 'live') then null else error end
       where id = $1 and status = $3 returning *`,
      [id, to, cur.status, reason || null, pausedAt],
    ),
    sql.query("insert into debate_control_event (control_id, from_status, to_status, reason) select $1, $2, $3, $4 where exists (select 1 from debate_control where id = $1 and status = $3)", [id, cur.status, to, reason || null]),
  ])) as Row[][];
  if (!res[0][0]) throw new Error(`conflito: status de ${id} mudou durante a transição`);
  log("info", "debate_control.transition", { debate_id: id, from: cur.status, to, reason });
  return map(res[0][0]);
}

export async function controlHistory(sql: Sql, id: string) {
  return (await sql`select from_status, to_status, reason, at from debate_control_event where control_id = ${id} order by at, id`) as { from_status: string | null; to_status: string; reason: string | null; at: string }[];
}
