import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Cliente PostgreSQL (Neon, driver HTTP). Conexão EXCLUSIVAMENTE por variável de ambiente.
 * Escolha: @neondatabase/serverless (HTTP/fetch) — funciona em Node, Edge e serverless,
 * sem pool TCP; SQL explícito com mapeadores tipados, sem ORM (ver docs/DATABASE.md).
 */
export type Sql = NeonQueryFunction<false, false>;
export type DbEnv = "development" | "test" | "production";

export const URL_VAR: Record<DbEnv, string> = { development: "DATABASE_URL", test: "DATABASE_URL_TEST", production: "DATABASE_URL_PRODUCTION" };

export function createSql(url: string | undefined, varName = "DATABASE_URL"): Sql {
  if (!url) throw new Error(`${varName} não definida (ver docs/DATABASE.md)`);
  return neon(url);
}

/** Ambiente declarado no próprio banco (monitora_env), gravado pelas migrations. */
export async function databaseEnv(sql: Sql): Promise<DbEnv | null> {
  const rows = (await sql`select env from monitora_env`) as { env: DbEnv }[];
  return rows[0]?.env ?? null;
}

/** Proteção: operações destrutivas/de teste só em bancos marcados como 'test'. */
export async function assertTestDatabase(sql: Sql) {
  const env = await databaseEnv(sql);
  if (env !== "test") throw new Error(`recusado: banco marcado como '${env}', esperado 'test'`);
}
