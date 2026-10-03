import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/auth/dal";

export const metadata: Metadata = { title: { default: "Administração", template: "%s · Admin · Monitora Eleições" }, robots: { index: false } };

/** Área administrativa: SOMENTE ADMIN (sessão validada no servidor). Não-admin ⇒ 403. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-3">
        <p className="font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-[0.18em] text-fg-3">ADMINISTRAÇÃO DA PLATAFORMA</p>
        <nav aria-label="Administração" className="flex gap-1 text-[12.5px]">
          {[["/admin/campanhas", "Campanhas"], ["/admin/usuarios", "Usuários"], ["/admin/inteligencia", "Inteligência"]].map(([h, l]) => (
            <Link key={h} href={h} className="rounded-[6px] px-2.5 py-1 text-fg-2 hover:bg-elevated hover:text-fg">{l}</Link>
          ))}
        </nav>
        <span className="ml-auto text-[11.5px] text-fg-3">{admin.email}</span>
      </div>
      {children}
    </div>
  );
}
