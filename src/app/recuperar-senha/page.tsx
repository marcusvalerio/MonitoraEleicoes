import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { RequestResetForm } from "@/components/auth/RecoverForms";

export const metadata: Metadata = { title: "Recuperar senha", robots: { index: false } };

export default function Page() {
  return (
    <AuthFrame title="Recuperar senha" footer={<Link href="/login" className="hover:text-fg">Voltar ao login</Link>}>
      <RequestResetForm />
    </AuthFrame>
  );
}
