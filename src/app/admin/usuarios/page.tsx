import type { Metadata } from "next";
import { requireAdmin } from "@/auth/dal";
import { listCampaigns, listMembers, listUsers } from "@/auth/admin";
import { ROLE_LABEL } from "@/auth/roles";
import { banUserAction, removeMemberAction } from "../actions";
import { MemberForm, NewUserForm } from "@/components/admin/UserForms";
import { cardCls, ghostBtn } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Usuários" };

export default async function Page({ searchParams }: { searchParams: Promise<{ campanha?: string }> }) {
  const admin = await requireAdmin("/admin/usuarios");
  const [users, campaigns, members] = await Promise.all([listUsers(), listCampaigns(admin.token), listMembers(admin.token)]);
  const { campanha } = await searchParams;
  const byUser = new Map<string, typeof members>();
  for (const m of members) byUser.set(m.userId, [...(byUser.get(m.userId) ?? []), m]);
  const active = campaigns.filter((c) => c.status === "active");
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-[26px] font-semibold text-fg">Usuários</h1>
        <p className="mt-1 text-[13px] text-fg-2">Contas são criadas aqui (não há cadastro público). Papéis: owner — acesso completo à campanha; editor — lê e edita; leitura — somente leitura.</p>
      </header>
      <section className={`${cardCls} p-5`} aria-label="Novo usuário">
        <h2 className="mb-4 text-[13px] font-semibold text-fg">Criar acesso</h2>
        <NewUserForm />
      </section>
      {active.length > 0 && users.length > 0 && (
        <section className={`${cardCls} p-5`} aria-label="Vincular usuário a campanha">
          <h2 className="mb-4 text-[13px] font-semibold text-fg">Vincular a campanha / alterar papel</h2>
          <MemberForm campaigns={active.map((c) => ({ id: c.id, name: c.name }))} users={users.filter((u) => u.role !== "admin").map((u) => ({ id: u.id, email: u.email }))} defaultCampaign={campanha} />
        </section>
      )}
      <ul className="divide-y divide-border rounded-[12px] border border-border" data-testid="user-list">
        {users.map((u) => (
          <li key={u.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[14px] font-medium text-fg">{u.name}</p>
              <p className="text-[12.5px] text-fg-3">{u.email}</p>
              {u.role === "admin" && <span className="rounded-[4px] border border-info/50 px-1.5 text-[10px] tracking-[0.1em] text-info">ADMIN</span>}
              {u.banned && <span className="rounded-[4px] border border-neg/50 px-1.5 text-[10px] tracking-[0.1em] text-neg">BLOQUEADO</span>}
              {u.must_change && <span className="text-[11px] text-fg-3">· troca de senha pendente</span>}
              {u.id !== admin.id && (
                <form action={banUserAction} className="ml-auto">
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="ban" value={u.banned ? "0" : "1"} />
                  <button className={ghostBtn}>{u.banned ? "Desbloquear" : "Bloquear conta"}</button>
                </form>
              )}
            </div>
            {(byUser.get(u.id) ?? []).length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {byUser.get(u.id)!.map((m) => (
                  <li key={m.id} className="flex items-center gap-1 rounded-[6px] border border-border bg-bg px-2 py-1 text-[12px] text-fg-2">
                    {m.campaignName} · {ROLE_LABEL[m.role]}
                    <form action={removeMemberAction}>
                      <input type="hidden" name="memberId" value={m.id} />
                      <button className="ml-1 text-fg-3 hover:text-neg" aria-label={`Remover acesso de ${u.email} a ${m.campaignName}`}>×</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
