import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/auth/dal";
import { listCampaigns } from "@/auth/admin";
import { campaignStatusAction } from "../actions";
import { NewCampaignForm } from "@/components/admin/CampaignForms";
import { cardCls, ghostBtn } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Campanhas" };

export default async function Page() {
  const admin = await requireAdmin("/admin/campanhas");
  const rows = await listCampaigns(admin.token);
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-[26px] font-semibold text-fg">Campanhas</h1>
        <p className="mt-1 text-[13px] text-fg-2">Cada campanha isola seus próprios registros. Dados oficiais do TSE continuam globais.</p>
      </header>
      <section className={`${cardCls} p-5`} aria-label="Nova campanha">
        <h2 className="mb-4 text-[13px] font-semibold text-fg">Nova campanha</h2>
        <NewCampaignForm />
      </section>
      <section aria-label="Lista de campanhas">
        {rows.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-border px-4 py-6 text-center text-[13px] text-fg-3">Nenhuma campanha criada ainda.</p>
        ) : (
          <ul className="divide-y divide-border rounded-[12px] border border-border" data-testid="campaign-list">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-fg">
                    {c.name}
                    <span className={`rounded-[4px] border px-1.5 text-[10px] tracking-[0.1em] uppercase ${c.status === "active" ? "border-pos/40 text-pos" : "border-border text-fg-3"}`}>{c.status === "active" ? "ativa" : "arquivada"}</span>
                  </p>
                  <p className="truncate text-[12px] text-fg-3">{c.slug} · {c.candidacyLabel ?? "sem candidatura oficial vinculada"}</p>
                </div>
                <p className="text-[12px] text-fg-2 tabular-nums">{c.members} {c.members === 1 ? "membro" : "membros"} · {c.investments} investimentos</p>
                <div className="flex gap-1">
                  <Link href={`/admin/usuarios?campanha=${c.id}`} className={ghostBtn}>Acessos</Link>
                  <Link href={`/avaliacao?campanha=${c.slug}`} className={ghostBtn}>Abrir</Link>
                  <form action={campaignStatusAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value={c.status === "active" ? "archived" : "active"} />
                    <button className={ghostBtn}>{c.status === "active" ? "Arquivar" : "Reativar"}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
