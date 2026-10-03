import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus, SlidersHorizontal } from "lucide-react";
import { requireCampaignAccess } from "@/auth/dal";
import { canWrite, ROLE_LABEL } from "@/auth/roles";
import { evaluationData, periodComparison, type Filters, type ResultBlock } from "@/evaluation/service";
import { FREQUENCIES, FREQUENCY_LABEL, STATUS_LABEL, fmtBRL, fmtDateBR, isIsoDate, type Frequency, type InvestmentStatus } from "@/evaluation/model";
import { getBoundaries } from "@/services/geo";
import { EvidenceBadge } from "@/components/intel/EvidenceSection";
import { CampaignSwitcher } from "@/components/evaluation/CampaignSwitcher";
import { TimelineChart } from "@/components/evaluation/TimelineChart";
import { EvaluationMap } from "@/components/evaluation/EvaluationMap";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "Avaliação", robots: { index: false } };

type SP = Record<string, string | undefined>;
const pick = <T extends string>(v: string | undefined, all: readonly T[]) => (v && (all as readonly string[]).includes(v) ? (v as T) : null);
const STATUSES = ["agendado", "ativo", "encerrado"] as const;
const LEVEL = { pais: "País", regiao: "Região", uf: "UF", municipio: "Município" } as Record<string, string>;
const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const pp = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`);
const signed = (x: number | null, f: (n: number) => string) => (x === null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : "±"}${f(Math.abs(x))}`);
const relPct = (x: number | null) => (x === null ? "—" : signed(x, (n) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`));
const num = "font-[family-name:var(--font-num)] tabular-nums";
const eyebrow = "font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-[0.16em] text-fg-3";

export default async function AvaliacaoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { user, campaign, campaigns } = await requireCampaignAccess({ slug: sp.campanha ?? null });

  if (!campaign)
    return (
      <Shell>
        <Header />
        <Empty title={user.isAdmin ? "Nenhuma campanha criada." : "Sua conta ainda não está vinculada a uma campanha."} body={user.isAdmin ? "Crie uma campanha e defina o responsável no painel administrativo." : "Peça à administração da plataforma o acesso à sua campanha."} cta={user.isAdmin ? { href: "/admin/campanhas", label: "Ir para campanhas" } : null} />
      </Shell>
    );

  const f: Filters = {
    from: isIsoDate(sp.de) ? sp.de : null,
    to: isIsoDate(sp.ate) ? sp.ate : null,
    territoryId: sp.territorio ? Number(sp.territorio) || null : null,
    category: sp.categoria || null,
    frequency: pick<Frequency>(sp.frequencia, FREQUENCIES),
    status: pick<InvestmentStatus>(sp.status, STATUSES),
    q: sp.q ?? "",
  };
  const d = await evaluationData(user, campaign, f, sp.base ? Number(sp.base) || null : null);
  const writable = canWrite(campaign.role);
  const filtered = Object.values({ ...f, q: f.q || null }).some((v) => v !== null);
  const boundaries = d.territories.length ? await getBoundaries("uf").catch(() => null) : null;
  const pa = isIsoDate(sp.pa_de) && isIsoDate(sp.pa_ate) ? { from: sp.pa_de, to: sp.pa_ate } : null;
  const pb = isIsoDate(sp.pb_de) && isIsoDate(sp.pb_ate) ? { from: sp.pb_de, to: sp.pb_ate } : null;
  const cmp = pa && pb ? periodComparison(d.items, pa, pb) : null;

  return (
    <Shell>
      <Header
        campaign={<CampaignSwitcher campaigns={campaigns.map((c) => ({ slug: c.slug, name: c.name }))} current={campaign.slug} />}
        role={campaign.role ? ROLE_LABEL[campaign.role] : "Administração (somente leitura)"}
        cta={writable ? <NewCta /> : null}
      />

      {d.all.length === 0 ? (
        <Empty title="Comece registrando os investimentos da campanha." body="Cada registro é uma ação com valor, período, frequência e território. Depois da apuração, o Monitora compara esse histórico com os resultados oficiais do TSE." cta={writable ? { href: "/avaliacao/investimentos/novo", label: "Registrar investimento" } : null} />
      ) : (
        <>
          {/* 1–4. Quanto, onde, quando, em quê */}
          <section aria-label="Resumo" className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border lg:grid-cols-4" data-testid="evaluation-kpis">
            <Kpi label="Investimento total" value={fmtBRL(d.summary.totalCents)} hint={`média de ${fmtBRL(d.summary.avgPerActionCents)} por ação`} testid="kpi-total" />
            <Kpi label="Ações registradas" value={fmtInt(d.summary.actions)} hint={`${fmtInt(d.summary.occurrences)} ocorrências`} testid="kpi-actions" />
            <Kpi label="Territórios com investimento" value={fmtInt(d.summary.territories)} hint={`${fmtBRL(d.summary.avgPerTerritoryCents)} por território`} />
            <Kpi label="Período analisado" value={d.summary.period ? `${fmtDateBR(d.summary.period.start).slice(0, 5)} – ${fmtDateBR(d.summary.period.end).slice(0, 5)}` : "—"} hint={d.summary.period ? `${d.summary.period.start.slice(0, 4)}${d.summary.period.end.slice(0, 4) !== d.summary.period.start.slice(0, 4) ? `–${d.summary.period.end.slice(0, 4)}` : ""}${f.from || f.to ? " · recorte aplicado" : ""}` : "sem registros no recorte"} small />
          </section>
          <p className="-mt-6 text-[11.5px] text-fg-3">Números calculados exclusivamente a partir dos registros desta campanha{filtered ? " (com os filtros aplicados)" : ""}.</p>

          <FilterBar f={f} categories={d.categories} territories={d.territoryOptions} />

          {/* 5. Distribuição no tempo e no território */}
          <section className="grid items-start gap-6 lg:grid-cols-12">
            <div className="rounded-[14px] border border-border bg-surface/40 p-5 lg:col-span-7">
              <TimelineChart series={d.series} />
            </div>
            <div className="rounded-[14px] border border-border bg-surface/40 p-5 lg:col-span-5" data-testid="by-territory">
              <p className={eyebrow}>INVESTIMENTO POR TERRITÓRIO</p>
              {d.territories.length === 0 ? (
                <p className="py-8 text-center text-[12.5px] text-fg-3">Nenhum registro no recorte.</p>
              ) : (
                <>
                  <ul className="mt-4 space-y-3">
                    {d.territories.slice(0, 8).map((t) => (
                      <li key={t.territoryId}>
                        <div className="flex items-baseline justify-between gap-3">
                          <Link href={`?territorio=${t.territoryId}`} className="min-w-0 truncate text-[13px] text-fg hover:underline">{t.name}{t.level === "municipio" && t.uf ? ` · ${t.uf}` : ""} <span className="text-[11px] text-fg-3">{LEVEL[t.level]}</span></Link>
                          <span className={`${num} text-[15px] font-semibold text-fg`}>{fmtBRL(t.cents, { compact: true })}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated" aria-hidden><span className="block h-full rounded-full bg-[#3987e5]" style={{ width: `${(t.cents / d.territories[0].cents) * 100}%` }} /></span>
                          <span className="text-[11px] text-fg-3 tabular-nums">{t.actions} {t.actions === 1 ? "ação" : "ações"}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {Object.keys(d.ufTotals).length > 0 && <div className="mt-5 border-t border-border pt-4"><EvaluationMap boundaries={boundaries} totals={d.ufTotals} /></div>}
                </>
              )}
            </div>
          </section>

          {/* Investimentos (lista) */}
          <InvestmentList rows={d.rows} />

          {/* 6. Resultado oficial observado */}
          <ResultSection r={d.result} sp={sp} />

          {/* 7. Comparação temporal (investimento registrado) */}
          <PeriodSection cmp={cmp} pa={pa} pb={pb} sp={sp} />
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1180px] space-y-10 px-4 py-6 md:px-8 md:py-8">{children}</div>;
}

function Header({ campaign, role, cta }: { campaign?: React.ReactNode; role?: string; cta?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
          <span className={eyebrow}>CAMPANHA</span>
          {campaign}
          {role && <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[10.5px] tracking-[0.06em]">{role}</span>}
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-none font-semibold tracking-tight text-fg md:text-[44px]">Avaliação</h1>
        <p className="mt-3 max-w-xl text-[14px] text-fg-2">Relacione investimentos registrados, ações e resultados eleitorais oficiais.</p>
      </div>
      {cta}
    </header>
  );
}

function NewCta() {
  return (
    <Link href="/avaliacao/investimentos/novo" className="fixed right-4 bottom-20 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-fg px-5 text-[14px] font-semibold text-bg shadow-[0_12px_40px_-12px_rgba(0,0,0,0.9)] hover:bg-white md:static md:h-10 md:rounded-[10px] md:px-4 md:text-[13px] md:shadow-none" data-testid="new-investment">
      <Plus size={16} aria-hidden /> Registrar investimento
    </Link>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta: { href: string; label: string } | null }) {
  return (
    <section className="relative overflow-hidden rounded-[18px] border border-border bg-surface/40 px-6 py-14 text-center md:py-20" data-testid="evaluation-empty">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(57,135,229,0.10),transparent_70%)]" aria-hidden />
      <p className={`${eyebrow} relative`}>AÇÃO → INVESTIMENTO → TERRITÓRIO → PERÍODO → RESULTADO OFICIAL</p>
      <h2 className="relative mx-auto mt-4 max-w-lg font-[family-name:var(--font-display)] text-[24px] leading-tight font-semibold text-fg md:text-[28px]">{title}</h2>
      <p className="relative mx-auto mt-3 max-w-lg text-[13.5px] text-fg-2">{body}</p>
      {cta && (
        <Link href={cta.href} className="relative mt-7 inline-flex h-11 items-center gap-2 rounded-[10px] bg-fg px-5 text-[14px] font-semibold text-bg hover:bg-white">
          {cta.label} <ArrowRight size={15} aria-hidden />
        </Link>
      )}
    </section>
  );
}

function Kpi({ label, value, hint, small, testid }: { label: string; value: string; hint?: string; small?: boolean; testid?: string }) {
  return (
    <div className="bg-bg p-4 md:p-5" data-testid={testid}>
      <p className="text-[11.5px] text-fg-3">{label}</p>
      <p className={`${num} mt-2 leading-none font-semibold text-fg ${small ? "text-[20px] md:text-[24px]" : "text-[22px] md:text-[30px]"}`}>{value}</p>
      {hint && <p className="mt-2 text-[11.5px] text-fg-3">{hint}</p>}
    </div>
  );
}

const sel = "h-9 rounded-[8px] border border-border-strong bg-bg px-2.5 text-[12.5px] text-fg";
function FilterFields({ f, categories, territories }: { f: Filters; categories: string[]; territories: { id: number; name: string; level: string }[] }) {
  return (
    <>
      <label className="sr-only" htmlFor="flt-q">Buscar</label>
      <input id="flt-q" name="q" defaultValue={f.q} placeholder="Buscar ação, categoria, território…" className={`${sel} min-w-0 flex-1 lg:max-w-64`} />
      <select name="territorio" aria-label="Território" defaultValue={f.territoryId ?? ""} className={sel}>
        <option value="">Todos os territórios</option>
        {territories.map((t) => <option key={t.id} value={t.id}>{t.name} · {LEVEL[t.level]}</option>)}
      </select>
      <select name="categoria" aria-label="Categoria" defaultValue={f.category ?? ""} className={sel}>
        <option value="">Todas as categorias</option>
        {categories.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select name="frequencia" aria-label="Frequência" defaultValue={f.frequency ?? ""} className={sel}>
        <option value="">Toda frequência</option>
        {FREQUENCIES.map((x) => <option key={x} value={x}>{FREQUENCY_LABEL[x]}</option>)}
      </select>
      <select name="status" aria-label="Status" defaultValue={f.status ?? ""} className={sel}>
        <option value="">Todo status</option>
        {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
      </select>
      <span className="flex items-center gap-1.5 text-[12px] text-fg-3">
        <input type="date" name="de" aria-label="De" defaultValue={f.from ?? ""} className={sel} />–<input type="date" name="ate" aria-label="Até" defaultValue={f.to ?? ""} className={sel} />
      </span>
      <button className="h-9 rounded-[8px] bg-elevated px-3 text-[12.5px] text-fg hover:bg-hover">Aplicar</button>
      <Link href="/avaliacao" className="text-[12px] text-fg-3 hover:text-fg">Limpar</Link>
    </>
  );
}

/** Filtros por URL (GET). Desktop em linha; mobile em gaveta (details) — funciona sem JavaScript. */
function FilterBar(p: { f: Filters; categories: string[]; territories: { id: number; name: string; level: string }[] }) {
  return (
    <div data-testid="evaluation-filters">
      <form method="get" className="hidden flex-wrap items-center gap-2 lg:flex" aria-label="Filtros"><FilterFields {...p} /></form>
      <details className="group lg:hidden">
        <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-border-strong px-3 text-[13px] text-fg">
          <SlidersHorizontal size={14} aria-hidden /> Filtros
        </summary>
        <form method="get" className="mt-3 flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-4 [&>*]:w-full" aria-label="Filtros"><FilterFields {...p} /></form>
      </details>
    </div>
  );
}

function InvestmentList({ rows }: { rows: Awaited<ReturnType<typeof evaluationData>>["rows"] }) {
  const tone = { ativo: "border-pos/40 text-pos", agendado: "border-info/40 text-info", encerrado: "border-border text-fg-3" };
  return (
    <section id="investimentos" aria-label="Investimentos" data-testid="investment-list">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-[20px] font-semibold text-fg">Investimentos</h2>
        <p className="text-[12px] text-fg-3">{rows.length} {rows.length === 1 ? "registro" : "registros"}</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-[12px] border border-dashed border-border px-4 py-8 text-center text-[13px] text-fg-3">Nenhum investimento corresponde aos filtros.</p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[14px] border border-border md:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface/60 text-[11px] tracking-[0.04em] text-fg-3 uppercase">
                <tr>{["Ação", "Categoria", "Território", "Frequência", "Período", "Por ocorrência", "Total acumulado", "Status"].map((h, i) => <th key={h} className={`px-3 py-2.5 font-medium ${i >= 5 && i <= 6 ? "text-right" : ""}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface/50" data-testid="investment-row">
                    <td className="px-3 py-3"><Link href={`/avaliacao/investimentos/${r.id}`} className="font-medium text-fg hover:underline">{r.name}</Link></td>
                    <td className="px-3 py-3 text-fg-2">{r.category}</td>
                    <td className="px-3 py-3 text-fg-2">{r.territoryName}{r.territoryLevel === "municipio" && r.territoryUf ? ` · ${r.territoryUf}` : ""}</td>
                    <td className="px-3 py-3 text-fg-2">{FREQUENCY_LABEL[r.frequency]}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-fg-2 tabular-nums">{r.frequency === "once" ? fmtDateBR(r.start) : `${fmtDateBR(r.start)} – ${fmtDateBR(r.end)}`}</td>
                    <td className={`${num} px-3 py-3 text-right text-fg-2`}>{fmtBRL(r.amountCents)}</td>
                    <td className={`${num} px-3 py-3 text-right font-semibold text-fg`} data-testid="row-total">{fmtBRL(r.totalCents)}</td>
                    <td className="px-3 py-3"><span className={`rounded-[4px] border px-1.5 py-0.5 text-[10.5px] tracking-[0.06em] uppercase ${tone[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/avaliacao/investimentos/${r.id}`} className="block rounded-[12px] border border-border bg-surface/40 p-4" data-testid="investment-card">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-fg">{r.name}</p>
                    <span className={`shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase ${tone[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-fg-3">{r.category} · {r.territoryName} · {FREQUENCY_LABEL[r.frequency]}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-[11.5px] text-fg-3 tabular-nums">{r.occurrences} × {fmtBRL(r.amountCents)}</span>
                    <span className={`${num} text-[18px] font-semibold text-fg`}>{fmtBRL(r.totalCents)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function stateText(s: string) {
  return s === "not_available" ? "Resultado oficial ainda não disponível." : s === "no_match" ? "Sem correspondência no resultado oficial para este território." : "";
}

function ResultSection({ r, sp }: { r: ResultBlock; sp: SP }) {
  return (
    <section aria-label="Resultado observado" className="space-y-4" data-testid="observed-result">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-[20px] font-semibold text-fg">Resultado observado</h2>
        <EvidenceBadge kind="oficial" source="TSE" />
      </div>
      {r.state === "not_linked" && <p className="rounded-[12px] border border-dashed border-border px-4 py-6 text-[13px] text-fg-2" data-testid="result-not-linked">A campanha ainda não está vinculada a uma candidatura oficial do TSE. A administração faz esse vínculo em Campanhas; sem ele não há cruzamento.</p>}
      {r.state === "source_unavailable" && <p className="rounded-[12px] border border-dashed border-border px-4 py-6 text-[13px] text-fg-2">Fonte oficial indisponível neste ambiente.</p>}
      {r.state === "ready" && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-fg-2">
            <span>
              Candidatura: <strong className="text-fg">{r.candidacy.ballotName}</strong> · {r.candidacy.office}{r.candidacy.uf && r.candidacy.uf !== "BR" ? ` (${r.candidacy.uf})` : ""} · {r.candidacy.year} · 1º turno
            </span>
            {r.candidacy.datasetKind && r.candidacy.datasetKind !== "production" && <span className="rounded-[4px] border border-warn/50 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.1em] text-warn" data-testid="demo-label">DEMONSTRAÇÃO</span>}
            {r.bases.length > 0 && (
              <form method="get" className="flex items-center gap-2">
                {Object.entries(sp).filter(([k]) => k !== "base").map(([k, v]) => <input key={k} type="hidden" name={k} value={v ?? ""} />)}
                <label htmlFor="base" className="text-fg-3">Base de comparação</label>
                <select id="base" name="base" defaultValue={r.base?.id ?? ""} className={sel}>
                  <option value="">Sem base</option>
                  {r.bases.map((b) => <option key={b.id} value={b.id}>{b.year} · {b.office}</option>)}
                </select>
                <button className="h-9 rounded-[8px] bg-elevated px-3 text-[12px] text-fg">Comparar</button>
              </form>
            )}
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {r.rows.map((x) => (
              <li key={x.territoryId} className="rounded-[14px] border border-border bg-surface/40 p-5" data-testid="observed-row">
                <p className="text-[13px] font-medium text-fg">{x.name} <span className="text-[11px] text-fg-3">{LEVEL[x.level]}</span></p>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div>
                    <p className="text-[10.5px] tracking-[0.1em] text-fg-3 uppercase">Investimento registrado</p>
                    <p className={`${num} mt-1 text-[20px] font-semibold text-fg`}>{fmtBRL(x.cents, { compact: true })}</p>
                    <p className="text-[11.5px] text-fg-3">{x.actions} {x.actions === 1 ? "ação" : "ações"}</p>
                  </div>
                  <ArrowRight size={16} className="text-fg-3" aria-hidden />
                  <div>
                    <p className="text-[10.5px] tracking-[0.1em] text-fg-3 uppercase">Resultado oficial</p>
                    {x.current.state === "value" ? (
                      <>
                        <p className={`${num} mt-1 text-[20px] font-semibold text-fg`}>{fmtInt(x.current.votes ?? 0)} <span className="text-[12px] font-medium text-fg-3">votos</span></p>
                        <p className={`${num} text-[13px] text-fg-2`}>{pct(x.current.share)}</p>
                      </>
                    ) : (
                      <p className="mt-1 text-[12.5px] text-fg-2" data-testid="result-state">{stateText(x.current.state)}</p>
                    )}
                  </div>
                </div>
                {r.base && (
                  <div className="mt-4 border-t border-border pt-3 text-[12px] text-fg-2">
                    <p className="text-[10.5px] tracking-[0.1em] text-fg-3 uppercase">Variação observada vs. {r.base.year}</p>
                    {x.pp !== null || x.votesVar.abs !== null ? (
                      <p className="mt-1"><span className={`${num} text-[16px] font-semibold text-fg`}>{pp(x.pp)}</span> <span className="text-fg-3">· votos {signed(x.votesVar.abs, (n) => fmtInt(n))} ({relPct(x.votesVar.rel)})</span></p>
                    ) : (
                      <p className="mt-1 text-fg-3">Período sem comparação possível (sem resultado oficial em uma das eleições).</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="grid gap-px overflow-hidden rounded-[14px] border border-border bg-border sm:grid-cols-3">
            <Kpi label="Votos observados (sem dupla contagem)" value={r.totals.votes === null ? "—" : fmtInt(r.totals.votes)} hint={r.totals.votes === null ? "Resultado oficial ainda não disponível." : `${r.totals.covered} ${r.totals.covered === 1 ? "território" : "territórios"} com resultado`} />
            <Kpi label="Investimento registrado (recorte)" value={fmtBRL(r.totals.cents)} />
            <Kpi label="Valor registrado por voto observado" value={r.totals.perVoteCents === null ? "—" : fmtBRL(Math.round(r.totals.perVoteCents))} hint="investimento em territórios com resultado ÷ votos observados" testid="per-vote" />
          </div>
          <p className="text-[11.5px] leading-relaxed text-fg-3" data-testid="no-causality">
            Comparação descritiva. Não representa causalidade. O “valor registrado por voto observado” é um indicador descritivo calculado sobre investimento registrado e votos observados — não representa custo causal para obtenção de voto. Correlação não significa causalidade.
            {r.source && <> Fonte: <a href={r.source.source_url} className="underline hover:text-fg-2" rel="noreferrer" target="_blank">arquivo oficial do TSE</a>.</>}
          </p>
        </>
      )}
    </section>
  );
}

function PeriodSection({ cmp, pa, pb, sp }: { cmp: ReturnType<typeof periodComparison> | null; pa: { from: string; to: string } | null; pb: { from: string; to: string } | null; sp: SP }) {
  return (
    <section aria-label="Comparação temporal" className="space-y-4" data-testid="period-comparison">
      <h2 className="font-[family-name:var(--font-display)] text-[20px] font-semibold text-fg">Comparação entre períodos</h2>
      <form method="get" className="flex flex-wrap items-end gap-3 text-[12px] text-fg-3">
        {Object.entries(sp).filter(([k]) => !k.startsWith("pa_") && !k.startsWith("pb_")).map(([k, v]) => <input key={k} type="hidden" name={k} value={v ?? ""} />)}
        <fieldset className="flex items-center gap-1.5"><legend className="mb-1">Período base</legend><input type="date" name="pa_de" defaultValue={pa?.from} className={sel} aria-label="Base: de" />–<input type="date" name="pa_ate" defaultValue={pa?.to} className={sel} aria-label="Base: até" /></fieldset>
        <fieldset className="flex items-center gap-1.5"><legend className="mb-1">Período atual</legend><input type="date" name="pb_de" defaultValue={pb?.from} className={sel} aria-label="Atual: de" />–<input type="date" name="pb_ate" defaultValue={pb?.to} className={sel} aria-label="Atual: até" /></fieldset>
        <button className="h-9 rounded-[8px] bg-elevated px-3 text-[12.5px] text-fg">Comparar</button>
      </form>
      {cmp ? (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <table className="w-full text-[13px] tabular-nums">
            <thead className="bg-surface/60 text-[11px] tracking-[0.04em] text-fg-3 uppercase"><tr><th className="px-3 py-2.5 text-left font-medium">Indicador</th><th className="px-3 py-2.5 text-right font-medium">Base</th><th className="px-3 py-2.5 text-right font-medium">Atual</th><th className="px-3 py-2.5 text-right font-medium">Variação</th></tr></thead>
            <tbody className="divide-y divide-border">
              <tr><td className="px-3 py-2.5">Investimento registrado</td><td className={`${num} px-3 text-right`}>{fmtBRL(cmp.a.totalCents)}</td><td className={`${num} px-3 text-right`}>{fmtBRL(cmp.b.totalCents)}</td><td className={`${num} px-3 text-right`}>{signed(cmp.cents.abs, (n) => fmtBRL(n))} ({relPct(cmp.cents.rel)})</td></tr>
              <tr><td className="px-3 py-2.5">Ações com ocorrência</td><td className={`${num} px-3 text-right`}>{cmp.a.actions}</td><td className={`${num} px-3 text-right`}>{cmp.b.actions}</td><td className={`${num} px-3 text-right`}>{signed(cmp.actions.abs, (n) => fmtInt(n))}</td></tr>
              <tr><td className="px-3 py-2.5">Média por ação</td><td className={`${num} px-3 text-right`}>{fmtBRL(cmp.a.avgPerActionCents === null ? null : Math.round(cmp.a.avgPerActionCents))}</td><td className={`${num} px-3 text-right`}>{fmtBRL(cmp.b.avgPerActionCents === null ? null : Math.round(cmp.b.avgPerActionCents))}</td><td className={`${num} px-3 text-right`}>{relPct(cmp.perAction.rel)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[12.5px] text-fg-3">Escolha dois períodos para comparar o investimento registrado. Para resultados eleitorais, use a base de comparação em “Resultado observado”.</p>
      )}
      <p className="text-[11.5px] text-fg-3">Comparação descritiva. Não representa causalidade.</p>
    </section>
  );
}
