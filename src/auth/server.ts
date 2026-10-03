import "server-only";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { getPool } from "@/persistence/pool";
import { authOptions } from "./options";

/**
 * Autenticação real (Better Auth — mesmo motor do Neon Auth — sobre o PostgreSQL do Monitora).
 * Senhas só existem como hash na tabela de contas do próprio provedor (auth_account); a aplicação guarda apenas
 * o vínculo usuário ↔ campanha. Sessão em cookie httpOnly; cadastro público DESATIVADO (só o ADMIN cria contas).
 * Inicialização preguiçosa: as variáveis são lidas em tempo de execução, nunca no build.
 */
type Auth = Awaited<ReturnType<typeof create>>;
let instance: Promise<Auth> | null = null;

async function create() {
  return betterAuth({ ...authOptions(), database: await getPool(process.env.DATABASE_URL), plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] }), nextCookies()] });
}

export function authEnabled() {
  return !!process.env.DATABASE_URL && !!process.env.BETTER_AUTH_SECRET;
}

export function getAuth(): Promise<Auth> {
  if (!authEnabled()) throw new Error("autenticação indisponível neste ambiente (DATABASE_URL/BETTER_AUTH_SECRET)");
  return (instance ??= create());
}
