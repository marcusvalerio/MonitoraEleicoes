import type { Sql } from "@/persistence/db";

interface AdminApi {
  api: { createUser: (a: { body: { email: string; password: string; name: string; role: "admin"; data: Record<string, unknown> } }) => Promise<{ user: { id: string } }> };
}

/**
 * Bootstrap do PRIMEIRO administrador a partir de ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD (variáveis/secret — nunca no código).
 * Falha de forma clara se faltarem; não promove contas existentes; não cria um 2º admin por este caminho.
 * A senha inicial exige troca no primeiro acesso (mustChangePassword).
 */
export async function bootstrapAdmin(auth: AdminApi, sql: Sql, env: { ADMIN_EMAIL?: string; ADMIN_INITIAL_PASSWORD?: string }) {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_INITIAL_PASSWORD ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("bootstrap: ADMIN_EMAIL ausente ou inválido");
  if (password.length < 12) throw new Error("bootstrap: ADMIN_INITIAL_PASSWORD ausente ou com menos de 12 caracteres");
  const admins = (await sql`select email from auth_user where role = 'admin'`) as { email: string }[];
  if (admins.some((a) => a.email === email)) return { status: "exists" as const };
  if (admins.length) throw new Error("bootstrap: já existe administrador — crie novos acessos pelo painel /admin");
  if (((await sql`select 1 from auth_user where email = ${email}`) as unknown[]).length) throw new Error("bootstrap: o e-mail já pertence a uma conta não administrativa; não promovo contas automaticamente");
  const { user } = await auth.api.createUser({ body: { email, password, name: "Administrador", role: "admin", data: { mustChangePassword: true } } });
  return { status: "created" as const, id: user.id };
}
