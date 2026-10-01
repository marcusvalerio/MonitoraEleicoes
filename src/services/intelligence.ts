import "server-only";
import { getProfile } from "@/providers/registry";
import { createSql, type Sql } from "@/persistence/db";
import { parseFilters, type FilterSpec } from "@/domain/filters";

/**
 * Acesso da UI à inteligência eleitoral/social (dados persistidos). Só no perfil com banco (DATA_MODE=live);
 * nos perfis demo/fixture a UI mostra "indisponível neste perfil" — nunca números inventados.
 */
let sql: Sql | null = null;
/** Versão mínima do schema exigida pelas páginas de inteligência (histórico TSE, social, apuração). */
export const REQUIRED_SCHEMA = "0008";
let checked: { at: number; ok: boolean } | null = null;

/**
 * Conexão para inteligência eleitoral/social — ou null quando o dado não pode ser servido:
 * perfil sem banco, DATABASE_URL ausente, banco inacessível ou schema anterior a REQUIRED_SCHEMA
 * (ex.: produção antes das migrations). A UI mostra "fonte indisponível", nunca números.
 */
export async function intelSql(): Promise<Sql | null> {
  if (getProfile().persistence !== "postgres" || !process.env.DATABASE_URL) return null;
  sql ??= createSql(process.env.DATABASE_URL);
  if (!checked || Date.now() - checked.at > 60_000) {
    try {
      const [r] = (await sql`select max(version) as v from schema_migrations`) as { v: string | null }[];
      checked = { at: Date.now(), ok: !!r?.v && r.v >= REQUIRED_SCHEMA };
    } catch {
      checked = { at: Date.now(), ok: false };
    }
  }
  return checked.ok ? sql : null;
}

export function filtersFrom(searchParams: Record<string, string | string[] | undefined>, defaults: Partial<FilterSpec> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string") sp.set(k, v);
  const { filter, errors } = parseFilters(sp);
  for (const [k, v] of Object.entries(defaults)) if (!sp.has(k === "year" ? "ano" : k === "offices" ? "cargo" : k)) (filter as unknown as Record<string, unknown>)[k] = v;
  return { filter, errors };
}
