"use client";
import { useActionState } from "react";
import { createUserAction, memberAction } from "@/app/admin/actions";
import { ROLE_LABEL, ROLES } from "@/auth/roles";
import { fieldCls, labelCls, primaryBtn } from "./ui";

export function NewUserForm() {
  const [state, action, pending] = useActionState(createUserAction, {});
  return (
    <form action={action} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" data-testid="new-user-form">
      <div>
        <label className={labelCls} htmlFor="u-name">Nome</label>
        <input id="u-name" name="name" required className={fieldCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="u-email">E-mail</label>
        <input id="u-email" name="email" type="email" required className={fieldCls} />
      </div>
      <button disabled={pending} className={primaryBtn}>{pending ? "Criando…" : "Criar acesso"}</button>
      {state.error && <p role="alert" className="text-[12.5px] text-neg md:col-span-3">{state.error}</p>}
      {state.ok && (
        <div role="status" className="rounded-[8px] border border-pos/30 bg-pos/[0.06] px-3 py-2.5 text-[12.5px] text-fg-2 md:col-span-3" data-testid="temp-password">
          {state.ok}
          <p className="mt-1.5">Senha temporária (exibida só agora): <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[13px] text-fg select-all">{state.secret}</code></p>
        </div>
      )}
    </form>
  );
}

export function MemberForm({ campaigns, users, defaultCampaign }: { campaigns: { id: string; name: string }[]; users: { id: string; email: string }[]; defaultCampaign?: string }) {
  const [state, action, pending] = useActionState(memberAction, {});
  return (
    <form action={action} className="grid gap-4 md:grid-cols-[1fr_1fr_180px_auto] md:items-end" data-testid="member-form">
      <div>
        <label className={labelCls} htmlFor="m-campaign">Campanha</label>
        <select id="m-campaign" name="campaignId" defaultValue={defaultCampaign} className={fieldCls} required>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="m-user">Usuário</label>
        <select id="m-user" name="userId" className={fieldCls} required>
          {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="m-role">Papel</label>
        <select id="m-role" name="role" defaultValue="owner" className={fieldCls}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
      <button disabled={pending} className={primaryBtn}>Vincular</button>
      {state.error && <p role="alert" className="text-[12.5px] text-neg md:col-span-4">{state.error}</p>}
      {state.ok && <p role="status" className="text-[12.5px] text-pos md:col-span-4">{state.ok}</p>}
    </form>
  );
}
