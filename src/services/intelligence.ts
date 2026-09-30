import "server-only";
import { getProfile } from "@/providers/registry";
import { createSql, type Sql } from "@/persistence/db";
import { parseFilters, type FilterSpec } from "@/domain/filters";

/**
 * Acesso da UI à inteligência eleitoral/social (dados persistidos). Só no perfil com banco (DATA_MODE=live);
 * nos perfis demo/fixture a UI mostra "indisponível neste perfil" — nunca números inventados.
 */
let sql: Sql | null = null;
export function intelSql(): Sql | null {
  if (getProfile().persistence !== "postgres") return null;
  return (sql ??= createSql(process.env.DATABASE_URL));
}

export function filtersFrom(searchParams: Record<string, string | string[] | undefined>, defaults: Partial<FilterSpec> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string") sp.set(k, v);
  const { filter, errors } = parseFilters(sp);
  for (const [k, v] of Object.entries(defaults)) if (!sp.has(k === "year" ? "ano" : k === "offices" ? "cargo" : k)) (filter as unknown as Record<string, unknown>)[k] = v;
  return { filter, errors };
}
