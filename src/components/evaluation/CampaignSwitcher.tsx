"use client";
import { ChevronDown } from "lucide-react";
import { switchCampaignAction } from "@/app/avaliacao/actions";

/** Troca de campanha: o servidor só aceita campanhas às quais o usuário tem acesso (RLS). */
export function CampaignSwitcher({ campaigns, current }: { campaigns: { slug: string; name: string }[]; current: string }) {
  if (campaigns.length < 2) return <span className="font-[family-name:var(--font-display)] text-[13px] font-semibold text-fg">{campaigns[0]?.name}</span>;
  return (
    <form action={switchCampaignAction} className="relative inline-flex items-center" data-testid="campaign-switcher">
      <label htmlFor="campaign-switch" className="sr-only">Campanha</label>
      <select id="campaign-switch" name="slug" defaultValue={current} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="h-9 appearance-none rounded-[8px] border border-border-strong bg-elevated pr-8 pl-3 font-[family-name:var(--font-display)] text-[13px] font-semibold text-fg">
        {campaigns.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-fg-3" aria-hidden />
      <noscript><button className="ml-2 text-[12px]">trocar</button></noscript>
    </form>
  );
}
