/**
 * Avaliação — domínio puro (sem I/O). Investimento registrado = UMA regra; ocorrências são DERIVADAS da regra,
 * sempre dentro do intervalo [início, fim] informado (nada é gerado fora dele). Valores em centavos (inteiros).
 * Comparações são DESCRITIVAS: nunca expressam causalidade.
 */
export type Frequency = "once" | "daily" | "weekly" | "biweekly" | "monthly";
export const FREQUENCIES: Frequency[] = ["once", "daily", "weekly", "biweekly", "monthly"];
export const FREQUENCY_LABEL: Record<Frequency, string> = { once: "Único", daily: "Diário", weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal" };
export const DEFAULT_CATEGORIES = ["Material", "Eventos", "Transporte", "Estrutura", "Comunicação", "Equipe", "Produção", "Outros"];

export type InvestmentStatus = "agendado" | "ativo" | "encerrado";
export const STATUS_LABEL: Record<InvestmentStatus, string> = { agendado: "Agendado", ativo: "Ativo", encerrado: "Encerrado" };

export interface Rule {
  frequency: Frequency;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD (≥ start) */
  end: string;
  amountCents: number;
}

export interface Investment extends Rule {
  id: string;
  name: string;
  category: string;
  territoryId: number;
  territoryName: string;
  territoryLevel: TerritoryLevel;
  territoryUf: string | null;
  notes: string | null;
}
export type TerritoryLevel = "pais" | "regiao" | "uf" | "municipio";

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function isIsoDate(d: unknown): d is string {
  return typeof d === "string" && ISO.test(d) && fromMs(toMs(d)) === d;
}
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Limite de segurança de ocorrências por regra (≈ 10 anos diários). */
export const MAX_OCCURRENCES = 3700;

/** Datas das ocorrências da regra, em ordem, dentro de [start, end]. Mensal: mesmo dia do mês (ajustado ao último dia). */
export function occurrences(r: Pick<Rule, "frequency" | "start" | "end">): string[] {
  if (!isIsoDate(r.start) || !isIsoDate(r.end) || r.end < r.start) return [];
  if (r.frequency === "once") return [r.start];
  const end = toMs(r.end);
  const out: string[] = [];
  if (r.frequency === "monthly") {
    const [y, m, d] = r.start.split("-").map(Number);
    for (let i = 0; out.length < MAX_OCCURRENCES; i++) {
      const yy = y + Math.floor((m - 1 + i) / 12);
      const mm = (m - 1 + i) % 12;
      const ms = Date.UTC(yy, mm, Math.min(d, daysInMonth(yy, mm)));
      if (ms > end) break;
      out.push(fromMs(ms));
    }
    return out;
  }
  const step = { daily: 1, weekly: 7, biweekly: 14 }[r.frequency] * DAY;
  for (let ms = toMs(r.start); ms <= end && out.length < MAX_OCCURRENCES; ms += step) out.push(fromMs(ms));
  return out;
}

export const totalCents = (r: Rule) => occurrences(r).length * r.amountCents;

export function statusOf(r: Pick<Rule, "start" | "end">, today: string): InvestmentStatus {
  if (today < r.start) return "agendado";
  if (today > r.end) return "encerrado";
  return "ativo";
}

/** Ocorrências (data, valor) de várias regras, opcionalmente limitadas a [from, to]. */
export function flows(items: (Rule & { id?: string })[], from?: string | null, to?: string | null) {
  return items.flatMap((r) => occurrences(r).filter((d) => (!from || d >= from) && (!to || d <= to)).map((date) => ({ date, cents: r.amountCents, id: r.id })));
}

export type Granularity = "day" | "week" | "month";
/** Início do intervalo: dia; semana ISO (segunda-feira); mês (dia 1). */
export function bucketOf(date: string, g: Granularity): string {
  if (g === "day") return date;
  if (g === "month") return `${date.slice(0, 7)}-01`;
  const ms = toMs(date);
  const dow = (new Date(ms).getUTCDay() + 6) % 7;
  return fromMs(ms - dow * DAY);
}
function nextBucket(b: string, g: Granularity): string {
  if (g === "day") return fromMs(toMs(b) + DAY);
  if (g === "week") return fromMs(toMs(b) + 7 * DAY);
  const [y, m] = b.split("-").map(Number);
  return fromMs(Date.UTC(y + Math.floor(m / 12), m % 12, 1));
}

/** Série temporal do investimento registrado. Intervalos sem registro entram com 0 (nenhum valor REGISTRADO), entre o 1º e o último. */
export function timeline(items: Rule[], g: Granularity, from?: string | null, to?: string | null) {
  const f = flows(items, from, to);
  if (!f.length) return [];
  const sums = new Map<string, number>();
  for (const x of f) sums.set(bucketOf(x.date, g), (sums.get(bucketOf(x.date, g)) ?? 0) + x.cents);
  const keys = [...sums.keys()].sort();
  const out: { start: string; cents: number }[] = [];
  for (let b = keys[0]; b <= keys[keys.length - 1]; b = nextBucket(b, g)) out.push({ start: b, cents: sums.get(b) ?? 0 });
  return out;
}

export interface Summary {
  totalCents: number;
  actions: number;
  occurrences: number;
  territories: number;
  period: { start: string; end: string } | null;
  avgPerActionCents: number | null;
  avgPerTerritoryCents: number | null;
}
export function summarize(items: (Rule & { territoryId?: number })[], from?: string | null, to?: string | null): Summary {
  const f = flows(items, from, to);
  const total = f.reduce((a, x) => a + x.cents, 0);
  const used = items.filter((r) => flows([r], from, to).length > 0);
  const terr = new Set(used.map((r) => r.territoryId).filter((x) => x !== undefined)).size;
  const period = used.length ? { start: used.reduce((a, r) => (r.start < a ? r.start : a), used[0].start), end: used.reduce((a, r) => (r.end > a ? r.end : a), used[0].end) } : null;
  return { totalCents: total, actions: used.length, occurrences: f.length, territories: terr, period, avgPerActionCents: safeDiv(total, used.length), avgPerTerritoryCents: safeDiv(total, terr) };
}

/** Divisão protegida: denominador ausente/0 ⇒ null (exibido como "—"), nunca Infinity/NaN/0 inventado. */
export function safeDiv(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined || b === 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a / b;
}

export function byTerritory(items: Investment[], from?: string | null, to?: string | null) {
  const m = new Map<number, { territoryId: number; name: string; level: TerritoryLevel; uf: string | null; cents: number; actions: number; occurrences: number }>();
  for (const r of items) {
    const f = flows([r], from, to);
    if (!f.length) continue;
    const cur = m.get(r.territoryId) ?? { territoryId: r.territoryId, name: r.territoryName, level: r.territoryLevel, uf: r.territoryUf, cents: 0, actions: 0, occurrences: 0 };
    cur.cents += f.length * r.amountCents;
    cur.actions += 1;
    cur.occurrences += f.length;
    m.set(r.territoryId, cur);
  }
  return [...m.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
}

/** Investimento agregado por UF (para o mapa): Brasil não é atribuído a nenhuma UF; município soma na sua UF. */
export function byUf(items: Investment[], from?: string | null, to?: string | null) {
  const m = new Map<string, number>();
  for (const t of byTerritory(items, from, to)) if (t.uf && t.level !== "pais") m.set(t.uf, (m.get(t.uf) ?? 0) + t.cents);
  return m;
}

/** Variação descritiva entre base e atual: absoluta e relativa (relativa só com base ≠ 0). */
export function variation(base: number | null, current: number | null) {
  if (base === null || current === null) return { abs: null, rel: null };
  return { abs: current - base, rel: safeDiv(current - base, Math.abs(base)) };
}

/** Diferença em pontos percentuais entre participações (frações 0–1). Só com ambas disponíveis. */
export function ppDiff(baseShare: number | null, currentShare: number | null): number | null {
  if (baseShare === null || currentShare === null) return null;
  return (currentShare - baseShare) * 100;
}

/** "Valor registrado por voto observado" (indicador descritivo). Sem votos ⇒ null. */
export function valuePerVoteCents(cents: number, votes: number | null) {
  return safeDiv(cents, votes);
}

export interface TerritoryRef {
  id: number;
  level: TerritoryLevel;
  uf: string | null;
}
/** Remove territórios contidos em outro do conjunto (Brasil ⊃ UF ⊃ município) para não contar votos duas vezes. */
export function outermost<T extends TerritoryRef>(ts: T[]): T[] {
  const uniq = [...new Map(ts.map((t) => [t.id, t])).values()];
  if (uniq.some((t) => t.level === "pais")) return uniq.filter((t) => t.level === "pais").slice(0, 1);
  const ufs = new Set(uniq.filter((t) => t.level === "uf").map((t) => t.uf));
  return uniq.filter((t) => t.level !== "municipio" || !ufs.has(t.uf));
}

/** Converte "1.500,50" / "1500.5" / "1500" em centavos; inválido ⇒ null. */
export function parseMoneyToCents(s: string): number | null {
  const t = s.trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  // pt-BR: "1.500,50" e "10.000" (ponto = milhar); também aceita "1500.5".
  const norm = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  const cents = Math.round(Number(norm) * 100);
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

export const fmtBRL = (cents: number | null, opts: { compact?: boolean } = {}) =>
  cents === null ? "—" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: opts.compact ? 0 : 2, minimumFractionDigits: opts.compact ? 0 : 2 });
export const fmtDateBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
