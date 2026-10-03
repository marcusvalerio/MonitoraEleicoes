"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./server";
import { getAuthenticatedUser } from "./dal";
import { createSql } from "@/persistence/db";

/** Logout: revoga a sessão no provedor e limpa o cookie. */
export async function logoutAction() {
  await (await getAuth()).api.signOut({ headers: await headers() }).catch(() => {});
  redirect("/login");
}

/**
 * Troca de senha NO SERVIDOR (a senha atual é verificada pelo provedor); só depois disso a pendência de
 * "troca obrigatória" é removida — não há como limpar a pendência sem trocar de fato.
 */
export async function changePasswordAction(_: unknown, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const u = await getAuthenticatedUser();
  if (!u) redirect("/login");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 12) return { error: "A nova senha precisa ter ao menos 12 caracteres." };
  if (next !== String(form.get("confirm") ?? "")) return { error: "A confirmação não confere." };
  if (next === current) return { error: "A nova senha deve ser diferente da atual." };
  try {
    await (await getAuth()).api.changePassword({ body: { currentPassword: current, newPassword: next, revokeOtherSessions: true }, headers: await headers() });
  } catch {
    return { error: "Senha atual incorreta." };
  }
  await createSql(process.env.DATABASE_URL)`update auth_user set "mustChangePassword" = false, "updatedAt" = now() where id = ${u.id}`;
  redirect(u.isAdmin ? "/admin" : "/avaliacao");
}
