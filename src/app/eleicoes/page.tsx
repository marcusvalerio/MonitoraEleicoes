import type { Metadata } from "next";
import Link from "next/link";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { getBoundaries } from "@/services/geo";
import { electionsSummary, leadersByUf, listCandidacies, municipalitiesOf, partyHistory, resultsTable } from "@/analytics/elections";
import { COUNT_STATE_LABEL, countByUf, countOverview, countView, type CountState, type CountView } from "@/analytics/apuracao";
import { MAJORITARIAN, OFFICES, UF_IBGE } from "@/elections/reference";
import { effectiveUfs } from "@/domain/filters";
import { REGIONS } from "@/elections/reference";
import { PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { FilterBar } from "@/components/intel/FilterBar";
import { ElectionMap, type ElectionMapRow } from "@/components/intel/ElectionMap";
import { CountStateTag } from "@/components/intel/CountStateTag";
import { OTHER, SERIES } from "@/components/intel/palette";
import { fmtDateTime, fmtInt, fmtPct } from "@/lib/format";
import { ElectionsExplorer } from "../elections/Explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eleições" };

const STATUS: Record<string, { l: string; t: "pos" | "info" | "neutral" | "warn" }> = {
  results_official: { l: "resultados oficiais", t: "pos" },
  results_partial: { l: "apuração em curso", t: "warn" },
  candidacies_only: { l: "só candidaturas", t: "info" },
  scheduled: { l: "agendada", t: "neutral" },
};
const officeName = (id: number) => OFFICES.find((o) => o.id === id)?.name ?? `Cargo ${id}`;
const STATUS_TEXT: Record<string, string> = { not_collected: "Não coletado", not_available: "Indisponível", unknown: "Desconhecido", not_applicable: "n/a" };
const mval = (m: { value: number | null; status: string }, f: (n: number) => string = fmtInt) => (m.status === "value" && m.value !== null ? f(m.value) : STATUS_TEXT[m.status] ?? m.status);

/** Cor por entidade: ordem fixa pelo nº de UFs lideradas (depois votos); além de 7 ⇒ "outros". */
function entitiesFor(rows: { id: string; name: string; party: string | null; votes: number }[]) {
  const agg = new Map<string, { id: string; name: string; party: string | null; n: number; votes: number }>();
  for (const r of rows) {
    const a = agg.get(r.id) ?? { id: r.id, name: r.name, party: r.party, n: 0, votes: 0 };
    a.n++;
    a.votes += r.votes;
    agg.set(r.id, a);
  }
  return [...agg.values()].sort((a, b) => b.n - a.n || b.votes - a.votes).map((a, i) => ({ id: a.id, name: a.name, partyAcronym: a.party ?? "", color: SERIES[i] ?? OTHER }));
}

