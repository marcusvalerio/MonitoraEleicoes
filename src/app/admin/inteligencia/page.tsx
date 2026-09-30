import type { Metadata } from "next";
import { adminEnabled } from "@/control/access";
import { PageHeader } from "@/components/ui/primitives";
import { Notice } from "@/components/ui/states";
import { AdminIntelligence } from "./AdminIntelligence";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · inteligência", robots: { index: false, follow: false } };

export default function AdminIntelligencePage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Administração" title="Fontes sociais, monitores e dados eleitorais" description="Somente APIs oficiais. Fonte sem acesso (sem API adequada ou exigindo autorização) não pode ser ativada. Chaves ficam em variáveis de ambiente, nunca aqui." />
      {adminEnabled() ? <AdminIntelligence /> : <Notice state="partial">Administração desativada: defina ADMIN_TOKEN no servidor e use o perfil com banco (DATA_MODE=live).</Notice>}
    </div>
  );
}
