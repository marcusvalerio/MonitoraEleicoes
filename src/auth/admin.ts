import "server-only";
import { createSql } from "@/persistence/db";
import { withScope } from "./scope";
import type { CampaignRole } from "./roles";

/**
 * Operações do PAINEL ADMIN. Escritas de campanha/vínculo passam por RLS (só monitora_is_admin() escreve);
 * leitura de contas (auth_user) só é chamada depois de requireAdmin() no servidor.
 */
const http = () => createSql(process.env.DATABASE_URL);

export interface CampaignRow {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  candidacyId: number | null;
  candidacyLabel: string | null;
  members: number;
  investments: number;
  createdAt: string;
}

export async function listCampaigns(token: string): Promise<CampaignRow[]> {
  const rows = await withScope(token, async (db) =>
    (
      await db.query(`select c.id, c.name, c.slug, c.status, c.candidacy_id, c.created_at,
        (select count(*) from campaign_member m where m.campaign_id = c.id)::int as members,
        (select count(*) from campaign_investment i where i.campaign_id = c.id)::int as investments
        from campaign c order by c.status, c.created_at desc`)
    ).rows,
  );
  const ids = rows.map((r) => r.candidacy_id).filter(Boolean);
  const labels = ids.length ? ((await http().query(`select c.id, c.year, c.ballot_name, o.name as office, t.uf from candidacy c join office o on o.id = c.office_id join territory t on t.id = c.territory_id where c.id = any($1::int[])`, [ids])) as { id: number; year: number; ballot_name: string; office: string; uf: string | null }[]) : [];
  const lab = new Map(labels.map((l) => [l.id, `${l.ballot_name} · ${l.office}${l.uf && l.uf !== "BR" ? ` (${l.uf})` : ""} · ${l.year}`]));
  return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, status: r.status, candidacyId: r.candidacy_id, candidacyLabel: lab.get(r.candidacy_id) ?? null, members: r.members, investments: r.investments, createdAt: new Date(r.created_at).toISOString() }));
}

export async function createCampaign(token: string, i: { name: string; slug: string; candidacyId: number | null }) {
  return withScope(token, async (db) => (await db.query(`insert into campaign (name, slug, candidacy_id) values ($1, $2, $3) returning id`, [i.name, i.slug, i.candidacyId])).rows[0].id as string);
}

export async function setCampaignStatus(token: string, id: string, status: "active" | "archived") {
  return withScope(token, async (db) => (await db.query(`update campaign set status = $2 where id = $1`, [id, status])).rowCount === 1);
}

export async function setCampaignCandidacy(token: string, id: string, candidacyId: number | null) {
  return withScope(token, async (db) => (await db.query(`update campaign set candidacy_id = $2 where id = $1`, [id, candidacyId])).rowCount === 1);
}

export interface MemberRow {
  id: string;
  campaignId: string;
  campaignName: string;
  userId: string;
  role: CampaignRole;
}
export async function listMembers(token: string): Promise<MemberRow[]> {
  return withScope(token, async (db) =>
    (await db.query(`select m.id, m.campaign_id, c.name as campaign_name, m.user_id, m.role from campaign_member m join campaign c on c.id = m.campaign_id order by c.name`)).rows.map((r) => ({ id: r.id, campaignId: r.campaign_id, campaignName: r.campaign_name, userId: r.user_id, role: r.role })),
  );
}

export async function upsertMember(token: string, campaignId: string, userId: string, role: CampaignRole) {
  return withScope(token, async (db) => {
    await db.query(`insert into campaign_member (campaign_id, user_id, role) values ($1, $2, $3) on conflict (campaign_id, user_id) do update set role = excluded.role`, [campaignId, userId, role]);
  });
}

export async function removeMember(token: string, memberId: string) {
  return withScope(token, async (db) => (await db.query(`delete from campaign_member where id = $1`, [memberId])).rowCount === 1);
}

/** Contas (somente após requireAdmin): sem hash de senha, sem tokens. */
export async function listUsers() {
  return (await http()`select id, name, email, role, coalesce(banned, false) as banned, "mustChangePassword" as must_change, "createdAt" as created_at from auth_user order by "createdAt" desc`) as { id: string; name: string; email: string; role: string | null; banned: boolean; must_change: boolean; created_at: string }[];
}

/** Candidaturas OFICIAIS (TSE) para vincular à campanha — busca por nome de urna/nome. */
export async function searchOfficialCandidacies(q: string, year: number) {
  const t = q.trim();
  if (t.length < 3) return [];
  return (await http().query(
    `select c.id, c.year, c.ballot_name, c.name, c.party_acronym, o.name as office, t.uf from candidacy c join office o on o.id = c.office_id join territory t on t.id = c.territory_id
     where c.year = $2 and (c.normalized_name like '%' || upper(translate($1, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) || '%' or upper(c.ballot_name) like '%' || upper($1) || '%')
     order by o.id, c.ballot_name limit 15`,
    [t, year],
  )) as { id: number; year: number; ballot_name: string; name: string; party_acronym: string | null; office: string; uf: string | null }[];
}
