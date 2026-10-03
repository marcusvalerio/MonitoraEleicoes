import "server-only";
import { withScope } from "@/auth/scope";
import { FREQUENCIES, isIsoDate, type Frequency, type Investment, type TerritoryLevel } from "./model";

/**
 * Investimentos registrados — SEMPRE sob RLS (withScope). O banco decide quem lê/escreve; created_by/updated_by
 * vêm de monitora_uid() (sessão validada no banco), nunca de um id enviado pelo cliente.
 */
const COLS = `i.id, i.name, i.category, i.amount_cents, i.frequency, i.start_date::text as start, i.end_date::text as "end",
  i.territory_id, t.name as territory_name, t.level as territory_level, t.uf as territory_uf, i.notes, i.created_at, i.updated_at`;

function map(x: Record<string, unknown>): Investment & { createdAt: string; updatedAt: string } {
  return {
    id: x.id as string,
    name: x.name as string,
    category: x.category as string,
    amountCents: Number(x.amount_cents),
    frequency: x.frequency as Frequency,
    start: x.start as string,
    end: x.end as string,
    territoryId: x.territory_id as number,
    territoryName: x.territory_name as string,
    territoryLevel: x.territory_level as TerritoryLevel,
    territoryUf: (x.territory_uf as string) ?? null,
    notes: (x.notes as string) ?? null,
    createdAt: new Date(x.created_at as string).toISOString(),
    updatedAt: new Date(x.updated_at as string).toISOString(),
  };
}

export async function listInvestments(token: string, campaignId: string) {
  return withScope(token, async (db) => (await db.query(`select ${COLS} from campaign_investment i join territory t on t.id = i.territory_id where i.campaign_id = $1 order by i.start_date desc, i.created_at desc`, [campaignId])).rows.map(map));
}

export async function getInvestment(token: string, campaignId: string, id: string) {
  return withScope(token, async (db) => {
    const r = await db.query(`select ${COLS} from campaign_investment i join territory t on t.id = i.territory_id where i.campaign_id = $1 and i.id = $2`, [campaignId, id]);
    return r.rows[0] ? map(r.rows[0]) : null;
  });
}

export interface InvestmentInput {
  name: string;
  category: string;
  amountCents: number;
  frequency: Frequency;
  start: string;
  end: string;
  territoryId: number;
  notes: string | null;
}

/** Validação de servidor (o banco repete as restrições por CHECK). Retorna mensagens por campo. */
export function validateInput(i: Partial<InvestmentInput>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!i.name || i.name.trim().length < 2) e.name = "Informe o nome da ação.";
  if (!i.category || i.category.trim().length < 2) e.category = "Informe a categoria.";
  if (!i.amountCents || i.amountCents <= 0) e.amount = "Informe um valor maior que zero.";
  if (!i.frequency || !FREQUENCIES.includes(i.frequency)) e.frequency = "Escolha a frequência.";
  if (!isIsoDate(i.start)) e.start = "Data inicial inválida.";
  if (!isIsoDate(i.end)) e.end = "Data final inválida.";
  if (isIsoDate(i.start) && isIsoDate(i.end) && i.end < i.start) e.end = "A data final deve ser igual ou posterior à inicial.";
  if (!Number.isInteger(i.territoryId)) e.territory = "Escolha o território.";
  if (i.notes && i.notes.length > 2000) e.notes = "Observação muito longa (máx. 2.000 caracteres).";
  return e;
}

const normalized = (i: InvestmentInput): InvestmentInput => ({ ...i, name: i.name.trim(), category: i.category.trim(), notes: i.notes?.trim() || null, end: i.frequency === "once" ? i.start : i.end });

export async function createInvestment(token: string, campaignId: string, input: InvestmentInput) {
  const i = normalized(input);
  return withScope(token, async (db) => {
    const r = await db.query(
      `insert into campaign_investment (campaign_id, name, category, amount_cents, frequency, start_date, end_date, territory_id, notes, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, monitora_uid(), monitora_uid()) returning id`,
      [campaignId, i.name, i.category, i.amountCents, i.frequency, i.start, i.end, i.territoryId, i.notes],
    );
    return r.rows[0].id as string;
  });
}

export async function updateInvestment(token: string, campaignId: string, id: string, input: InvestmentInput) {
  const i = normalized(input);
  return withScope(token, async (db) => {
    const r = await db.query(
      `update campaign_investment set name = $3, category = $4, amount_cents = $5, frequency = $6, start_date = $7, end_date = $8, territory_id = $9, notes = $10, updated_by = monitora_uid()
       where campaign_id = $1 and id = $2`,
      [campaignId, id, i.name, i.category, i.amountCents, i.frequency, i.start, i.end, i.territoryId, i.notes],
    );
    return r.rowCount === 1;
  });
}

export async function deleteInvestment(token: string, campaignId: string, id: string) {
  return withScope(token, async (db) => (await db.query(`delete from campaign_investment where campaign_id = $1 and id = $2`, [campaignId, id])).rowCount === 1);
}

/** Territórios existentes (estrutura geográfica oficial já usada no Monitora): Brasil, UFs e municípios por busca. */
export async function territoryOptions(token: string, q: string, uf: string | null) {
  return withScope(token, async (db) => {
    const r = await db.query(
      `select id, name, level, uf from territory
       where level in ('pais', 'uf', 'municipio') and ($1 = '' or translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') like '%' || translate(lower($1), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') || '%') and ($2::text is null or uf = $2 or level = 'pais')
       order by case level when 'pais' then 0 when 'uf' then 1 else 2 end, name limit 40`,
      [q.trim(), uf],
    );
    return r.rows as { id: number; name: string; level: TerritoryLevel; uf: string | null }[];
  });
}
