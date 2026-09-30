import type { Metadata } from "next";
import Link from "next/link";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { electionsSummary, partyHistory, resultsTable } from "@/analytics/elections";
import { OFFICES } from "@/elections/reference";
import { PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { FilterBar } from "@/components/intel/FilterBar";
import { fmtInt, fmtPct } from "@/lib/format";
import { ElectionsExplorer } from "./Explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eleições" };

const STATUS: Record<string, { l: string; t: "pos" | "info" | "neutral" | "warn" }> = {
  results_official: { l: "resultados oficiais", t: "pos" },
  results_partial: { l: "resultados parciais", t: "warn" },
  candidacies_only: { l: "só candidaturas", t: "info" },
  scheduled: { l: "agendada", t: "neutral" },
};

/** Histórico eleitoral: dados OFICIAIS do TSE importados. Sem banco (perfis demo/fixture) ⇒ explorador sem números. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sql = intelSql();
  if (!sql) return <ElectionsExplorer path={[]} />;
  const sp = await searchParams;
  const { filter } = filtersFrom(sp, { year: 2022 });
  const office = filter.offices[0] ?? 1;
  const [summary, table] = await Promise.all([electionsSummary(sql), resultsTable(sql, filter, 50)]);
  const parties = filter.parties.length ? filter.parties : [...new Set(table.rows.map((r) => r.party).filter((p): p is string => !!p))].slice(0, 5);
  const history = parties.length ? await partyHistory(sql, filter, parties) : [];
  const officeName = OFFICES.find((o) => o.id === office)?.name ?? `Cargo ${office}`;
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Eleições · fonte TSE" title="Histórico eleitoral" description="Candidaturas e votos nominais oficiais (TSE Dados Abertos) de 2014, 2018, 2022 e candidaturas de 2026. Ausência de dado não é zero." />
      <FilterBar filter={filter} fields={["year", "round", "office", "region", "uf", "party", "q"]} />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="election-cycles">
        {summary.map((e) => (
          <div key={e.year} className="rounded-[var(--radius)] border border-border bg-surface p-3">
            <p className="flex items-center justify-between text-[13px] text-fg">
              {e.year} <Tag tone={STATUS[e.status]?.t ?? "neutral"}>{STATUS[e.status]?.l ?? e.status}</Tag>
            </p>
            <p className="mt-1 text-[12px] text-fg-3">
              <span className="tnum text-fg-2">{fmtInt(e.candidacies)}</span> candidaturas ·{" "}
              {e.resultRows ? <><span className="tnum text-fg-2">{fmtInt(e.resultRows)}</span> linhas de resultado</> : "resultados não disponíveis"}
            </p>
          </div>
        ))}
      </section>
      <Panel title={`${officeName} · ${filter.year} · ${table.round}º turno`} question={table.scope.ufs.length ? `Recorte: ${table.scope.ufs.join(", ")}` : "Recorte: Brasil"}>
        {table.note && <p className="mb-2 text-[12px] text-fg-3" data-testid="results-note">{table.note}</p>}
        {table.rows.length > 0 && (
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
        )}
        {!table.rows.length && !table.note && <p className="text-[12.5px] text-fg-3">Nenhuma candidatura com votos no recorte.</p>}
        <p className="mt-2 text-[11px] text-fg-3">Ordenado por votos. Votos nominais válidos somados nos municípios do recorte. Não é ranking de mérito.</p>
      </Panel>
      {history.length > 0 && (
        <Panel title="Votos por partido e ciclo" question={`${officeName} · 1º turno · mesmo recorte`}>
          <table className="w-full text-[12.5px]" data-testid="party-history">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 pr-2 font-normal">Partido</th>
                {history.map((h) => <th key={h.year} className="px-2 text-right font-normal">{h.year}</th>)}
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
          </table>
          <p className="mt-2 text-[11px] text-fg-3">Siglas mudam entre ciclos (fusões/renomeações); a tabela compara siglas literalmente.</p>
        </Panel>
      )}
    </div>
  );
}
