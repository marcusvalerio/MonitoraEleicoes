import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCampaignAccess } from "@/auth/dal";
import { canWrite } from "@/auth/roles";
import { getInvestment } from "@/evaluation/repo";
import { FREQUENCY_LABEL, STATUS_LABEL, fmtBRL, fmtDateBR, occurrences, statusOf } from "@/evaluation/model";
import { todayBR } from "@/evaluation/service";
import { candidacyRef, observedFor, resultsSource } from "@/evaluation/results";
import { createSql } from "@/persistence/db";
import { EvidenceBadge } from "@/components/intel/EvidenceSection";
import { fmtInt } from "@/lib/format";
import { deleteInvestmentAction } from "../../actions";

export const metadata: Metadata = { title: "Investimento", robots: { index: false } };
const num = "font-[family-name:var(--font-num)] tabular-nums";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  const { id } = await params;
  const { user, campaign } = await requireCampaignAccess();
  if (!campaign || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const i = await getInvestment(user.token, campaign.id, id);
  if (!i) notFound();
  const occ = occurrences(i);
  const status = statusOf(i, todayBR());
  let observed: { state: string; votes: number | null; share: number | null; year: number; office: string; demo: boolean; source: string | null } | "not_linked" | "unavailable" = "not_linked";
  if (campaign.candidacyId) {
    try {
      const sql = createSql(process.env.DATABASE_URL);
      const c = await candidacyRef(sql, campaign.candidacyId);
      if (c) {
        const [o] = await observedFor(sql, c, [{ id: i.territoryId, level: i.territoryLevel, uf: i.territoryUf }]);
        observed = { state: o.state, votes: o.votes, share: o.share, year: c.year, office: c.office, demo: !!c.datasetKind && c.datasetKind !== "production", source: (await resultsSource(sql, c.year))?.source_url ?? null };
      }
    } catch {
      observed = "unavailable";
    }
  }
  const { criado } = await searchParams;
  return (
    <div className="mx-auto max-w-[1080px] space-y-8 px-4 py-6 md:px-8 md:py-8" data-testid="investment-detail">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/avaliacao#investimentos" className="text-[12px] text-fg-3 hover:text-fg">← Investimentos · {campaign.name}</Link>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-[30px] leading-tight font-semibold text-fg">{i.name}</h1>
          <p className="mt-1 text-[13px] text-fg-2">{i.category} · {i.territoryName}{i.territoryLevel === "municipio" && i.territoryUf ? ` · ${i.territoryUf}` : ""} · {STATUS_LABEL[status]}</p>
        </div>
        {canWrite(campaign.role) && (
          <div className="flex items-center gap-2">
            <Link href={`/avaliacao/investimentos/${i.id}/editar`} className="inline-flex h-10 items-center rounded-[10px] border border-border-strong px-4 text-[13px] text-fg hover:bg-elevated">Editar</Link>
            <form action={deleteInvestmentAction}>
              <input type="hidden" name="id" value={i.id} />
              <button className="inline-flex h-10 items-center rounded-[10px] px-3 text-[13px] text-fg-3 hover:text-neg" aria-label="Excluir investimento">Excluir</button>
            </form>
          </div>
        )}
      </header>
      {criado && <p role="status" className="rounded-[10px] border border-pos/30 bg-pos/[0.06] px-4 py-2.5 text-[13px] text-fg-2">Investimento registrado.</p>}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border md:grid-cols-4">
        {[
          ["Total acumulado", fmtBRL(occ.length * i.amountCents), "detail-total"],
          ["Valor por ocorrência", fmtBRL(i.amountCents), ""],
          ["Ocorrências", fmtInt(occ.length), "detail-occurrences"],
          ["Frequência", FREQUENCY_LABEL[i.frequency], ""],
        ].map(([l, v, t]) => (
          <div key={l} className="bg-bg p-4 md:p-5" data-testid={t || undefined}>
            <p className="text-[11.5px] text-fg-3">{l}</p>
            <p className={`${num} mt-2 text-[22px] leading-none font-semibold text-fg md:text-[26px]`}>{v}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-[14px] border border-border bg-surface/40 p-5 lg:col-span-7" aria-label="Ocorrências">
          <p className="font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-[0.16em] text-fg-3">TIMELINE DAS OCORRÊNCIAS</p>
          <p className="mt-1 text-[12px] text-fg-3">Período: {i.frequency === "once" ? fmtDateBR(i.start) : `${fmtDateBR(i.start)} – ${fmtDateBR(i.end)}`}. Regra única; ocorrências derivadas.</p>
          <ol className="relative mt-5 space-y-3 border-l border-border pl-5" data-testid="occurrence-list">
            {occ.slice(0, 120).map((d, k) => (
              <li key={d} className="relative flex items-baseline justify-between text-[13px]">
                <span className="absolute top-1.5 -left-[25px] size-2 rounded-full bg-[#3987e5]" aria-hidden />
                <span className="text-fg-2 tabular-nums">{fmtDateBR(d)} <span className="text-[11px] text-fg-3">#{k + 1}</span></span>
                <span className={`${num} text-fg-2`}>{fmtBRL(i.amountCents)}</span>
              </li>
            ))}
            {occ.length > 120 && <li className="text-[12px] text-fg-3">… mais {occ.length - 120} ocorrências</li>}
          </ol>
          {i.notes && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-[11.5px] text-fg-3">Observações</p>
              <p className="mt-1 text-[13px] whitespace-pre-wrap text-fg-2">{i.notes}</p>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-[14px] border border-border bg-surface/40 p-5 lg:col-span-5" aria-label="Resultado observado no território" data-testid="detail-observed">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-[0.16em] text-fg-3">RESULTADO OBSERVADO NO TERRITÓRIO</p>
            <EvidenceBadge kind="oficial" source="TSE" />
          </div>
          {observed === "not_linked" ? (
            <p className="text-[13px] text-fg-2">A campanha não está vinculada a uma candidatura oficial — sem cruzamento.</p>
          ) : observed === "unavailable" ? (
            <p className="text-[13px] text-fg-2">Fonte oficial indisponível neste ambiente.</p>
          ) : observed.state === "value" ? (
            <>
              {observed.demo && <span className="rounded-[4px] border border-warn/50 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.1em] text-warn">DEMONSTRAÇÃO</span>}
              <p className={`${num} text-[28px] leading-none font-semibold text-fg`}>{fmtInt(observed.votes ?? 0)} <span className="text-[13px] font-medium text-fg-3">votos</span></p>
              <p className={`${num} text-[15px] text-fg-2`}>{observed.share === null ? "—" : `${(observed.share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`} dos votos nominais · {observed.office} · {observed.year}</p>
            </>
          ) : (
            <p className="text-[13px] text-fg-2" data-testid="detail-result-state">{observed.state === "not_available" ? "Resultado oficial ainda não disponível." : "Sem correspondência no resultado oficial para este território."}</p>
          )}
          <p className="text-[11px] text-fg-3">Investimento registrado no período e resultado oficial são exibidos lado a lado de forma descritiva. Não representa causalidade.{typeof observed === "object" && observed.source && <> <a href={observed.source} target="_blank" rel="noreferrer" className="underline">Fonte oficial</a>.</>}</p>
        </section>
      </div>
      <p className="text-[11px] text-fg-3">Registrado em {new Date(i.createdAt).toLocaleString("pt-BR")} · atualizado em {new Date(i.updatedAt).toLocaleString("pt-BR")}</p>
    </div>
  );
}
