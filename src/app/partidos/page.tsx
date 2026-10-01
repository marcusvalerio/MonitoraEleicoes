import type { Metadata } from "next";
import Link from "next/link";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { partiesOverview } from "@/analytics/elections";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { FilterBar } from "@/components/intel/FilterBar";
import { fmtInt } from "@/lib/format";
import { EvidenceBadge } from "@/components/intel/EvidenceSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partidos" };

/** PARTIDOS — registro oficial do ciclo com candidaturas, eleitos e votos (TSE). Ordem por nº de candidaturas, não por desempenho. */
export default async function Partidos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sql = await intelSql();
  const header = <PageHeader eyebrow={<EvidenceBadge kind="oficial" source="TSE" />} title="Partidos" description="Partidos registrados em cada eleição, com candidaturas, eleitos (situação oficial) e votos nominais do 1º turno." />;
  if (!sql)
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
        {header}
        <StateView state="provider_unavailable" title="Fonte indisponível neste ambiente">A base eleitoral oficial (TSE) não está disponível aqui.</StateView>
      </div>
    );
  const { filter } = filtersFrom(await searchParams, { year: 2026 });
  const rows = await partiesOverview(sql, filter.year);
  const counted = filter.year !== 2026;
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      {header}
      <FilterBar filter={filter} fields={["year"]} />
      <Panel title={`${rows.length} partidos · ${filter.year}`} question="Ordenados pelo número de candidaturas registradas">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]" data-testid="parties-table">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 pr-2 font-normal">Nº</th>
                <th className="px-2 font-normal">Partido</th>
                <th className="px-2 text-right font-normal">Candidaturas</th>
                <th className="px-2 text-right font-normal">Eleitos</th>
                <th className="px-2 text-right font-normal">Votos nominais (1º turno)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.acronym} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 text-fg-3 tnum">{p.number}</td>
                  <td className="px-2">
                    <Link className="text-fg hover:underline" href={`/partido/${encodeURIComponent(p.acronym)}`}>{p.acronym}</Link>
                    <span className="ml-2 text-fg-3">{p.name}</span>
                  </td>
                  <td className="px-2 text-right text-fg tnum">{fmtInt(p.candidacies)}</td>
                  <td className="px-2 text-right text-fg tnum">{counted ? fmtInt(p.elected ?? 0) : "não publicado"}</td>
                  <td className="px-2 text-right text-fg tnum">{p.votes !== null ? fmtInt(Number(p.votes)) : counted ? "sem votos registrados" : "não publicado"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
