import type { Sql } from "@/persistence/db";
import { BR, UF_IBGE } from "@/elections/reference";
import { COUNT_PROVIDER_ID } from "@/elections/apuracao/provider";
import { scopesFor } from "@/elections/apuracao/config";

/**
 * ESTADO DA APURAÇÃO (leitura). Seis estados, nunca "0 votos" para ausência:
 *   nao_coletada  — nenhum arquivo coletado nem tentativa registrada;
 *   indisponivel  — arquivo ainda não publicado pelo TSE ou falha na última coleta, sem retrato anterior;
 *   nao_iniciada  — arquivo oficial publicado, totalização não começou (seções totalizadas = 0);
 *   em_apuracao   — totalização em curso e coleta em dia;
 *   parcial       — há números parciais, mas a coleta parou/atrasou (último retrato pode estar desatualizado);
 *   totalizada    — o TSE marcou a totalização como concluída (tf = "s").
 */
export type CountState = "nao_coletada" | "indisponivel" | "nao_iniciada" | "em_apuracao" | "parcial" | "totalizada";
export const COUNT_STATE_LABEL: Record<CountState, string> = {
  nao_coletada: "Não coletada",
  indisponivel: "Dado indisponível",
  nao_iniciada: "Não iniciada",
  em_apuracao: "Em apuração",
  parcial: "Parcial",
  totalizada: "Totalizada",
};

type Row = Record<string, unknown>;
type M = { value: number | null; status: string };
const meas = (v: unknown, s: unknown): M => ({ value: v === null || v === undefined ? null : Number(v), status: String(s) });

export interface CountCandidateRow {
  sqCandidato: number;
  candidacyId: number | null;
  personId: number | null;
  ballotNumber: number | null;
  name: string;
  party: string | null;
  votes: M;
  pct: M;
  voteDestination: string | null;
  situation: string | null;
  elected: boolean | null;
}
export interface CountView {
  state: CountState;
  year: number;
  round: number;
  officeId: number;
  territoryId: number;
  lastAttempt: { status: string; at: string } | null;
  snapshot: null | {
    phase: string;
    generatedAt: string;
    totalizedAt: string | null;
    collectedAt: string;
    sectionsTotal: M;
    sectionsCounted: M;
    countedPct: M;
    electorate: M;
    turnout: M;
    abstention: M;
    validVotes: M;
    blankVotes: M;
    nullVotes: M;
    sourceUrl: string | null;
    rawHash: string | null;
  };
  candidates: CountCandidateRow[];
}

export const STALE_MS = 15 * 60_000;

function abrOf(territoryId: number, tseCode: number | null, uf: string | null) {
  if (territoryId === BR) return "br";
  if (tseCode && uf) return `${uf.toLowerCase()}${String(tseCode).padStart(5, "0")}`;
  return (uf ?? "").toLowerCase();
}

export function deriveState(p: { phase: string | null; collectedAt: string | null; attempt: string | null; attemptAt: string | null }, nowMs: number, staleMs = STALE_MS): CountState {
  if (!p.phase) return p.attempt && p.attempt !== "ok" ? "indisponivel" : "nao_coletada";
  if (p.phase === "final") return "totalizada";
  if (p.phase === "not_started") return "nao_iniciada";
  const failing = !!p.attempt && p.attempt.startsWith("error:");
  const last = Date.parse(p.attemptAt ?? p.collectedAt ?? "");
  return failing || !Number.isFinite(last) || nowMs - last > staleMs ? "parcial" : "em_apuracao";
}

