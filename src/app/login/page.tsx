import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { LoginForm } from "@/components/auth/LoginForm";
import { authEnabled } from "@/auth/server";
import { getAuthenticatedUser } from "@/auth/dal";
import { safeNext } from "@/auth/roles";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const u = await getAuthenticatedUser();
  if (u) redirect(safeNext(next, u.isAdmin));
  return (
    <AuthFrame title="Entrar" footer="Acesso restrito. Contas são criadas pela administração da plataforma.">
      {authEnabled() ? <LoginForm next={next ?? null} /> : <p className="text-[13px] text-fg-2">Autenticação indisponível neste ambiente.</p>}
    </AuthFrame>
  );
}
