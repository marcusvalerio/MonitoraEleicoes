"use server";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/dal";
import { getAuth } from "@/auth/server";
import { isRole } from "@/auth/roles";
import { createCampaign, removeMember, searchOfficialCandidacies, setCampaignCandidacy, setCampaignStatus, upsertMember } from "@/auth/admin";

type Result = { error?: string; ok?: string; secret?: string };
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function createCampaignAction(_: Result, f: FormData): Promise<Result> {
  const admin = await requireAdmin();
  const name = String(f.get("name") ?? "").trim();
  const slug = slugify(String(f.get("slug") || name));
  const cand = Number(f.get("candidacyId") || NaN);
  if (name.length < 2) return { error: "Informe o nome da campanha." };
  if (!slug) return { error: "Identificador inválido." };
  try {
    await createCampaign(admin.token, { name, slug, candidacyId: Number.isInteger(cand) ? cand : null });
  } catch (e) {
    return { error: /unique|duplicate/i.test(String(e)) ? "Já existe uma campanha com esse identificador." : "Não foi possível criar a campanha." };
  }
  revalidatePath("/admin/campanhas");
  return { ok: `Campanha “${name}” criada. Agora adicione o responsável (owner) em Usuários.` };
}

export async function campaignStatusAction(f: FormData) {
  const admin = await requireAdmin();
  const status = f.get("status") === "archived" ? "archived" : "active";
  await setCampaignStatus(admin.token, String(f.get("id")), status);
  revalidatePath("/admin/campanhas");
}

export async function campaignCandidacyAction(f: FormData) {
  const admin = await requireAdmin();
  const cand = Number(f.get("candidacyId") || NaN);
  await setCampaignCandidacy(admin.token, String(f.get("id")), Number.isInteger(cand) ? cand : null);
  revalidatePath("/admin/campanhas");
}

export async function searchCandidaciesAction(q: string, year: number) {
  await requireAdmin();
  return searchOfficialCandidacies(q, Number.isInteger(year) ? year : 2026);
}

/** Cria a conta com senha TEMPORÁRIA aleatória (exibida uma única vez ao ADMIN) e troca obrigatória no 1º acesso. */
export async function createUserAction(_: Result, f: FormData): Promise<Result> {
  await requireAdmin();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const name = String(f.get("name") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "E-mail inválido." };
  if (name.length < 2) return { error: "Informe o nome." };
  const temp = randomBytes(12).toString("base64url");
  try {
    await (await getAuth()).api.createUser({ body: { email, name, password: temp, role: "user", data: { mustChangePassword: true } }, headers: await headers() });
  } catch (e) {
    return { error: /exist/i.test(String(e)) ? "Já existe uma conta com esse e-mail." : "Não foi possível criar a conta." };
  }
  revalidatePath("/admin/usuarios");
  return { ok: `Conta criada para ${email}. Envie a senha temporária por um canal seguro; ela será trocada no primeiro acesso.`, secret: temp };
}

export async function memberAction(_: Result, f: FormData): Promise<Result> {
  const admin = await requireAdmin();
  const role = f.get("role");
  if (!isRole(role)) return { error: "Papel inválido." };
  const campaignId = String(f.get("campaignId") ?? "");
  const userId = String(f.get("userId") ?? "");
  if (!campaignId || !userId) return { error: "Escolha campanha e usuário." };
  await upsertMember(admin.token, campaignId, userId, role);
  revalidatePath("/admin/usuarios");
  return { ok: "Acesso atualizado." };
}

export async function removeMemberAction(f: FormData) {
  const admin = await requireAdmin();
  await removeMember(admin.token, String(f.get("memberId")));
  revalidatePath("/admin/usuarios");
}

/** Bloqueia/desbloqueia a conta (revoga sessões). O ADMIN não bloqueia a si mesmo. */
export async function banUserAction(f: FormData) {
  const admin = await requireAdmin();
  const userId = String(f.get("userId"));
  if (userId === admin.id) return;
  const auth = await getAuth();
  const h = await headers();
  if (f.get("ban") === "1") await auth.api.banUser({ body: { userId, banReason: "acesso removido pela administração" }, headers: h });
  else await auth.api.unbanUser({ body: { userId }, headers: h });
  revalidatePath("/admin/usuarios");
}
