import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ResetForm } from "@/components/auth/RecoverForms";

export const metadata: Metadata = { title: "Definir nova senha", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <AuthFrame title="Definir nova senha">
      <ResetForm token={error ? null : (token ?? null)} />
    </AuthFrame>
  );
}
