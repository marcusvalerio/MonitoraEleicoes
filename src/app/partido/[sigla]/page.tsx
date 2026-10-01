import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { intelSql } from "@/services/intelligence";
import { getBoundaries } from "@/services/geo";
import { partyByUf, partyElected, partyProfile } from "@/analytics/elections";
import { OFFICES } from "@/elections/reference";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { ElectionMap } from "@/components/intel/ElectionMap";
import { SERIES } from "@/components/intel/palette";
import { fmtInt, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ sigla: string }> }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).sigla) };
}

const NA: Record<string, string> = { not_available: "sem votos registrados", not_collected: "não publicado" };

/** PARTIDO — registros, candidaturas, eleitos (situação oficial) e votos por ciclo; distribuição por UF. Fonte: TSE. */
export default async function Partido({ params, searchParams }: { params: Promise<{ sigla: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acronym = decodeURIComponent((await params).sigla).toUpperCase().slice(0, 30);
  const sp = await searchParams;
  const sql = await intelSql();
  if (!sql)
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">
        <StateView state="provider_unavailable" title="Fonte indisponível neste ambiente">A base eleitoral oficial (TSE) não está disponível aqui.</StateView>
      </div>
    );
  const prof = await partyProfile(sql, acronym);
  if (!prof) notFound();
  const withVotes = prof.byOffice.filter((r) => r.votes !== null);
  const year = Number(sp.ano) || withVotes[0]?.year || prof.byOffice[0]?.year || 2022;
  const officesThatYear = prof.byOffice.filter((r) => r.year === year);
  const office = Number(sp.cargo) || (officesThatYear.find((r) => r.officeId === 6) ?? officesThatYear.find((r) => r.votes !== null) ?? officesThatYear[0])?.officeId || 6;
  const [byUf, elected, boundaries] = await Promise.all([partyByUf(sql, acronym, year, office), partyElected(sql, acronym, year), getBoundaries("uf")]);
  const latest = prof.registrations[0];
  const officeName = (id: number) => OFFICES.find((o) => o.id === id)?.name ?? `Cargo ${id}`;
  const years = [...new Set(prof.byOffice.map((r) => r.year))].sort((a, b) => b - a);
  const color = SERIES[0];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader eyebrow={`Partido · nº ${latest.number} · fonte TSE`} title={acronym} description={`${latest.name}${latest.federation ? ` · ${latest.federation}` : ""}. Registros, candidaturas, eleitos e votos oficiais por ciclo.`} />

      <Panel title="Desempenho por ciclo" question="Candidaturas registradas, eleitos (situação oficial do TSE) e votos nominais no 1º turno">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]" data-testid="party-cycles">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 pr-2 font-normal">Ciclo</th>
                <th className="px-2 font-normal">Cargo</th>
                <th className="px-2 text-right font-normal">Candidaturas</th>
                <th className="px-2 text-right font-normal">Eleitos</th>
                <th className="px-2 text-right font-normal">Votos nominais</th>
              </tr>
            </thead>
            <tbody>
              {prof.byOffice.map((r) => (
                <tr key={`${r.year}-${r.officeId}`} className={`border-t border-border/60 ${r.year === year && r.officeId === office ? "bg-elevated" : ""}`}>
                  <td className="py-1.5 pr-2 text-fg tnum">{r.year}</td>
                  <td className="px-2"><Link className="text-fg-2 hover:text-fg hover:underline" href={`?ano=${r.year}&cargo=${r.officeId}`}>{r.office}</Link></td>
                  <td className="px-2 text-right text-fg tnum">{fmtInt(r.candidacies)}</td>
                  <td className="px-2 text-right text-fg tnum">{r.year === 2026 ? "não publicado" : fmtInt(r.elected)}</td>
                  <td className="px-2 text-right text-fg tnum">{r.votes === null ? NA[r.votesStatus] : fmtInt(r.votes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-fg-3">Sigla comparada literalmente entre ciclos (fusões e renomeações não são unificadas). Eleitos = situação oficial “ELEITO”, “ELEITO POR QP” ou “ELEITO POR MÉDIA”.</p>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title={`Eleitos em ${year}`} question={`${fmtInt(elected.length)} candidaturas com situação de eleito`}>
          {year === 2026 ? (
            <p className="text-[12.5px] text-fg-3">Resultados de 2026 ainda não publicados pelo TSE.</p>
          ) : elected.length ? (
            <ul className="grid gap-x-6 text-[12.5px] sm:grid-cols-2" data-testid="party-elected">
              {elected.map((e) => (
                <li key={e.id} className="flex items-baseline gap-2 border-t border-border/60 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-fg">{e.person_id ? <Link className="hover:underline" href={`/candidatos/${e.person_id}`}>{e.ballot_name}</Link> : e.ballot_name}</span>
                  <span className="text-fg-3">{e.office} · {e.uf ?? "BR"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-fg-3">Nenhuma candidatura eleita neste ciclo.</p>
          )}
        </Panel>
        <Panel title="Distribuição por UF" question={`${officeName(office)} · ${year} · participação nos votos nominais do cargo`}>
          <ElectionMap
            boundaries={boundaries}
            entities={[{ id: acronym, name: acronym, color, partyAcronym: "" }]}
            rows={byUf.map((u) => ({ uf: u.uf, leader: u.votes !== null ? { id: acronym, name: acronym, party: null, votes: Number(u.votes), share: u.share } : null, note: year === 2026 ? "não publicado" : "sem votos do partido" }))}
            title={`Votos do ${acronym} por UF, ${officeName(office)} ${year}`}
          />
          <p className="mt-2 text-[11px] text-fg-3">
            Maior participação: {[...byUf].filter((u) => u.share !== null).sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, 3).map((u) => `${u.uf} ${fmtPct(u.share ?? 0, 1)}`).join(" · ") || "—"}
          </p>
          <nav className="mt-2 flex flex-wrap gap-1 text-[11.5px]" aria-label="Ciclos">
            {years.map((y) => (
              <Link key={y} href={`?ano=${y}&cargo=${office}`} className={`rounded-[4px] px-2 py-0.5 ${y === year ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg"}`}>{y}</Link>
            ))}
          </nav>
        </Panel>
      </div>
      <p className="text-[11px] text-fg-3">
        Compare com outros partidos em <Link className="text-fg-2 hover:text-fg" href={`/comparar?partido=${encodeURIComponent(acronym)}&cargo=${office}`}>Comparar →</Link>
      </p>
    </div>
  );
}
