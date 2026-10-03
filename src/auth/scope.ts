import type { PoolClient } from "@neondatabase/serverless";
import { getPool } from "@/persistence/pool";

/**
 * Executa consultas de DADOS DE CAMPANHA sob RLS: transação com SET LOCAL ROLE monitora_app e o token da sessão
 * em monitora.session_token. Quem decide o usuário é o banco (monitora_uid valida o token em auth_session);
 * nenhum id de usuário vindo da aplicação é aceito como identidade.
 */
export async function withScope<T>(sessionToken: string, fn: (db: PoolClient) => Promise<T>, url = process.env.DATABASE_URL): Promise<T> {
  const pool = await getPool(url);
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('monitora.session_token', $1, true)", [sessionToken]);
    await db.query("set local role monitora_app");
    const out = await fn(db);
    await db.query("commit");
    return out;
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}
