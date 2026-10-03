/** RBAC — papéis por campanha. ADMIN é papel global da plataforma (auth_user.role = 'admin'). */
export type CampaignRole = "owner" | "editor" | "viewer";
export const ROLES: CampaignRole[] = ["owner", "editor", "viewer"];
export const ROLE_LABEL: Record<CampaignRole, string> = { owner: "Responsável (owner)", editor: "Editor", viewer: "Leitura" };
const RANK: Record<CampaignRole, number> = { viewer: 1, editor: 2, owner: 3 };

/** Papel suficiente? (owner ⊃ editor ⊃ viewer). Admin NÃO herda escrita em dados de campanha (só leitura). */
export function roleAllows(role: CampaignRole | null | undefined, min: CampaignRole) {
  return !!role && RANK[role] >= RANK[min];
}
export const canWrite = (role: CampaignRole | null | undefined) => roleAllows(role, "editor");
export const isRole = (x: unknown): x is CampaignRole => typeof x === "string" && (ROLES as string[]).includes(x);

/** Destino após login: ADMIN → /admin; usuário de campanha → /avaliacao. `next` só aceita caminho interno. */
export function safeNext(next: string | null | undefined, isAdmin: boolean) {
  if (next && /^\/(?!\/)[\w\-/?=&%.]*$/.test(next) && !next.startsWith("/login")) return next;
  return isAdmin ? "/admin" : "/avaliacao";
}
