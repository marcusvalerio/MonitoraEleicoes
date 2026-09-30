/**
 * Log estruturado (JSON por linha). Campos de rastreio: request_id, ingestion_run_id,
 * provider, source_record_id. Nunca registrar payloads, textos de usuários ou segredos.
 */
type Fields = Record<string, string | number | boolean | null | undefined>;

export function log(level: "info" | "warn" | "error", msg: string, fields: Fields = {}) {
  if (process.env.MONITORA_LOG === "silent") return;
  const line = JSON.stringify({ at: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(16).slice(2)}`);
