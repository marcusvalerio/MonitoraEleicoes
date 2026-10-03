import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { authEnabled, getAuth } from "./server";
import { withScope } from "./scope";
import { roleAllows, type CampaignRole } from "./roles";

/**
 * Camada central de acesso (DAL). TODA página/ação/rota com dado de campanha passa por aqui;
 * a decisão final é do banco (RLS), estes helpers só evitam renderizar o que o usuário não pode ver.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  /** Token da sessão (cookie httpOnly) — usado só no servidor para o contexto RLS. Nunca enviar ao cliente. */
  token: string;
}
export interface CampaignAccess {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  candidacyId: number | null;
  role: CampaignRole | null;
}

export const CAMPAIGN_COOKIE = "monitora_campanha";

export const getAuthenticatedUser = cache(async (): Promise<AuthUser | null> => {
  if (!authEnabled()) return null;
  const s = await (await getAuth()).api.getSession({ headers: await headers() }).catch(() => null);
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string | null; mustChangePassword?: boolean; banned?: boolean | null };
  if (u.banned) return null;
  return { id: u.id, email: u.email, name: u.name, isAdmin: u.role === "admin", mustChangePassword: !!u.mustChangePassword, token: s.session.token };
});

/** Exige sessão; sem sessão → /login?next=…; senha inicial pendente → troca obrigatória. */
export async function requireAuth(next = "/avaliacao", opts: { allowPasswordChange?: boolean } = {}): Promise<AuthUser> {
  const u = await getAuthenticatedUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (u.mustChangePassword && !opts.allowPasswordChange) redirect("/conta/senha?obrigatoria=1");
  return u;
}

export async function requireAdmin(next = "/admin"): Promise<AuthUser> {
  const u = await requireAuth(next);
  if (!u.isAdmin) forbidden();
  return u;
}

/** Campanhas visíveis ao usuário (RLS): membro ⇒ as suas; ADMIN ⇒ todas (papel null = acesso administrativo). */
export const myCampaigns = cache(async (): Promise<CampaignAccess[]> => {
  const u = await getAuthenticatedUser();
  if (!u) return [];
  return withScope(u.token, async (db) => {
    const r = await db.query(`select id, name, slug, status, candidacy_id, monitora_campaign_role(id) as role from campaign order by status, name`);
    return r.rows.map((x) => ({ id: x.id, name: x.name, slug: x.slug, status: x.status, candidacyId: x.candidacy_id, role: x.role }));
  });
});

/**
 * Campanha em uso: a do cookie (só se o usuário tem acesso — validado no servidor/banco) ou a primeira disponível.
 * `min` exige papel mínimo de MEMBRO (ADMIN sem vínculo só lê).
 */
export async function requireCampaignAccess(opts: { slug?: string | null; min?: CampaignRole } = {}): Promise<{ user: AuthUser; campaign: CampaignAccess | null; campaigns: CampaignAccess[] }> {
  const user = await requireAuth("/avaliacao");
  const campaigns = (await myCampaigns()).filter((c) => c.status === "active" || user.isAdmin);
  const wanted = opts.slug ?? (await cookies()).get(CAMPAIGN_COOKIE)?.value ?? null;
  const campaign = campaigns.find((c) => c.slug === wanted) ?? campaigns[0] ?? null;
  if (opts.slug && (!campaign || campaign.slug !== opts.slug)) forbidden();
  if (campaign && opts.min) requireRole(campaign, opts.min);
  return { user, campaign, campaigns };
}

export function requireRole(campaign: CampaignAccess, min: CampaignRole) {
  if (!roleAllows(campaign.role, min)) forbidden();
}