/** Retrato mais recente de um cargo × território, com candidaturas e estado derivado. */
export async function countView(sql: Sql, q: { year: number; round: number; officeId: number; territoryId: number }, nowMs = Date.now()): Promise<CountView> {
  const [t] = (await sql`select id, uf, tse_code from territory where id = ${q.territoryId}`) as { id: number; uf: string | null; tse_code: number | null }[];
  const stream = `apuracao:${q.year}:${q.round}:${q.officeId}:${abrOf(q.territoryId, t?.tse_code ?? null, t?.uf ?? null)}`;
  const [att] = (await sql`select cursor, updated_at from ingestion_checkpoint where provider_id = ${COUNT_PROVIDER_ID} and stream = ${`${stream}:status`}`) as { cursor: string; updated_at: string }[];
  const [s] = (await sql`select s.*, sr.source_url, rr.hash as raw_hash from count_snapshot s left join source_record sr on sr.id = s.source_record_id left join raw_record rr on rr.id = s.raw_record_id
    where s.year = ${q.year} and s.round = ${q.round} and s.office_id = ${q.officeId} and s.territory_id = ${q.territoryId}
    order by s.source_generated_at desc, s.id desc limit 1`) as Row[];
  const lastAttempt = att ? { status: att.cursor, at: new Date(att.updated_at).toISOString() } : null;
  const state = deriveState({ phase: (s?.phase as string) ?? null, collectedAt: s ? new Date(s.collected_at as string).toISOString() : null, attempt: lastAttempt?.status ?? null, attemptAt: lastAttempt?.at ?? null }, nowMs);
  if (!s) return { state, ...q, lastAttempt, snapshot: null, candidates: [] };
  const cands = (await sql`select cc.*, l.person_id from count_candidate cc left join identity_link l on l.candidacy_id = cc.candidacy_id and l.status in ('resolved', 'manual')
    where cc.snapshot_id = ${s.id as string} order by cc.votes desc nulls last, cc.ballot_number`) as Row[];
  return {
    state,
    ...q,
    lastAttempt,
    snapshot: {
      phase: s.phase as string,
      generatedAt: new Date(s.source_generated_at as string).toISOString(),
      totalizedAt: s.source_totalized_at ? new Date(s.source_totalized_at as string).toISOString() : null,
      collectedAt: new Date(s.collected_at as string).toISOString(),
      sectionsTotal: meas(s.sections_total, s.sections_total_status),
      sectionsCounted: meas(s.sections_counted, s.sections_counted_status),
      countedPct: meas(s.counted_pct, s.counted_pct_status),
      electorate: meas(s.electorate, s.electorate_status),
      turnout: meas(s.turnout, s.turnout_status),
      abstention: meas(s.abstention, s.abstention_status),
      validVotes: meas(s.valid_votes, s.valid_votes_status),
      blankVotes: meas(s.blank_votes, s.blank_votes_status),
      nullVotes: meas(s.null_votes, s.null_votes_status),
      sourceUrl: (s.source_url as string) ?? null,
      rawHash: (s.raw_hash as string) ?? null,
    },
    candidates: cands.map((c) => ({
      sqCandidato: Number(c.sq_candidato),
      candidacyId: (c.candidacy_id as number) ?? null,
      personId: (c.person_id as number) ?? null,
      ballotNumber: (c.ballot_number as number) ?? null,
      name: c.ballot_name as string,
      party: (c.party_acronym as string) ?? null,
      votes: meas(c.votes, c.votes_status),
      pct: meas(c.pct, c.pct_status),
      voteDestination: (c.vote_destination as string) ?? null,
      situation: (c.situation as string) ?? null,
      elected: (c.elected as boolean) ?? null,
    })),
  };
}

/** Estado por UF de um cargo (só UFs onde o cargo existe), para mapa e quadro-resumo: líder só com votos apurados. */
export async function countByUf(sql: Sql, q: { year: number; round: number; officeId: number }, nowMs = Date.now()) {
  const rows = (await sql`with latest as (
      select distinct on (s.territory_id) s.id, s.territory_id, s.phase, s.collected_at, s.counted_pct, s.counted_pct_status, s.valid_votes, s.valid_votes_status
      from count_snapshot s join territory t on t.id = s.territory_id and t.level = 'uf'
      where s.year = ${q.year} and s.round = ${q.round} and s.office_id = ${q.officeId}
      order by s.territory_id, s.source_generated_at desc, s.id desc)
    select l.*, t.uf, lead.ballot_name, lead.candidacy_id, lead.votes, lead.pct,
      ck.cursor as attempt, ck.updated_at as attempt_at
    from latest l join territory t on t.id = l.territory_id
    left join lateral (select ballot_name, candidacy_id, votes, pct from count_candidate cc where cc.snapshot_id = l.id and cc.votes_status = 'value' and cc.votes > 0 order by cc.votes desc limit 1) lead on true
    left join ingestion_checkpoint ck on ck.provider_id = ${COUNT_PROVIDER_ID} and ck.stream = ${`apuracao:${q.year}:${q.round}:${q.officeId}:`} || lower(t.uf) || ':status'`) as Row[];
  const byUf = new Map(rows.map((r) => [r.uf as string, r]));
  return scopesFor(q.officeId).filter((uf) => uf in UF_IBGE).map((uf) => {
    const r = byUf.get(uf);
    const state = deriveState({ phase: (r?.phase as string) ?? null, collectedAt: r ? new Date(r.collected_at as string).toISOString() : null, attempt: (r?.attempt as string) ?? null, attemptAt: r?.attempt_at ? new Date(r.attempt_at as string).toISOString() : null }, nowMs);
    return {
      uf,
      state,
      countedPct: r ? meas(r.counted_pct, r.counted_pct_status) : { value: null, status: "not_collected" },
      validVotes: r ? meas(r.valid_votes, r.valid_votes_status) : { value: null, status: "not_collected" },
      leader: r?.ballot_name ? { name: r.ballot_name as string, candidacyId: (r.candidacy_id as number) ?? null, votes: Number(r.votes), pct: r.pct === null ? null : Number(r.pct) } : null,
    };
  });
}

/** Quadro geral da apuração de um ano: por cargo, contagem de abrangências em cada estado. */
export async function countOverview(sql: Sql, year: number, round: number, nowMs = Date.now()) {
  const offices = (await sql`select distinct office_id from count_snapshot where year = ${year} and round = ${round} order by 1`) as { office_id: number }[];
  const out: { officeId: number; br: CountView | null; ufStates: Record<CountState, number> }[] = [];
  for (const o of offices) {
    const ufs = await countByUf(sql, { year, round, officeId: o.office_id }, nowMs);
    const ufStates = { nao_coletada: 0, indisponivel: 0, nao_iniciada: 0, em_apuracao: 0, parcial: 0, totalizada: 0 } as Record<CountState, number>;
    for (const u of ufs) ufStates[u.state]++;
    out.push({ officeId: o.office_id, br: o.office_id === 1 ? await countView(sql, { year, round, officeId: 1, territoryId: BR }, nowMs) : null, ufStates });
  }
  return out;
}
