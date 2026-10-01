import type { Metadata } from "next";
import Link from "next/link";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { listCandidacies } from "@/analytics/elections";
import { OFFICES } from "@/elections/reference";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { FilterBar } from "@/components/intel/FilterBar";
import { fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Candidatos" };

/** CANDIDATOS — candidaturas registradas no TSE (ordem alfabética; não é ranking). Perfil por pessoa quando há vínculo oficial. */
export default async function Candidatos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sql = await intelSql();
  const header = <PageHeader eyebrow="Candidatos · fonte TSE" title="Candidatos" description="Candidaturas registradas no TSE por eleição, cargo, estado e partido. Ordem alfabética — nenhuma ordenação por desempenho." />;
  if (!sql)
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
        {header}
        <StateView state="provider_unavailable" title="Fonte indisponível neste ambiente">A base eleitoral oficial (TSE) não está disponível aqui.</StateView>
      </div>
    );
  const { filter } = filtersFrom(await searchParams, { year: 2026, offices: [1] });
  const office = filter.offices[0] ?? 1;
  const r = await listCandidacies(sql, filter, 300);
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      {header}
      <FilterBar filter={filter} fields={["year", "office", "region", "uf", "party", "q"]} />
      <Panel title={`${OFFICES.find((o) => o.id === office)?.name ?? "Cargo"} · ${filter.year}`} question={`${fmtInt(r.total)} candidaturas no recorte`}>
        {r.rows.length === 0 ? (
          <StateView state="no_data" compact title="Nenhuma candidatura no recorte" />
        ) : (
          <ul className="grid gap-x-6 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3" data-testid="candidates-list">
            {r.rows.map((c) => (
              <li key={c.candidacyId} className="flex items-baseline gap-2 border-t border-border/60 py-1.5">
                <span className="w-12 shrink-0 text-right text-fg-3 tnum">{c.number ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{c.personId ? <Link className="hover:underline" href={`/candidatos/${c.personId}`}>{c.ballotName}</Link> : c.ballotName}</span>
                <span className="shrink-0 text-fg-3">
                  {c.party ? <Link className="hover:text-fg" href={`/partido/${encodeURIComponent(c.party)}`}>{c.party}</Link> : "—"}
                  {c.uf && c.uf !== "BR" ? ` · ${c.uf}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {r.total > r.rows.length && <p className="mt-2 text-[11px] text-fg-3">Mostrando {fmtInt(r.rows.length)} de {fmtInt(r.total)}. Refine por estado, partido ou nome.</p>}
        <p className="mt-2 text-[11px] text-fg-3">Sem link = identidade sem vínculo oficial entre ciclos (nunca associada por nome).</p>
      </Panel>
    </div>
  );
}
