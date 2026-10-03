"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CAMPAIGN_COOKIE, myCampaigns, requireCampaignAccess } from "@/auth/dal";
import { canWrite } from "@/auth/roles";
import { createInvestment, deleteInvestment, territoryOptions, updateInvestment, validateInput, type InvestmentInput } from "@/evaluation/repo";
import { FREQUENCIES, parseMoneyToCents, type Frequency } from "@/evaluation/model";

export type FormState = { errors?: Record<string, string>; error?: string };

/** Campanha em uso: cookie só é gravado se o usuário tiver acesso (validado no banco via RLS). */
export async function switchCampaignAction(f: FormData) {
  const slug = String(f.get("slug") ?? "");
  const ok = (await myCampaigns()).some((c) => c.slug === slug);
  if (ok) (await cookies()).set(CAMPAIGN_COOKIE, slug, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  redirect("/avaliacao");
}

function parse(f: FormData): Partial<InvestmentInput> {
  const freq = String(f.get("frequency") ?? "");
  return {
    name: String(f.get("name") ?? ""),
    category: String(f.get("category") ?? ""),
    amountCents: parseMoneyToCents(String(f.get("amount") ?? "")) ?? undefined,
    frequency: (FREQUENCIES as string[]).includes(freq) ? (freq as Frequency) : undefined,
    start: String(f.get("start") ?? ""),
    end: String(f.get("end") || f.get("start") || ""),
    territoryId: Number(f.get("territoryId") || NaN),
    notes: String(f.get("notes") ?? "") || null,
  };
}

/**
 * Criar/editar: campanha resolvida NO SERVIDOR (slug do formulário só é aceito se o usuário tiver acesso);
 * papel mínimo editor; o banco repete a verificação (RLS) e grava a autoria via monitora_uid().
 */
export async function saveInvestmentAction(_: FormState, f: FormData): Promise<FormState> {
  const { user, campaign } = await requireCampaignAccess({ slug: String(f.get("campaign") ?? "") || null, min: "editor" });
  if (!campaign || !canWrite(campaign.role)) return { error: "Sem permissão para registrar nesta campanha." };
  const input = parse(f);
  const errors = validateInput(input);
  if (Object.keys(errors).length) return { errors };
  const id = String(f.get("id") ?? "");
  let target: string;
  try {
    if (id) {
      if (!(await updateInvestment(user.token, campaign.id, id, input as InvestmentInput))) return { error: "Investimento não encontrado nesta campanha." };
      target = `/avaliacao/investimentos/${id}`;
    } else target = `/avaliacao/investimentos/${await createInvestment(user.token, campaign.id, input as InvestmentInput)}?criado=1`;
  } catch (e) {
    return { error: /row-level security/.test(String(e)) ? "Sem permissão para registrar nesta campanha." : /territory/.test(String(e)) ? "Território inválido." : "Não foi possível salvar." };
  }
  revalidatePath("/avaliacao");
  redirect(target);
}

export async function deleteInvestmentAction(f: FormData) {
  const { user, campaign } = await requireCampaignAccess({ min: "editor" });
  if (campaign) await deleteInvestment(user.token, campaign.id, String(f.get("id")));
  revalidatePath("/avaliacao");
  redirect("/avaliacao#investimentos");
}

/** Busca de território na estrutura geográfica existente (Brasil, UF, município). */
export async function territorySearchAction(q: string, uf: string | null) {
  const { user } = await requireCampaignAccess();
  return territoryOptions(user.token, q, uf && /^[A-Z]{2}$/.test(uf) ? uf : null);
}