/** ELEIÇÕES — histórico oficial (TSE 2014/2018/2022), candidaturas 2026 e apuração 2026 quando publicada. */
export default async function Eleicoes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sql = await intelSql();
  if (!sql) return <ElectionsExplorer path={[]} />;
  const sp = await searchParams;
  const { filter, errors } = filtersFrom(sp, { year: 2022, offices: [1] });
  const office = filter.offices[0] ?? 1;
  const round = filter.round ?? 1;
  const ufs = effectiveUfs(filter, REGIONS);
  const singleUf = ufs.length === 1 ? ufs[0] : null;
  const proportional = !MAJORITARIAN.has(office);
  const [summary, municipalities, boundaries] = await Promise.all([electionsSummary(sql), singleUf ? municipalitiesOf(sql, singleUf) : Promise.resolve([]), getBoundaries("uf")]);
  const cycle = summary.find((e) => e.year === filter.year);
  const counting = filter.year === 2026;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow="Eleições · fonte TSE"
        title="Eleições"
        description="Resultados oficiais de 2014, 2018 e 2022, candidaturas de 2026 e a apuração de 2026 quando o TSE publicar. Ausência de dado nunca é exibida como zero."
      />
      <FilterBar filter={filter} fields={["year", "round", "office", "region", "uf", "municipality", "party", "q"]} municipalities={municipalities} />
      {errors.length > 0 && <p className="text-[12px] text-warn">Filtros ignorados: {errors.join("; ")}</p>}

      <section className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4" data-testid="election-cycles">
        {summary.map((e) => (
          <Link key={e.year} href={`/eleicoes?ano=${e.year}${office !== 1 ? `&cargo=${office}` : ""}`} className={`bg-surface p-3 transition-colors hover:bg-elevated ${e.year === filter.year ? "bg-elevated" : ""}`} aria-current={e.year === filter.year ? "page" : undefined}>
            <p className="flex items-center justify-between font-display text-[15px] font-semibold text-fg">
              {e.year} <Tag tone={STATUS[e.status]?.t ?? "neutral"}>{STATUS[e.status]?.l ?? e.status}</Tag>
            </p>
            <p className="mt-1 text-[12px] text-fg-3">
              <span className="tnum text-fg-2">{fmtInt(e.candidacies)}</span> candidaturas ·{" "}
              {e.resultRows ? <><span className="tnum text-fg-2">{fmtInt(e.resultRows)}</span> linhas de resultado</> : "resultados não publicados"}
            </p>
          </Link>
        ))}
      </section>

      {counting ? <Counting sql={sql} filter={filter} office={office} round={round} singleUf={singleUf} boundaries={boundaries} /> : <History sql={sql} filter={filter} office={office} proportional={proportional} boundaries={boundaries} cycleStatus={cycle?.status ?? "not_imported"} />}
    </div>
  );
}

type Sql = NonNullable<Awaited<ReturnType<typeof intelSql>>>;
type F = ReturnType<typeof filtersFrom>["filter"];
type B = Awaited<ReturnType<typeof getBoundaries>>;

