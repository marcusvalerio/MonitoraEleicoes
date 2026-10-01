import { MAJORITARIAN, UF_IBGE } from "@/elections/reference";
import { syntheticAllowed } from "@/providers/profile-guard";

/**
 * DESCOBERTA OFICIAL da apuração: configuração do TSE → códigos da eleição → arquivos de resultado.
 * Nada de URL de eleição fixa no código: só o host e o caminho da configuração comum (documentados pelo TSE).
 * Hosts permitidos restritos ao domínio oficial (anti-SSRF): toda URL passa por assertAllowedUrl.
 */
export const OFFICIAL_BASE = "https://resultados.tse.jus.br/oficial";
export const ALLOWED_HOSTS = new Set(["resultados.tse.jus.br"]);

/**
 * Servidor de REPLAY local (somente demonstração/teste): MONITORA_TSE_BASE=http://127.0.0.1:<porta>/oficial.
 * Aceito apenas quando dados sintéticos são permitidos (nunca em produção) e só em loopback.
 */
export function replayBase(env: Record<string, string | undefined> = process.env): string | null {
  const b = env.MONITORA_TSE_BASE;
  if (!b || !syntheticAllowed(env)) return null;
  const u = new URL(b);
  return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost") && u.pathname.replace(/\/$/, "") === "/oficial" ? b.replace(/\/$/, "") : null;
}
export const tseBase = () => replayBase() ?? OFFICIAL_BASE;
/** Compat: base oficial (constante). */
export const TSE_RESULTS_BASE = OFFICIAL_BASE;
export const configUrl = () => `${tseBase()}/comum/config/ele-c.json`;

export function assertAllowedUrl(raw: string): URL {
  const u = new URL(raw);
  const rb = replayBase();
  if (rb && raw.startsWith(`${rb}/`)) return u; // replay local de demonstração (bloqueado em produção)
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname) || u.username || u.password || (u.port && u.port !== "443"))
    throw new Error(`URL fora do domínio oficial do TSE: ${u.protocol}//${u.host}`);
  if (!u.pathname.startsWith("/oficial/")) throw new Error(`caminho não permitido: ${u.pathname}`);
  return u;
}

export interface CountOffice {
  id: number;
  name: string;
  /** "majoritario" (1, 3, 5) | "proporcional" (6, 7, 8) — tipo 1/2 da configuração do TSE. */
  system: "majoritario" | "proporcional";
}
export interface CountElection {
  year: number;
  round: 1 | 2;
  /** Código da eleição no sistema de divulgação (ex.: 6257). */
  code: number;
  /** Código da mesma eleição no 2º turno (cdt2), quando publicado. */
  round2Code: number | null;
  name: string;
  /** Pasta do ciclo (ex.: "ele2026"). */
  cycle: string;
  offices: CountOffice[];
}

interface RawElecConfig {
  pl?: { c?: string; e?: { cd: string; cdt2?: string; nm?: string; t?: string; tp?: string; abr?: { cd: string; cp?: { cd: string; ds: string; tp: string }[] }[] }[] }[];
}

/** Cargos de eleição GERAL que o Monitora acompanha (os demais da configuração são ignorados e reportados). */
const TRACKED = new Set([1, 3, 5, 6, 7, 8]);

/** Lê ele-c.json e devolve as eleições gerais do ano/turno, com os cargos publicados pelo próprio TSE. */
export function discoverElections(config: unknown, year: number, round: 1 | 2): CountElection[] {
  const cfg = config as RawElecConfig;
  if (!cfg || !Array.isArray(cfg.pl)) throw new Error("configuração do TSE em formato inesperado (sem 'pl')");
  const cycle = `ele${year}`;
  const out: CountElection[] = [];
  for (const pl of cfg.pl.filter((p) => p.c === cycle)) {
    for (const e of pl.e ?? []) {
      const offices = (e.abr ?? []).flatMap((a) => a.cp ?? []).map((c) => ({ id: Number(c.cd), name: c.ds, tp: c.tp })).filter((c) => TRACKED.has(c.id));
      if (!offices.length) continue;
      const r1 = Number(e.t ?? "1") === 1;
      // 2º turno: código vem de cdt2 da eleição de 1º turno (quando o TSE publica)
      const code = round === 1 ? (r1 ? Number(e.cd) : null) : r1 ? (e.cdt2 ? Number(e.cdt2) : null) : Number(e.cd);
      if (!code) continue;
      out.push({
        year,
        round,
        code,
        round2Code: e.cdt2 ? Number(e.cdt2) : null,
        name: e.nm ?? `Eleição ${code}`,
        cycle,
        offices: offices
          .filter((o) => round === 1 || MAJORITARIAN.has(o.id))
          .map((o) => ({ id: o.id, name: o.name, system: o.tp === "2" ? "proporcional" : "majoritario" })),
      });
    }
  }
  return out;
}

/** Abrangência de um arquivo: "br", UF ("sp") ou município ("sp71072" = UF + código TSE do município). */
export function countFileUrl(e: Pick<CountElection, "cycle" | "code">, office: number, scope: { uf: string; municipalityTseCode?: number | null }) {
  const uf = scope.uf.toLowerCase();
  if (!/^[a-z]{2}$/.test(uf)) throw new Error(`UF inválida: ${scope.uf}`);
  const abr = scope.municipalityTseCode ? `${uf}${String(scope.municipalityTseCode).padStart(5, "0")}` : uf;
  const url = `${tseBase()}/${e.cycle}/${e.code}/dados/${uf}/${abr}-c${String(office).padStart(4, "0")}-e${String(e.code).padStart(6, "0")}-u.json`;
  assertAllowedUrl(url);
  return url;
}

const UFS_EXCEPT_DF = Object.keys(UF_IBGE).filter((u) => u !== "DF");
/** Abrangências em que cada cargo existe numa eleição geral (Dep. Estadual não existe no DF; Distrital só no DF). */
export function scopesFor(officeId: number): string[] {
  if (officeId === 1) return ["BR", ...Object.keys(UF_IBGE)];
  if (officeId === 7) return UFS_EXCEPT_DF;
  if (officeId === 8) return ["DF"];
  return Object.keys(UF_IBGE);
}
