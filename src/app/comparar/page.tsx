import type { Metadata } from "next";
import Link from "next/link";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { compareCycles, municipalitiesOf, partyHistory, personHistory, searchPeople } from "@/analytics/elections";
import { OFFICES, REGIONS } from "@/elections/reference";
import { effectiveUfs } from "@/domain/filters";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { FilterBar } from "@/components/intel/FilterBar";
import { SERIES } from "@/components/intel/palette";
import { fmtInt, fmtPct } from "@/lib/format";
import { SocialCompare } from "./SocialCompare";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comparar" };

const officeName = (id: number) => OFFICES.find((o) => o.id === id)?.name ?? `Cargo ${id}`;
const NA: Record<string, string> = { not_available: "sem votos registrados", not_collected: "não publicado" };
const ids = (v: unknown, max = 4) => String(v ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, max);

/**
 * COMPARAR — comparação FACTUAL entre ciclos (2014 × 2018 × 2022, e 2026 quando houver): recorte (cargo × UF/município),
 * partidos e pessoas (por vínculo oficial de identidade). Só indicadores calculáveis com os dados oficiais importados.
 * Modo social (?modo=social&c=…) compara menções nas fontes conectadas.
 */
export default async function Compare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sql = await intelSql();
  const social = sp.modo === "social" || (sp.c !== undefined && sp.modo !== "historico");
  const header = (
    <PageHeader
      eyebrow="Comparar"
      title="Comparar eleições"
      description="Ciclos, partidos e trajetórias lado a lado, com dados oficiais do TSE. Sem ranking nem indicador que os dados não sustentem."
    />
  );
  const tabs = (
    <nav className="flex gap-1 text-[12.5px]" aria-label="Modo de comparação">
      {[["historico", "Histórico eleitoral"], ["social", "Menções 2026"]].map(([m, l]) => (
        <Link key={m} href={`/comparar?modo=${m}`} aria-current={(m === "social") === social ? "page" : undefined} className={`rounded-[4px] px-2.5 py-1 ${(m === "social") === social ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg-2"}`}>
          {l}
        </Link>
      ))}
    </nav>
  );
  if (!sql)
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
        {header}
        <StateView state="provider_unavailable" title="Indisponível neste perfil">O comparador usa dados persistidos (DATA_MODE=live).</StateView>
      </div>
    );
  if (social)
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
        {header}
        {tabs}
        <SocialCompare sql={sql} sp={sp} />
      </div>
    );

  const { filter } = filtersFrom(sp);
  const office = filter.offices[0] ?? 1;
  const ufs = effectiveUfs(filter, REGIONS);
  const people = ids(sp.pessoa);
  const [cycles, municipalities, histories, found] = await Promise.all([
    compareCycles(sql, filter),
    ufs.length === 1 ? municipalitiesOf(sql, ufs[0]) : Promise.resolve([]),
    Promise.all(people.map((p) => personHistory(sql, p))),
    filter.candidateQuery ? searchPeople(sql, filter.candidateQuery, 12) : Promise.resolve([]),
  ]);
  const parties = filter.parties.slice(0, 6);
  const ph = parties.length ? (await partyHistory(sql, filter, parties)).sort((a, b) => a.year - b.year) : [];
  const scope = filter.municipality ? (municipalities.find((m) => m.id === filter.municipality)?.name ?? "município") : ufs.length ? ufs.join(", ") : "Brasil";
  const withPerson = (id: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    q.set("pessoa", [...new Set([...people, id])].slice(0, 4).join(","));
    q.delete("q");
    return `/comparar?${q}`;
  };
  const years = cycles.map((c) => c.year).sort();

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      {header}
      {tabs}
      <FilterBar filter={filter} fields={["office", "region", "uf", "municipality", "party", "q"]} municipalities={municipalities} />

      <Panel title={`${officeName(office)} · ${scope}`} question="Ciclo a ciclo, no mesmo recorte (1º turno)">
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[12.5px]" data-testid="compare-cycles">
          <thead>
            <tr className="text-left text-fg-3">
              <th className="py-1 pr-2 font-normal">Indicador</th>
              {years.map((y) => (
                <th key={y} className="px-2 text-right font-normal">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/60">
              <td className="py-1.5 pr-2 text-fg-2">Candidaturas registradas</td>
              {years.map((y) => {
                const c = cycles.find((x) => x.year === y)!;
                return <td key={y} className="px-2 text-right tnum text-fg">{c.candidacies === null ? "n/a" : fmtInt(c.candidacies)}</td>;
              })}
            </tr>
            <tr className="border-t border-border/60">
              <td className="py-1.5 pr-2 text-fg-2">Votos nominais apurados</td>
              {years.map((y) => {
                const c = cycles.find((x) => x.year === y)!;
                return <td key={y} className="px-2 text-right tnum text-fg">{c.nominalVotes === null ? NA[c.votesStatus] : fmtInt(c.nominalVotes)}</td>;
              })}
            </tr>
            <tr className="border-t border-border/60">
              <td className="py-1.5 pr-2 text-fg-2">Partidos com votos</td>
              {years.map((y) => {
                const c = cycles.find((x) => x.year === y)!;
                return <td key={y} className="px-2 text-right tnum text-fg">{c.partiesWithVotes === null ? NA[c.votesStatus] : fmtInt(c.partiesWithVotes)}</td>;
              })}
            </tr>
          </tbody>
        </table></div>
        <p className="mt-2 text-[11px] text-fg-3">Candidaturas no município não se aplicam (registro é por UF/BR). 2026: resultados só após publicação oficial do TSE.</p>
      </Panel>

      <Panel title="Partidos" question={parties.length ? `Votos nominais por ciclo · ${officeName(office)} · ${scope}` : "Informe siglas no filtro “Partido” (ex.: PT,PL,MDB)"}>
        {ph.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[12.5px]" data-testid="compare-parties">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 pr-2 font-normal">Partido</th>
                {ph.map((h) => (
                  <th key={h.year} className="px-2 text-right font-normal">{h.year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parties.map((p, i) => (
                <tr key={p} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 text-fg">
                    <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: SERIES[i] }} aria-hidden />
                    {p}
                  </td>
                  {ph.map((h) => {
                    const c = h.parties.find((x) => x.party === p)!;
                    const total = cycles.find((x) => x.year === h.year)?.nominalVotes ?? null;
                    return (
                      <td key={h.year} className="px-2 text-right tnum text-fg-2">
                        {c.votes !== null ? (
                          <>
                            <span className="text-fg">{fmtInt(c.votes)}</span>
                            {total ? <span className="ml-1 text-[11px] text-fg-3">{fmtPct(c.votes / total, 1)}</span> : null}
                          </>
                        ) : (
                          NA[c.votesStatus] ?? "não disponível"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {ph.length > 0 && <p className="mt-2 text-[11px] text-fg-3">% = participação nos votos nominais do cargo no recorte e ciclo. Siglas comparadas literalmente (fusões e renomeações não são unificadas).</p>}
      </Panel>

      <Panel title="Pessoas" question="Trajetórias por vínculo oficial de identidade (até 4) — busque pelo nome no filtro “Candidato”">
        {found.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2 text-[12px]" data-testid="compare-search">
            {found.map((c) => (
              <li key={c.personId}>
                <Link className="rounded-[4px] border border-border px-2 py-1 text-fg-2 hover:text-fg" href={withPerson(c.personId)}>
                  + {c.ballotName} <span className="text-fg-3">{c.party ?? ""} · {c.years.join(", ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {histories.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" data-testid="compare-people">
              <thead>
                <tr className="text-left text-fg-3">
                  <th className="py-1 pr-2 font-normal">Ciclo</th>
                  {histories.map((h, i) => (
                    <th key={people[i]} className="px-2 font-normal">
                      <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: SERIES[i] }} aria-hidden />
                      <Link className="text-fg hover:underline" href={`/candidatos/${people[i]}`}>{h[0]?.ballotName ?? `pessoa ${people[i]}`}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[2014, 2018, 2022, 2026].map((y) => (
                  <tr key={y} className="border-t border-border/60 align-top">
                    <td className="py-1.5 pr-2 text-fg-2 tnum">{y}</td>
                    {histories.map((h, i) => {
                      const items = h.filter((x) => x.year === y);
                      return (
                        <td key={people[i]} className="px-2 py-1.5">
                          {items.length ? (
                            items.map((x) => (
                              <p key={x.candidacyId} className="text-fg">
                                {x.office} · {x.uf ?? "BR"} · {x.party ?? "—"}
                                <span className="block text-[11.5px] text-fg-3">
                                  {x.votesRound1 !== null ? `${fmtInt(x.votesRound1)} votos` : y === 2026 ? "resultado não publicado" : "sem votos registrados"} · {[x.statusRound1, x.statusRound2].filter(Boolean).join(" / ") || "—"}
                                </span>
                              </p>
                            ))
                          ) : (
                            <span className="text-fg-3">sem candidatura</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[12.5px] text-fg-3">Nenhuma pessoa selecionada.</p>
        )}
        <p className="mt-2 text-[11px] text-fg-3">Vínculo entre ciclos somente por identificador oficial (hash de título/CPF) ou revisão manual — nunca por nome. Votos de cargos diferentes não são comparáveis entre si.</p>
      </Panel>
    </div>
  );
}
