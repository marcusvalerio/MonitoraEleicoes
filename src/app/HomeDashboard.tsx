import Link from "next/link";
import { ArrowUpRight, ClipboardList, Flag, Landmark, MessagesSquare, Users } from "lucide-react";
import { intelSql } from "@/services/intelligence";
import { getBoundaries } from "@/services/geo";
import { electionsSummary } from "@/analytics/elections";
import { COUNT_STATE_LABEL, countByUf, countView } from "@/analytics/apuracao";
import { highlights, homeCounts, type Highlight } from "@/analytics/home";
import { kpis, series } from "@/analytics/social-listening";
import { operationsStatus } from "@/analytics/operations";
import { DEFAULT_FILTER } from "@/domain/filters";
import { Panel, Tag } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { CountSummary } from "@/components/intel/CountSummary";
import { ElectionMap } from "@/components/intel/ElectionMap";
import { SeriesChart } from "@/components/intel/SeriesChart";
import { OpsBoard } from "@/components/intel/OpsBoard";
import { PLATFORM_COLOR, SERIES } from "@/components/intel/palette";
import { fmtDateTime, fmtInt } from "@/lib/format";

const YEAR = 2026 as const;
const KIND: Record<Highlight["kind"], { label: string; group: string; tone: "info" | "neutral" | "warn" | "pos" }> = {
  tse: { label: "TSE", group: "Dado oficial", tone: "pos" },
  g1: { label: "g1", group: "Cobertura", tone: "info" },
  pesquisa: { label: "TSE · Pesquisas", group: "Registro oficial", tone: "neutral" },
  redes: { label: "Redes", group: "Conversação", tone: "warn" },
};
const PLATFORM: Record<string, string> = { youtube: "YouTube", x: "X", facebook: "Facebook", instagram: "Instagram" };

