/**
 * FILTRO GLOBAL — um único contrato para histórico eleitoral, social e analytics.
 * Serializável em URL (?ano=2022&cargo=1&uf=RJ,SP…); validado; aplicado no banco (nunca no browser).
 */
export const ELECTION_YEARS = [2026, 2022, 2018, 2014] as const;
export type ElectionYear = (typeof ELECTION_YEARS)[number];
export const PLATFORM_IDS = ["youtube", "instagram", "facebook", "x", "tiktok", "reddit", "bluesky", "news"] as const;
export const CONTENT_TYPES = ["post", "comment", "reply", "news", "video", "live"] as const;
export const SENTIMENTS = ["positivo", "negativo", "neutro", "misto", "incerto"] as const;
export const PERIODS = ["today", "24h", "7d", "30d", "custom"] as const;
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

export interface FilterSpec {
  year: ElectionYear;
  round?: 1 | 2;
  offices: number[];
  candidacyIds: number[];
  /** Busca por nome de candidato (normalizada). */
  candidateQuery?: string;
  parties: string[];
  regions: number[];
  ufs: string[];
  municipality?: number;
  period: { preset: (typeof PERIODS)[number]; from?: string; to?: string };
  platforms: string[];
  contentTypes: string[];
  sentiments: string[];
  topics: string[];
}

export const DEFAULT_FILTER: FilterSpec = { year: 2026, offices: [], candidacyIds: [], parties: [], regions: [], ufs: [], period: { preset: "24h" }, platforms: [], contentTypes: [], sentiments: [], topics: [] };

const list = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const ints = (v: string | null) => list(v).map(Number).filter((n) => Number.isInteger(n) && n > 0);
const within = <T extends string>(xs: string[], allowed: readonly T[]) => xs.filter((x): x is T => (allowed as readonly string[]).includes(x));

export function parseFilters(sp: URLSearchParams): { filter: FilterSpec; errors: string[] } {
  const errors: string[] = [];
  const f: FilterSpec = structuredClone(DEFAULT_FILTER);
  const y = sp.get("ano");
  if (y) {
    if ((ELECTION_YEARS as readonly number[]).includes(Number(y))) f.year = Number(y) as ElectionYear;
    else errors.push("ano inválido (2026, 2022, 2018, 2014)");
  }
  const t = sp.get("turno");
  if (t) {
    if (t === "1" || t === "2") f.round = Number(t) as 1 | 2;
    else errors.push("turno inválido");
  }
  f.offices = ints(sp.get("cargo"));
  f.candidacyIds = ints(sp.get("candidatura"));
  const q = sp.get("q")?.trim();
  if (q) f.candidateQuery = q.slice(0, 80);
  f.parties = list(sp.get("partido")).map((p) => p.toUpperCase()).slice(0, 20);
  f.regions = ints(sp.get("regiao")).filter((r) => r >= 1 && r <= 5);
  const ufs = list(sp.get("uf")).map((u) => u.toUpperCase());
  f.ufs = within(ufs, UFS);
  if (f.ufs.length !== ufs.length) errors.push("UF inválida");
  const m = Number(sp.get("municipio"));
  if (sp.get("municipio")) {
    if (Number.isInteger(m) && m > 100000) f.municipality = m;
    else errors.push("município inválido");
  }
  const p = sp.get("periodo") ?? "24h";
  if ((PERIODS as readonly string[]).includes(p)) f.period = { preset: p as FilterSpec["period"]["preset"] };
  else errors.push("período inválido");
  if (f.period.preset === "custom") {
    const from = sp.get("de");
    const to = sp.get("ate");
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || Date.parse(from) > Date.parse(to)) errors.push("período personalizado exige de ≤ até (ISO)");
    else f.period = { preset: "custom", from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  }
  f.platforms = within(list(sp.get("plataforma")), PLATFORM_IDS);
  f.contentTypes = within(list(sp.get("tipo")), CONTENT_TYPES);
  f.sentiments = within(list(sp.get("sentimento")), SENTIMENTS);
  f.topics = list(sp.get("tema")).slice(0, 20);
  return { filter: f, errors };
}

export function toSearchParams(f: FilterSpec): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("ano", String(f.year));
  if (f.round) sp.set("turno", String(f.round));
  const set = (k: string, v: (string | number)[]) => v.length && sp.set(k, v.join(","));
  set("cargo", f.offices);
  set("candidatura", f.candidacyIds);
  if (f.candidateQuery) sp.set("q", f.candidateQuery);
  set("partido", f.parties);
  set("regiao", f.regions);
  set("uf", f.ufs);
  if (f.municipality) sp.set("municipio", String(f.municipality));
  sp.set("periodo", f.period.preset);
  if (f.period.preset === "custom" && f.period.from && f.period.to) {
    sp.set("de", f.period.from);
    sp.set("ate", f.period.to);
  }
  set("plataforma", f.platforms);
  set("tipo", f.contentTypes);
  set("sentimento", f.sentiments);
  set("tema", f.topics);
  return sp;
}

/** Janela [from, to) do período, a partir de `now`. "today" = desde 00:00 BRT. */
export function periodWindow(p: FilterSpec["period"], nowMs: number): { from: string; to: string } {
  if (p.preset === "custom" && p.from && p.to) return { from: p.from, to: p.to };
  const to = new Date(nowMs).toISOString();
  const h = 3600_000;
  if (p.preset === "today") {
    const brt = new Date(nowMs - 3 * h);
    const start = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()) + 3 * h;
    return { from: new Date(start).toISOString(), to };
  }
  const span = p.preset === "7d" ? 7 * 24 * h : p.preset === "30d" ? 30 * 24 * h : 24 * h;
  return { from: new Date(nowMs - span).toISOString(), to };
}

/** UFs efetivas da seleção (UFs explícitas ∪ UFs das regiões). */
export function effectiveUfs(f: FilterSpec, regions: readonly { id: number; ufs: readonly string[] }[]): string[] {
  const s = new Set(f.ufs);
  for (const r of regions) if (f.regions.includes(r.id)) for (const u of r.ufs) s.add(u);
  return [...s];
}
