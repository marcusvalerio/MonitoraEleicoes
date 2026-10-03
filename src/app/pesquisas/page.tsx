import type { Metadata } from "next";
import Link from "next/link";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { listPolls, pollsSummary } from "@/analytics/polls";
import { pollsUrl } from "@/elections/polls/importer";
import { PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { FilterBar } from "@/components/intel/FilterBar";
import { WeeklyBars } from "@/components/intel/WeeklyBars";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { EvidenceBadge } from "@/components/intel/EvidenceSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pesquisas" };

const fmtDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const brl = (v: number | null) => (v === null ? "não informado" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));

/**
 * PESQUISAS ELEITORAIS — registro oficial no TSE (PesqEle). Fonte não traz percentuais por candidato:
 * a página mostra QUEM registrou, QUANDO, COM QUE AMOSTRA e METODOLOGIA — nunca intenção de voto inventada.
 */
export default async function Pesquisas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sql = await intelSql();
  const header = (
    <PageHeader
      eyebrow={<EvidenceBadge kind="registro" source="PesqEle / TSE" />}
      title="Pesquisas eleitorais"
      description="Pesquisas registradas no TSE (PesqEle): instituto, contratante, período de campo, amostra, custo e metodologia. Percentuais por candidato não constam desta fonte."
    />
  );
  if (!sql)
    return (
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 md:px-6">
        {header}
        <StateView state="provider_unavailable" title="Fonte indisponível neste ambiente">A base de pesquisas registradas no TSE não está disponível aqui.</StateView>
      </div>
    );
  const { filter } = filtersFrom(sp, { year: 2026 });
  const company = typeof sp.instituto === "string" ? sp.instituto.slice(0, 80) : null;
  const [summary, page] = await Promise.all([pollsSummary(sql, filter, { company }), listPolls(sql, filter, { company, cursor: typeof sp.cursor === "string" ? sp.cursor : null, limit: 30 })]);
  const base = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "cursor") as [string, string][]);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      {header}
      <FilterBar filter={filter} fields={["year", "office", "region", "uf"]} />

      <section className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4" data-testid="polls-summary">
        {[
          ["Pesquisas registradas", fmtInt(summary.total)],
          ["Institutos", fmtInt(summary.companies)],
          ["De abrangência nacional", fmtInt(summary.national)],
          ["Última divulgação prevista", fmtDate(summary.lastRelease)],
        ].map(([l, v]) => (
          <div key={l} className="bg-surface p-3">
            <p className="text-[11px] tracking-wide text-fg-3 uppercase">{l}</p>
            <p className="mt-1 font-display text-[22px] leading-none font-semibold text-fg tnum">{v}</p>
          </div>
        ))}
      </section>
      <p className="-mt-3 text-[11px] text-fg-3">
        Fonte: TSE · Dados Abertos, <a className="hover:text-fg" href={pollsUrl(filter.year)} rel="noreferrer" target="_blank">pesquisa_eleitoral_{filter.year}</a>
        {summary.importedAt ? ` · importado em ${fmtDateTime(summary.importedAt)}` : " · ainda não importado"}. Contagem de registros — não indica resultado de pesquisa.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Registros por semana" question="Pela data de divulgação informada no registro">
          <WeeklyBars data={summary.byWeek} label="Registros" />
        </Panel>
        <Panel title="Institutos com mais registros" question="No recorte selecionado">
          {summary.byCompany.length ? (
            <ul className="space-y-1" data-testid="polls-companies">
              {summary.byCompany.map((c) => (
                <li key={c.company}>
                  <Link href={`?${new URLSearchParams({ ...Object.fromEntries(base), instituto: c.company })}`} className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-center gap-3 rounded-[var(--radius-sm)] px-1.5 py-1 text-[12.5px] text-fg-2 hover:bg-elevated hover:text-fg">
                    <span className="truncate">{c.company}</span>
                    <span className="h-2 rounded-r-[4px] bg-[#a4a4a8]" style={{ width: `${Math.max(4, (c.n / summary.byCompany[0].n) * 100)}%` }} aria-hidden />
                    <span className="text-right text-fg tnum">{fmtInt(c.n)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-fg-3">Nenhum registro.</p>
          )}
        </Panel>
      </div>

      <Panel title={company ? `Registros · ${company}` : "Registros"} question="Mais recentes primeiro (data de divulgação)">
        {company && (
          <p className="mb-2 text-[12px]">
            <Link className="text-fg-3 hover:text-fg" href={`?${new URLSearchParams([...base].filter(([k]) => k !== "instituto"))}`}>× remover filtro de instituto</Link>
          </p>
        )}
        {page.items.length === 0 ? (
          <StateView state="no_data" compact title="Nenhuma pesquisa registrada no recorte" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[12.5px]" data-testid="polls-table">
              <thead>
                <tr className="text-left text-fg-3">
                  <th className="py-1 pr-2 font-normal">Divulgação</th>
                  <th className="px-2 font-normal">Instituto</th>
                  <th className="px-2 font-normal">Abrangência · cargos</th>
                  <th className="px-2 font-normal">Campo</th>
                  <th className="px-2 text-right font-normal">Amostra</th>
                  <th className="px-2 font-normal">Contratante</th>
                  <th className="px-2 font-normal">Resultados</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((p) => (
                  <tr key={p.protocol} className="border-t border-border/60 align-top">
                    <td className="py-1.5 pr-2 text-fg tnum">{fmtDate(p.releaseDate)}<span className="block text-[11px] text-fg-3">{p.protocol}</span></td>
                    <td className="px-2 py-1.5 text-fg">{p.company}{p.ownPoll ? <span className="block text-[11px] text-fg-3">recursos próprios</span> : null}</td>
                    <td className="px-2 py-1.5 text-fg-2">{p.uf === "BR" ? "Brasil" : p.uf}<span className="block text-[11px] text-fg-3">{p.offices ?? "—"}</span></td>
                    <td className="px-2 py-1.5 text-fg-2 tnum">{fmtDate(p.fieldStart)} – {fmtDate(p.fieldEnd)}</td>
                    <td className="px-2 py-1.5 text-right text-fg tnum">{p.sampleSize === null ? "não informada" : fmtInt(p.sampleSize)}<span className="block text-[11px] text-fg-3">{brl(p.costBrl)}</span></td>
                    <td className="px-2 py-1.5 text-fg-2">{p.contractors.length ? p.contractors.map((c) => c.name ?? "—").join("; ") : "não informado"}</td>
                    <td className="px-2 py-1.5"><Tag tone="neutral" className="normal-case">Percentual não disponível nesta fonte</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page.nextCursor && (
          <p className="mt-3 text-right text-[12.5px]">
            <Link className="text-fg-2 hover:text-fg" href={`?${new URLSearchParams({ ...Object.fromEntries(base), cursor: page.nextCursor })}`} data-testid="polls-next">Mais registros →</Link>
          </p>
        )}
        <p className="mt-2 text-[11px] text-fg-3">Registro não é resultado: a pesquisa pode não ter sido divulgada, ou ter sido divulgada fora do período informado. Percentuais só serão exibidos quando houver fonte confiável com proveniência registrada.</p>
      </Panel>
    </div>
  );
}
