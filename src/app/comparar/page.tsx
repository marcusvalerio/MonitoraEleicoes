import type { Metadata } from "next";
import Link from "next/link";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { candidateTable } from "@/analytics/social-listening";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { SERIES } from "@/components/intel/palette";
import { fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comparar" };

/** Comparador lado a lado (até 4 candidaturas). Métricas observadas; sem vencedor, sem pontuação geral. */
export default async function Compare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sql = intelSql();
  const header = <PageHeader eyebrow="Comparar" title="Comparador de candidaturas" description="Métricas observadas nas fontes conectadas e dados oficiais do TSE, lado a lado. Não há ranking nem indicação de desempenho eleitoral." />;
  if (!sql)
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
        {header}
        <StateView state="provider_unavailable" title="Indisponível neste perfil">O comparador usa dados persistidos (DATA_MODE=live).</StateView>
      </div>
    );
  const ids = String(sp.c ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 4);
  const { filter } = filtersFrom(sp, { period: { preset: "30d" } });
  const cands = ids.length ? ((await sql.query("select c.id, c.year, c.ballot_name, c.party_acronym, o.name as office, t.name as territory, l.person_id from candidacy c join office o on o.id = c.office_id join territory t on t.id = c.territory_id left join identity_link l on l.candidacy_id = c.id and l.status in ('resolved','manual') where c.id = any($1::int[])", [ids])) as Record<string, unknown>[]) : [];
  const social = ids.length ? await candidateTable(sql, filter) : [];
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
      {header}
      {!cands.length ? (
        <Panel>
          <p className="text-[12.5px] text-fg-3">Escolha candidaturas em <Link className="text-fg hover:underline" href="/monitoramento">Monitoramento</Link> ou <Link className="text-fg hover:underline" href="/elections">Eleições</Link>.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="compare-grid">
          {ids.map((id, i) => {
            const c = cands.find((x) => x.id === id);
            if (!c) return null;
            const s = social.find((x) => x.candidacyId === id);
            return (
              <Panel key={id}>
                <p className="flex items-center gap-2 text-[14px] text-fg">
                  <span className="size-2.5 rounded-full" style={{ background: SERIES[i] }} aria-hidden />
                  {c.person_id ? <Link className="hover:underline" href={`/candidatos/${c.person_id}`}>{String(c.ballot_name)}</Link> : String(c.ballot_name)}
                </p>
                <p className="text-[12px] text-fg-3">{String(c.party_acronym ?? "—")} · {String(c.office)} · {String(c.territory)} · {String(c.year)}</p>
                <dl className="mt-3 space-y-1 text-[12.5px]">
                  {[["Menções", s?.mentions], ["Apoio explícito", s?.explicitSupport], ["Crítica explícita", s?.explicitCritique], ["Curtidas (conteúdos que mencionam)", s?.likes]].map(([l, v]) => (
                    <div key={String(l)} className="flex justify-between border-t border-border/60 pt-1">
                      <dt className="text-fg-3">{l}</dt>
                      <dd className="tnum text-fg">{v === undefined || v === null ? "—" : fmtInt(v as number)}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-fg-3">“—” = sem menções coletadas no período ou métrica não fornecida pela plataforma (não é zero). Menção ≠ apoio.</p>
    </div>
  );
}
