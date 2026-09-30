import type { Metadata } from "next";
import { adminEnabled } from "@/control/access";
import { PageHeader } from "@/components/ui/primitives";
import { Notice } from "@/components/ui/states";
import { AdminDebates } from "./AdminDebates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · debates", robots: { index: false, follow: false } };

export default function AdminDebatesPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Administração" title="Debates" description="Cadastro e ciclo de vida por dados (sem alterar código). O worker ingere apenas debates em “Conectando” ou “Em andamento”." />
      {adminEnabled() ? <AdminDebates /> : <Notice state="partial">Administração desativada: defina ADMIN_TOKEN no servidor e use o perfil com banco (DATA_MODE=live).</Notice>}
    </div>
  );
}
