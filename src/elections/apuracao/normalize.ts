import { createHash } from "node:crypto";

/**
 * NORMALIZADOR do arquivo "-u.json" do sistema de divulgação do TSE (formato validado com arquivos reais:
 * 2024 totalizado e 2026 pré-eleição — ver fixtures/).
 *
 * Regra central — AUSÊNCIA ≠ ZERO:
 *  - seções totalizadas (s.st) = 0 ⇒ fase "not_started": comparecimento, votos e percentuais = not_collected
 *    (o TSE publica "0" nesses campos antes de a totalização começar; isso NÃO é "0 votos");
 *  - tf = "s" ⇒ "final"; caso contrário "partial";
 *  - campo ausente/ilegível ⇒ not_available (nunca 0).
 * Eleitorado (e.te) e total de seções (s.ts) são cadastrais e já valem antes da apuração.
 */
export type ValueStatus = "value" | "unknown" | "not_collected" | "not_available" | "not_applicable";
export interface Measured<T> {
  value: T | null;
  status: ValueStatus;
}
export type CountPhase = "not_started" | "partial" | "final";

export interface NormalizedCandidate {
  sqCandidato: number;
  ballotNumber: number | null;
  ballotName: string;
  party: string | null;
  votes: Measured<number>;
  /** Percentual (0–100) dos votos válidos, como publicado. */
  pct: Measured<number>;
  /** Destino do voto publicado pelo TSE (ex.: "Válido", "Anulado", "Anulado sub judice"). */
  voteDestination: string | null;
  situation: string | null;
  /** Eleito? null antes do início da totalização. */
  elected: boolean | null;
}

export interface NormalizedCount {
  electionCode: number;
  round: 1 | 2;
  officeId: number;
  /** "br" | UF minúscula | null (município: ver municipalityTseCode). */
  scopeLevel: "pais" | "uf" | "municipio";
  municipalityTseCode: number | null;
  phase: CountPhase;
  generatedAt: string;
  totalizedAt: string | null;
  sectionsTotal: Measured<number>;
  sectionsCounted: Measured<number>;
  countedPct: Measured<number>;
  electorate: Measured<number>;
  turnout: Measured<number>;
  abstention: Measured<number>;
  validVotes: Measured<number>;
  blankVotes: Measured<number>;
  nullVotes: Measured<number>;
  candidates: NormalizedCandidate[];
  contentHash: string;
}

type J = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : null);
const int = (v: unknown): number | null => {
  const s = str(v);
  if (s === null || !/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
};
const dec = (v: unknown): number | null => {
  const s = str(v);
  if (s === null || !/^\d+(,\d+)?$/.test(s)) return null;
  return Number(s.replace(",", "."));
};
const val = <T>(v: T | null): Measured<T> => (v === null ? { value: null, status: "not_available" } : { value: v, status: "value" });
const NC: Measured<number> = { value: null, status: "not_collected" };

/** "29/09/2026" + "19:25:59" (horário de Brasília) → ISO UTC. */
export function tseDateTime(d: unknown, h: unknown): string | null {
  const ds = str(d);
  const hs = str(h) || "00:00:00";
  const m = ds && /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ds);
  if (!m || !/^\d{2}:\d{2}:\d{2}$/.test(hs)) return null;
  const t = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${hs}-03:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Hash do CONTEÚDO apurado (fase, totais, votos e situação por candidatura). Ignora data/sequência de geração
 * (dg, hg, idg), que mudam a cada republicação sem alterar números ⇒ republicação idêntica não gera novo retrato.
 * O hash do arquivo bruto continua no RAW (proveniência).
 */
export function countContentHash(n: Omit<NormalizedCount, "contentHash" | "generatedAt">) {
  const m = (x: Measured<number>) => `${x.status}:${x.value ?? ""}`;
  const head = [n.electionCode, n.round, n.officeId, n.scopeLevel, n.municipalityTseCode ?? "", n.phase, n.totalizedAt ?? "", ...[n.sectionsTotal, n.sectionsCounted, n.countedPct, n.electorate, n.turnout, n.abstention, n.validVotes, n.blankVotes, n.nullVotes].map(m)].join("|");
  const cands = [...n.candidates].sort((a, b) => a.sqCandidato - b.sqCandidato).map((c) => [c.sqCandidato, m(c.votes), m(c.pct), c.voteDestination ?? "", c.situation ?? "", c.elected ?? ""].join(":"));
  return sha256([head, ...cands].join("\n"));
}

export function normalizeCountFile(json: unknown): NormalizedCount {
  const f = json as J;
  if (!f || typeof f !== "object" || !Array.isArray(f.carg)) throw new Error("arquivo de resultado em formato inesperado (sem 'carg')");
  const s = (f.s ?? {}) as J;
  const e = (f.e ?? {}) as J;
  const v = (f.v ?? {}) as J;
  const carg = (f.carg as J[])[0] ?? {};
  const officeId = int(carg.cd);
  const electionCode = int(f.ele);
  if (officeId === null || electionCode === null) throw new Error("arquivo sem cargo/eleição identificáveis");
  const generatedAt = tseDateTime(f.dg, f.hg);
  if (!generatedAt) throw new Error("arquivo sem data de geração (dg/hg)");

  const sectionsCounted = int(s.st);
  const phase: CountPhase = sectionsCounted === null || sectionsCounted === 0 ? "not_started" : str(f.tf) === "s" ? "final" : "partial";
  const started = phase !== "not_started";
  const counted = (x: unknown) => (started ? val(int(x)) : NC);

  const tpabr = str(f.tpabr);
  const cdabr = str(f.cdabr) ?? "";
  const scopeLevel = tpabr === "mu" ? "municipio" : cdabr.toLowerCase() === "br" ? "pais" : "uf";

  const candidates: NormalizedCandidate[] = [];
  for (const agr of (carg.agr as J[] | undefined) ?? [])
    for (const par of (agr.par as J[] | undefined) ?? [])
      for (const c of (par.cand as J[] | undefined) ?? []) {
        const sq = int(c.sqcand);
        if (sq === null) continue;
        const pct = dec(c.pvapn) ?? dec(c.pvap);
        candidates.push({
          sqCandidato: sq,
          ballotNumber: int(c.n),
          ballotName: str(c.nmu) || str(c.nm) || String(sq),
          party: str(par.sg),
          votes: counted(c.vap),
          pct: started ? val(pct === null ? null : Math.round(pct * 1e6) / 1e6) : NC,
          voteDestination: str(c.dvt) || null,
          situation: str(c.st) || null,
          elected: started ? str(c.e) === "s" : null,
        });
      }

  const n = {
    electionCode,
    round: str(f.t) === "2" ? 2 : 1,
    officeId,
    scopeLevel,
    municipalityTseCode: scopeLevel === "municipio" ? int(cdabr) : null,
    phase,
    generatedAt,
    totalizedAt: tseDateTime(f.dt, f.ht),
    sectionsTotal: val(int(s.ts)),
    sectionsCounted: val(sectionsCounted),
    countedPct: val(dec(s.pst)),
    electorate: val(int(e.te)),
    turnout: counted(e.c),
    abstention: counted(e.a),
    validVotes: counted(v.vv),
    blankVotes: counted(v.vb),
    nullVotes: counted(v.vn),
    candidates,
  } satisfies Omit<NormalizedCount, "contentHash">;
  return { ...n, contentHash: countContentHash(n) };
}