async function History({ sql, filter, office, proportional, boundaries, cycleStatus }: { sql: Sql; filter: F; office: number; proportional: boolean; boundaries: B; cycleStatus: string }) {
  const [table, leaders] = await Promise.all([resultsTable(sql, filter, 50), leadersByUf(sql, filter)]);
  const parties = filter.parties.length ? filter.parties : [...new Set(table.rows.map((r) => r.party).filter((p): p is string => !!p))].slice(0, 5);
  const history = parties.length ? await partyHistory(sql, filter, parties) : [];
  const ents = entitiesFor(leaders.map((l) => ({ id: String(l.candidacy_id), name: l.ballot_name, party: l.party_acronym, votes: Number(l.votes) })));
  const mapRows: ElectionMapRow[] = Object.keys(UF_IBGE).map((uf) => {
    const l = leaders.find((x) => x.uf === uf);
    return { uf, leader: l ? { id: String(l.candidacy_id), name: l.ballot_name, party: l.party_acronym, votes: Number(l.votes), share: l.share } : null, note: cycleStatus === "results_official" ? "sem candidatura do cargo" : "resultados não publicados" };
  });
  const scope = filter.municipality ? "município selecionado" : filter.ufs.length || filter.regions.length ? (effectiveUfs(filter, REGIONS).join(", ") || "—") : "Brasil";
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title={`${officeName(office)} · ${filter.year} · ${table.round}º turno`} question={`Recorte: ${scope}`}>
          {proportional && filter.municipality && <p className="mb-2 text-[12px] text-fg-3" data-testid="granularity-note">Cargos proporcionais são armazenados por UF; o recorte municipal não está disponível para este cargo.</p>}
          {table.note && <p className="mb-2 text-[12px] text-fg-3" data-testid="results-note">{table.note}</p>}
          {table.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]" data-testid="results-table">
                <thead>
                  <tr className="text-left text-fg-3">
                    <th className="py-1 pr-2 font-normal">Candidatura</th>
                    <th className="px-2 font-normal">Partido</th>
                    <th className="px-2 font-normal">UF</th>
                    <th className="px-2 text-right font-normal">Votos nominais</th>
                    <th className="px-2 text-right font-normal">% válidos</th>
                    <th className="px-2 font-normal">Situação (TSE)</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r) => (
                    <tr key={r.candidacyId} className="border-t border-border/60">
                      <td className="py-1.5 pr-2 text-fg">
                        {r.personId ? <Link className="hover:underline" href={`/candidatos/${r.personId}`}>{r.ballotName}</Link> : r.ballotName}
                        {r.identityStatus === "unresolved" && <span className="ml-1 text-[11px] text-fg-3">(identidade não resolvida)</span>}
                      </td>
                      <td className="px-2 text-fg-2">{r.party ?? "—"}</td>
                      <td className="px-2 text-fg-2">{r.uf ?? "BR"}</td>
                      <td className="px-2 text-right text-fg tnum">{fmtInt(r.votes)}</td>
                      <td className="px-2 text-right text-fg-2 tnum">{r.pct === null ? "n/a" : fmtPct(r.pct, 1)}</td>
                      <td className="px-2 text-fg-3">{r.status ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !table.note && <p className="text-[12.5px] text-fg-3">Nenhuma candidatura com votos no recorte.</p>
          )}
          <p className="mt-2 text-[11px] text-fg-3">Ordenado por votos. Votos nominais válidos somados no recorte. Percentual só quando o recorte é uma única disputa. Não é ranking de mérito.</p>
        </Panel>
        <Panel title="Mais votado por UF" question={`${officeName(office)} · ${filter.year} · ${table.round}º turno`}>
          <ElectionMap boundaries={boundaries} rows={mapRows} entities={ents} title={`Mapa: candidatura mais votada por UF, ${officeName(office)} ${filter.year}`} />
        </Panel>
      </div>
      {history.length > 0 && (
        <Panel title="Votos por partido e ciclo" question={`${officeName(office)} · 1º turno · mesmo recorte`}>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[12.5px]" data-testid="party-history">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 pr-2 font-normal">Partido</th>
                {history.map((h) => (
                  <th key={h.year} className="px-2 text-right font-normal">{h.year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parties.map((p) => (
                <tr key={p} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 text-fg">{p}</td>
                  {history.map((h) => {
                    const c = h.parties.find((x) => x.party === p)!;
                    return <td key={h.year} className="px-2 text-right tnum text-fg-2">{c.votes !== null ? fmtInt(c.votes) : c.votesStatus === "not_available" ? "sem votos registrados" : "não disponível"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="mt-2 text-[11px] text-fg-3">Siglas mudam entre ciclos (fusões/renomeações); a tabela compara siglas literalmente. <Link className="text-fg-2 hover:text-fg" href={`/comparar?${new URLSearchParams({ cargo: String(office), partido: parties.join(",") }).toString()}`}>Comparar ciclos →</Link></p>
        </Panel>
      )}
    </>
  );
}

async function Counting({ sql, filter, office, round, singleUf, boundaries }: { sql: Sql; filter: F; office: number; round: number; singleUf: string | null; boundaries: B }) {
  const territoryId = office === 1 && !singleUf ? 0 : singleUf ? UF_IBGE[singleUf] : null;
  const [overview, byUf, view, cands] = await Promise.all([
    countOverview(sql, 2026, round),
    countByUf(sql, { year: 2026, round, officeId: office }),
    territoryId !== null && territoryId !== undefined ? countView(sql, { year: 2026, round, officeId: office, territoryId }) : Promise.resolve(null),
    listCandidacies(sql, filter, 60),
  ]);
  const ents = entitiesFor(byUf.filter((u) => u.leader).map((u) => ({ id: String(u.leader!.candidacyId ?? u.leader!.name), name: u.leader!.name, party: null, votes: u.leader!.votes })));
  const mapRows: ElectionMapRow[] = byUf.map((u) => ({ uf: u.uf, leader: u.leader ? { id: String(u.leader.candidacyId ?? u.leader.name), name: u.leader.name, party: null, votes: u.leader.votes, share: u.leader.pct === null ? null : u.leader.pct / 100 } : null, note: COUNT_STATE_LABEL[u.state] }));
  return (
    <>
      <Panel title={`Apuração 2026 · ${round}º turno`} question="Fonte: sistema oficial de divulgação de resultados do TSE (resultados.tse.jus.br)">
        {overview.length === 0 ? (
          <p className="text-[12.5px] text-fg-3" data-testid="count-empty">
            <CountStateTag state="nao_coletada" /> Nenhum arquivo de apuração coletado ainda. A coleta começa quando o worker <code>--apuracao</code> estiver ativo; até lá não há números.
          </p>
        ) : (
          <ul className="grid gap-px overflow-hidden rounded-[var(--radius-sm)] border border-border bg-border sm:grid-cols-3" data-testid="count-overview">
            {overview.map((o) => (
              <li key={o.officeId} className="bg-surface p-3">
                <Link href={`/eleicoes?ano=2026&cargo=${o.officeId}`} className="flex items-center justify-between text-[13px] text-fg hover:underline">
                  {officeName(o.officeId)} {o.br && <CountStateTag state={o.br.state} />}
                </Link>
                <p className="mt-1 text-[11.5px] text-fg-3">
                  {(Object.entries(o.ufStates) as [CountState, number][]).filter(([, n]) => n > 0).map(([s, n]) => `${n} UF ${COUNT_STATE_LABEL[s].toLowerCase()}`).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {view ? <CountTable view={view} title={`${officeName(office)} · ${territoryId === 0 ? "Brasil" : singleUf}`} /> : (
          <Panel title={officeName(office)} question="Selecione uma UF para ver a apuração por candidatura">
            <p className="text-[12.5px] text-fg-3">Cargos estaduais são disputas separadas por UF. Use o filtro “Estado”.</p>
          </Panel>
        )}
        <Panel title="Estado da apuração por UF" question={officeName(office)}>
          <ElectionMap boundaries={boundaries} rows={mapRows} entities={ents} title={`Mapa da apuração 2026, ${officeName(office)}`} />
          <dl className="mt-3 space-y-1.5 text-[12px]" data-testid="count-by-uf">
            {(Object.keys(COUNT_STATE_LABEL) as CountState[]).map((st) => {
              const list = byUf.filter((u) => u.state === st);
              if (!list.length) return null;
              return (
                <div key={st} className="flex items-baseline gap-2">
                  <dt className="w-28 shrink-0"><CountStateTag state={st} /></dt>
                  <dd className="text-fg-2">{list.map((u) => (st === "em_apuracao" || st === "parcial" ? `${u.uf} ${mval(u.countedPct, (n) => `${n.toFixed(0)}%`)}` : u.uf)).join(" · ")}</dd>
                </div>
              );
            })}
          </dl>
        </Panel>
      </div>

      <Panel title={`Candidaturas 2026 · ${officeName(office)}`} question={`${fmtInt(cands.total)} candidaturas registradas no recorte (TSE · Dados Abertos) — ordem alfabética`}>
        <ul className="grid gap-x-6 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3" data-testid="candidacies-2026">
          {cands.rows.map((c) => (
            <li key={c.candidacyId} className="flex items-baseline gap-2 border-t border-border/60 py-1.5">
              <span className="w-10 shrink-0 text-right text-fg-3 tnum">{c.number ?? "—"}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{c.personId ? <Link className="hover:underline" href={`/candidatos/${c.personId}`}>{c.ballotName}</Link> : c.ballotName}</span>
              <span className="text-fg-3">{c.party ?? "—"}{c.uf && c.uf !== "BR" ? ` · ${c.uf}` : ""}{c.situation && !/^(APTO|DEFERIDO|#NULO)/.test(c.situation) ? ` · ${c.situation.toLowerCase()}` : ""}</span>
            </li>
          ))}
        </ul>
        {cands.total > cands.rows.length && <p className="mt-2 text-[11px] text-fg-3">Mostrando {cands.rows.length} de {fmtInt(cands.total)}. Refine por UF, partido ou nome.</p>}
      </Panel>
    </>
  );
}

function CountTable({ view, title }: { view: CountView; title: string }) {
  const s = view.snapshot;
  return (
    <Panel title={title} question={s ? `Arquivo gerado pelo TSE em ${fmtDateTime(s.generatedAt)} · coletado em ${fmtDateTime(s.collectedAt)}` : "Nenhum retrato coletado"}>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px] text-fg-3" data-testid="count-view">
        <CountStateTag state={view.state} />
        {s && (
          <>
            <span>Seções totalizadas: <span className="tnum text-fg-2">{mval(s.sectionsCounted)}</span> de <span className="tnum text-fg-2">{mval(s.sectionsTotal)}</span> ({mval(s.countedPct, (n) => `${n.toFixed(2).replace(".", ",")}%`)})</span>
            <span>Eleitorado: <span className="tnum text-fg-2">{mval(s.electorate)}</span></span>
            <span>Comparecimento: <span className="tnum text-fg-2">{mval(s.turnout)}</span></span>
            <span>Válidos: <span className="tnum text-fg-2">{mval(s.validVotes)}</span></span>
          </>
        )}
        {view.lastAttempt && view.lastAttempt.status !== "ok" && <span className="text-warn">Última tentativa: {view.lastAttempt.status === "not_published" ? "arquivo não publicado" : view.lastAttempt.status.replace(/^error:/, "falha — ")}</span>}
      </div>
      {view.candidates.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" data-testid="count-table">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 pr-2 font-normal">Nº</th>
                <th className="px-2 font-normal">Candidatura</th>
                <th className="px-2 font-normal">Partido</th>
                <th className="px-2 text-right font-normal">Votos</th>
                <th className="px-2 text-right font-normal">% válidos</th>
                <th className="px-2 font-normal">Situação (TSE)</th>
              </tr>
            </thead>
            <tbody>
              {view.candidates.map((c) => (
                <tr key={c.sqCandidato} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 text-fg-3 tnum">{c.ballotNumber ?? "—"}</td>
                  <td className="px-2 text-fg">{c.personId ? <Link className="hover:underline" href={`/candidatos/${c.personId}`}>{c.name}</Link> : c.name}{c.voteDestination && c.voteDestination !== "Válido" ? <span className="ml-1 text-[11px] text-fg-3">({c.voteDestination})</span> : null}</td>
                  <td className="px-2 text-fg-2">{c.party ?? "—"}</td>
                  <td className="px-2 text-right tnum text-fg">{mval(c.votes)}</td>
                  <td className="px-2 text-right tnum text-fg-2">{mval(c.pct, (n) => `${n.toFixed(2).replace(".", ",")}%`)}</td>
                  <td className="px-2 text-fg-3">{c.situation || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s?.sourceUrl && (
        <p className="mt-2 truncate text-[11px] text-fg-3">
          Fonte: <a className="hover:text-fg" href={s.sourceUrl} rel="noreferrer" target="_blank">{s.sourceUrl}</a>
          {s.rawHash ? <> · RAW sha256 {s.rawHash.slice(0, 12)}…</> : null}
        </p>
      )}
      <p className="mt-1 text-[11px] text-fg-3">Ordem por votos apurados (antes da totalização, por número). “Não coletado” = totalização não iniciada ou sem coleta; não significa zero votos.</p>
    </Panel>
  );
}
