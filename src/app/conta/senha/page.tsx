import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ChangePasswordForm } from "@/components/auth/RecoverForms";
import { requireAuth } from "@/auth/dal";

export const metadata: Metadata = { title: "Trocar senha", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ obrigatoria?: string }> }) {
  const u = await requireAuth("/conta/senha", { allowPasswordChange: true });
  const forced = u.mustChangePassword || (await searchParams).obrigatoria === "1";
  return (
    <AuthFrame title={forced ? "Defina sua senha" : "Trocar senha"} footer={forced ? "Por segurança, a senha inicial precisa ser trocada no primeiro acesso." : u.email}>
      <ChangePasswordForm />
    </AuthFrame>
  );
}
