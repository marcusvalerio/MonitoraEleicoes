import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getProfile } from "@/providers/registry";
import { createSql, type Sql } from "@/persistence/db";

/** Token de administração (ADMIN_TOKEN). Sem token configurado, o admin fica desativado. */
export function adminEnabled() {
  return !!process.env.ADMIN_TOKEN && getProfile().persistence === "postgres";
}

export function checkAdmin(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const got = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

let sql: Sql | null = null;
/** Conexão do controle de debates: só no perfil com persistência (live). */
export function controlSql(): Sql {
  if (getProfile().persistence !== "postgres") throw new Error("controle de debates exige perfil com PostgreSQL (DATA_MODE=live)");
  return (sql ??= createSql(process.env.DATABASE_URL));
}