/** VISÃO GERAL — só dados reais com fonte e horário; cada bloco mostra seu estado quando não há dado. */
export async function HomeDashboard() {
  const sql = await intelSql();
  if (!sql)
    return (
      <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-8 md:px-6">
        <Hero />
        <StateView state="provider_unavailable" title="Fonte indisponível neste ambiente">
          A base de dados oficial (TSE) não está disponível aqui. Nenhum número é exibido — nem estimado. Consulte <Link className="underline" href="/fontes">Fontes</Link>.
        </StateView>
      </div>
    );
  const f24 = { ...DEFAULT_FILTER, year: YEAR, period: { preset: "24h" as const } };
  const [counts, br, byUf, hl, cycles, social, soc, ops, boundaries] = await Promise.all([
    homeCounts(sql, YEAR),
    countView(sql, { year: YEAR, round: 1, officeId: 1, territoryId: 0 }),
    countByUf(sql, { year: YEAR, round: 1, officeId: 1 }),
    highlights(sql, 8),
    electionsSummary(sql),
    series(sql, f24, "hour", "platform"),
    kpis(sql, f24),
    operationsStatus(sql),
    getBoundaries("uf"),
  ]);
  const s = br.snapshot;
  const started = br.state === "em_apuracao" || br.state === "parcial" || br.state === "totalizada";
  const top = started ? br.candidates.filter((c) => c.votes.status === "value").slice(0, 6) : [];
  const ents = top.map((c, i) => ({ id: String(c.candidacyId ?? c.sqCandidato), name: c.name, color: SERIES[i] ?? "#68686e", partyAcronym: c.party ?? "" }));

  return (
    <div className="mx-auto max-w-[1280px] space-y-8 px-4 py-6 md:px-6 md:py-8">
      <Hero />

      <nav aria-label="Módulos" className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border md:grid-cols-5" data-testid="home-modules">
        {[
          { href: `/eleicoes?ano=${YEAR}`, icon: Landmark, label: "Apuração", value: COUNT_STATE_LABEL[br.state], sub: "TSE · Presidente · Brasil" },
          { href: "/candidatos", icon: Users, label: "Candidatos", value: fmtInt(counts.candidacies), sub: "candidaturas registradas em 2026" },
          { href: "/partidos", icon: Flag, label: "Partidos", value: fmtInt(counts.parties), sub: "registrados em 2026" },
          { href: "/monitoramento", icon: MessagesSquare, label: "Redes", value: counts.social_sources ? `${counts.social_sources} conectada(s)` : "Não configuradas", sub: "fontes de conversação" },
          { href: "/pesquisas", icon: ClipboardList, label: "Pesquisas", value: fmtInt(counts.polls), sub: "registradas no TSE em 2026" },
        ].map((m) => (
          <Link key={m.href} href={m.href} className="group bg-surface p-3.5 transition-colors hover:bg-elevated">
            <p className="flex items-center gap-1.5 text-[11px] tracking-[0.08em] text-fg-3 uppercase">
              <m.icon size={12} aria-hidden /> {m.label}
              <ArrowUpRight size={12} className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </p>
            <p className="mt-1.5 font-display text-[20px] leading-tight font-semibold text-fg tnum">{m.value}</p>
            <p className="mt-0.5 text-[11.5px] text-fg-3">{m.sub}</p>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="apuracao" className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <Panel title="Apuração agora" question={s ? `Presidente · Brasil · arquivo do TSE gerado em ${fmtDateTime(s.generatedAt)} · coletado em ${fmtDateTime(s.collectedAt)}` : "Presidente · Brasil"}>
          <CountSummary view={br} />
          <p className="mt-3 text-[11px] text-fg-3">Fonte: TSE · sistema oficial de divulgação de resultados. <Link className="text-fg-2 hover:text-fg" href="/eleicoes?ano=2026">Ver apuração completa →</Link></p>
        </Panel>
        <Panel title="Brasil" question={started ? "Mais votado por UF (Presidente)" : "Estado da apuração por UF"}>
          <ElectionMap
            boundaries={boundaries}
            entities={ents}
            rows={byUf.map((u) => {
              const e = ents.find((x) => x.name === u.leader?.name);
              return { uf: u.uf, leader: u.leader && e ? { id: e.id, name: u.leader.name, party: e.partyAcronym, votes: u.leader.votes, share: u.leader.pct === null ? null : u.leader.pct / 100 } : null, note: COUNT_STATE_LABEL[u.state] };
            })}
            title="Mapa do Brasil: apuração presidencial por UF"
          />
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <Panel title="Conversa ao longo do tempo" question="Publicações coletadas nas fontes conectadas · últimas 24 h · volume não indica intenção de voto">
          {soc.collected ? (
            <SeriesChart points={social} labels={PLATFORM} colors={PLATFORM_COLOR} bucket="hour" height={200} />
          ) : (
            <p className="rounded-[var(--radius-sm)] border border-dashed border-border p-4 text-[12.5px] text-fg-3" data-testid="home-social-empty">
              Não coletado: {counts.social_sources ? "nenhuma janela coletada nas últimas 24 h." : "nenhuma rede social configurada (X e YouTube exigem credenciais de API; Facebook exige autorização da Meta)."} Nenhum volume é estimado.
            </p>
          )}
        </Panel>
        <Panel title="Destaques" question="Mais recentes, separados por tipo de evidência">
          {hl.length === 0 ? (
            <p className="text-[12.5px] text-fg-3">Nada coletado ainda.</p>
          ) : (
            <ol className="space-y-3" data-testid="home-highlights">
              {hl.map((h, i) => (
                <li key={i} className="border-l-2 pl-3" style={{ borderColor: h.kind === "tse" ? "var(--color-pos)" : h.kind === "g1" ? "var(--color-info)" : h.kind === "redes" ? "var(--color-warn)" : "var(--color-border-strong)" }}>
                  <p className="flex items-center gap-2 text-[11px] text-fg-3">
                    <Tag tone={KIND[h.kind].tone}>{KIND[h.kind].label}</Tag>
                    <span>{KIND[h.kind].group}</span>
                    <span className="ml-auto tnum">{h.at ? fmtDateTime(h.at) : "horário não informado"}</span>
                  </p>
                  {h.href ? <Link href={h.href} className="mt-1 line-clamp-2 block text-[13px] text-fg hover:underline">{h.title}</Link> : <p className="mt-1 text-[13px] text-fg">{h.title}</p>}
                  {h.detail && <p className="text-[11.5px] text-fg-3">{h.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </section>

      <section aria-label="Histórico">
        <h2 className="mb-2 text-[11px] font-medium tracking-[0.08em] text-fg-3 uppercase">Histórico eleitoral</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border md:grid-cols-4" data-testid="home-history">
          {[...cycles].sort((a, b) => a.year - b.year).map((e) => (
            <Link key={e.year} href={`/eleicoes?ano=${e.year}`} className="bg-surface p-3.5 transition-colors hover:bg-elevated">
              <p className="font-display text-[24px] leading-none font-semibold text-fg tnum">{e.year}</p>
              <p className="mt-1.5 text-[11.5px] text-fg-3">{fmtInt(e.candidacies)} candidaturas · {e.resultRows ? "resultados oficiais" : "resultados não publicados"}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Estado das fontes">
        <h2 className="mb-2 text-[11px] font-medium tracking-[0.08em] text-fg-3 uppercase">Estado das fontes</h2>
        <OpsBoard rows={ops} showErrors={false} />
      </section>
    </div>
  );
}

function Hero() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
      <div>
        <p className="text-[11px] font-medium tracking-[0.12em] text-fg-3 uppercase">Brasil · Eleições {YEAR}</p>
        <h1 className="mt-1 font-display text-[30px] leading-tight font-semibold tracking-tight text-fg md:text-[36px]">O que está acontecendo, onde e com qual fonte.</h1>
      </div>
      <p className="max-w-sm text-[12.5px] text-fg-3">Dados oficiais do TSE, cobertura editorial e conversação pública — sempre separados, com horário e origem.</p>
    </header>
  );
}
