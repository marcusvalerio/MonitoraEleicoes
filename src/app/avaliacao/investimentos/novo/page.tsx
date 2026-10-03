import type { Metadata } from "next";
import Link from "next/link";
import { requireCampaignAccess } from "@/auth/dal";
import { listInvestments } from "@/evaluation/repo";
import { DEFAULT_CATEGORIES } from "@/evaluation/model";
import { todayBR } from "@/evaluation/service";
import { InvestmentForm } from "@/components/evaluation/InvestmentForm";

export const metadata: Metadata = { title: "Registrar investimento", robots: { index: false } };

export default async function Page() {
  const { user, campaign } = await requireCampaignAccess({ min: "editor" });
  if (!campaign) return null;
  const used = (await listInvestments(user.token, campaign.id)).map((i) => i.category);
  const today = todayBR();
  return (
    <div className="mx-auto max-w-[1080px] space-y-8 px-4 py-6 md:px-8 md:py-8">
      <header>
        <Link href="/avaliacao" className="text-[12px] text-fg-3 hover:text-fg">← Avaliação · {campaign.name}</Link>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-[30px] font-semibold text-fg">Registrar investimento</h1>
        <p className="mt-1 text-[13.5px] text-fg-2">Um registro por ação. Para ações recorrentes, informe a frequência e o período — o Monitora calcula as ocorrências.</p>
      </header>
      <InvestmentForm campaign={campaign.slug} categories={[...new Set([...DEFAULT_CATEGORIES, ...used])]} initial={{ name: "", category: "", amount: "", frequency: "once", start: today, end: today, territory: null, notes: "" }} />
    </div>
  );
}
