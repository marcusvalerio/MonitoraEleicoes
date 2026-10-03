import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCampaignAccess } from "@/auth/dal";
import { getInvestment, listInvestments } from "@/evaluation/repo";
import { DEFAULT_CATEGORIES } from "@/evaluation/model";
import { InvestmentForm } from "@/components/evaluation/InvestmentForm";

export const metadata: Metadata = { title: "Editar investimento", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, campaign } = await requireCampaignAccess({ min: "editor" });
  if (!campaign || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const i = await getInvestment(user.token, campaign.id, id);
  if (!i) notFound();
  const used = (await listInvestments(user.token, campaign.id)).map((x) => x.category);
  return (
    <div className="mx-auto max-w-[1080px] space-y-8 px-4 py-6 md:px-8 md:py-8">
      <header>
        <Link href={`/avaliacao/investimentos/${id}`} className="text-[12px] text-fg-3 hover:text-fg">← {i.name}</Link>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-[30px] font-semibold text-fg">Editar investimento</h1>
      </header>
      <InvestmentForm
        campaign={campaign.slug}
        categories={[...new Set([...DEFAULT_CATEGORIES, ...used])]}
        initial={{ id: i.id, name: i.name, category: i.category, amount: (i.amountCents / 100).toFixed(2).replace(".", ","), frequency: i.frequency, start: i.start, end: i.end, territory: { id: i.territoryId, name: i.territoryName, level: i.territoryLevel, uf: i.territoryUf }, notes: i.notes ?? "" }}
      />
    </div>
  );
}
