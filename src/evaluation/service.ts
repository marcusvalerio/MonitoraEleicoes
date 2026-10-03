import "server-only";
import { createSql } from "@/persistence/db";
import type { AuthUser, CampaignAccess } from "@/auth/dal";
import { listInvestments } from "./repo";
import { byTerritory, byUf, outermost, ppDiff, statusOf, summarize, timeline, totalCents, occurrences, valuePerVoteCents, variation, DEFAULT_CATEGORIES, type Frequency, type Investment, type InvestmentStatus } from "./model";
import { candidacyRef, observedFor, otherCandidacies, resultsSource, type CandidacyRef, type Observed } from "./results";

export interface Filters {
  from: string | null;
  to: string | null;
  territoryId: number | null;
  category: string | null;
  frequency: Frequency | null;
  status: InvestmentStatus | null;
  q: string;
}

export const todayBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export function applyFilters(items: Investment[], f: Filters, today: string) {
  const q = f.q.trim().toLowerCase();
  return items.filter(
    (i) =>
      (!f.territoryId || i.territoryId === f.territoryId) &&
      (!f.category || i.category === f.category) &&
      (!f.frequency || i.frequency === f.frequency) &&
      (!f.status || statusOf(i, today) === f.status) &&
      (!f.from || i.end >= f.from) &&
      (!f.to || i.start <= f.to) &&
      (!q || `${i.name} ${i.category} ${i.territoryName} ${i.notes ?? ""}`.toLowerCase().includes(q)),
  );
}

export type ResultBlock =
  | { state: "not_linked" }
  | { state: "source_unavailable" }
  | {
      state: "ready";
      candidacy: CandidacyRef;
      base: CandidacyRef | null;
      bases: { id: number; year: number; office: string; ballot_name: string }[];
      source: { source_url: string } | null;
      rows: { territoryId: number; name: string; level: string; cents: number; actions: number; current: Observed; base: Observed | null; pp: number | null; votesVar: ReturnType<typeof variation> }[];
      totals: { cents: number; votes: number | null; perVoteCents: number | null; covered: number };
    };

/** Monta tudo o que a página precisa: registros (RLS), agregações e o cruzamento DESCRITIVO com o resultado oficial. */
export async function evaluationData(user: AuthUser, campaign: CampaignAccess, f: Filters, baseId: number | null) {
  const today = todayBR();
  const all = await listInvestments(user.token, campaign.id);
  const items = applyFilters(all, f, today);
  const range = [f.from, f.to] as const;
  const summary = summarize(items, ...range);
  const territories = byTerritory(items, ...range);
  const series = { day: timeline(items, "day", ...range), week: timeline(items, "week", ...range), month: timeline(items, "month", ...range) };
  const rows = items.map((i) => ({ ...i, status: statusOf(i, today), occurrences: occurrences(i).length, totalCents: totalCents(i) }));
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...all.map((i) => i.category)])];
  const territoryOptions = [...new Map(all.map((i) => [i.territoryId, { id: i.territoryId, name: i.territoryName, level: i.territoryLevel }])).values()];
  return { today, all, items, rows, summary, territories, ufTotals: Object.fromEntries(byUf(items, ...range)), series, categories, territoryOptions, result: await resultBlock(campaign, territories, baseId) };
}

async function resultBlock(campaign: CampaignAccess, territories: ReturnType<typeof byTerritory>, baseId: number | null): Promise<ResultBlock> {
  if (!campaign.candidacyId) return { state: "not_linked" };
  try {
    const sql = createSql(process.env.DATABASE_URL);
    const candidacy = await candidacyRef(sql, campaign.candidacyId);
    if (!candidacy) return { state: "not_linked" };
    const bases = candidacy.personId ? await otherCandidacies(sql, candidacy.personId, candidacy.id) : [];
    const base = baseId && bases.some((b) => b.id === baseId) ? await candidacyRef(sql, baseId) : null;
    const refs = territories.map((t) => ({ id: t.territoryId, level: t.level, uf: t.uf }));
    const [cur, prev, source] = await Promise.all([observedFor(sql, candidacy, refs), base ? observedFor(sql, base, refs) : Promise.resolve(null), resultsSource(sql, candidacy.year)]);
    const rows = territories.map((t, k) => {
      const c = cur[k];
      const b = prev?.[k] ?? null;
      return { territoryId: t.territoryId, name: t.name, level: t.level, cents: t.cents, actions: t.actions, current: c, base: b, pp: ppDiff(b?.share ?? null, c.share), votesVar: variation(b?.votes ?? null, c.votes) };
    });
    // Totais sem dupla contagem (Brasil ⊃ UF ⊃ município) e só onde há valor oficial.
    const outer = new Set(outermost(refs).map((r) => r.id));
    const counted = rows.filter((r) => outer.has(r.territoryId) && r.current.state === "value");
    const votes = counted.length ? counted.reduce((a, r) => a + (r.current.votes ?? 0), 0) : null;
    const cents = rows.reduce((a, r) => a + r.cents, 0);
    // "Valor registrado por voto observado": só o investimento em territórios com resultado oficial disponível.
    const centsWithResult = rows.filter((r) => r.current.state === "value").reduce((a, r) => a + r.cents, 0);
    return { state: "ready", candidacy, base, bases, source, rows, totals: { cents, votes, perVoteCents: valuePerVoteCents(centsWithResult, votes), covered: counted.length } };
  } catch {
    return { state: "source_unavailable" };
  }
}

/** Comparação de dois períodos de INVESTIMENTO registrado (descritiva). */
export function periodComparison(items: Investment[], a: { from: string; to: string }, b: { from: string; to: string }) {
  const sa = summarize(items, a.from, a.to);
  const sb = summarize(items, b.from, b.to);
  return { a: sa, b: sb, cents: variation(sa.totalCents, sb.totalCents), actions: variation(sa.actions, sb.actions), perAction: variation(sa.avgPerActionCents, sb.avgPerActionCents) };
}

