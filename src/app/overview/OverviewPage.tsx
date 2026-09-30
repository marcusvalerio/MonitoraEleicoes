import Link from "next/link";
import { ArrowRight, Radio, BarChart3 } from "lucide-react";
import { getCurrentDebate, getDebateSnapshot } from "@/services/debates";
import { TOPIC_LABEL } from "@/domain/labels";
import { fmtCompact, fmtDate, fmtDuration, fmtInt, fmtPct, wallClock } from "@/lib/format";
import { Avatar, ButtonLink, DemoBadge, Kpi, KpiStrip, LiveDot, NatureBadge, Panel } from "@/components/ui/primitives";
import { StateView, Notice } from "@/components/ui/states";
import { BarList } from "@/components/charts/BarList";
import { VolumeChart } from "@/components/charts/VolumeChart";
import { EventList } from "@/components/debate/EventList";
import { ClassificationTags } from "@/components/debate/tags";
import { NatureLegend } from "@/components/debate/NatureLegend";
import { AutoRefresh } from "@/components/shell/AutoRefresh";
import { MODERATOR_ID } from "@/data/demo/entities";

export async function OverviewPage() {
  const current = await getCurrentDebate();
  if (!current) {
    return (
      <div className="px-4 py-10 md:px-6">
        <StateView state="empty" title="Nenhum evento monitorado">Quando um debate for agendado, ele aparecerá aqui.</StateView>
      </div>
    );
  }
  const s = await getDebateSnapshot(current.id);
  if (!s) return null;
  const { debate } = s;
  const speakerSegs = s.segments.filter((x) => x.speakerId !== MODERATOR_ID);
  const analyzedSeconds = s.segments.reduce((a, x) => a + (x.endOffset - x.startOffset), 0);
  const proposals = s.classifications.filter((c) => c.speechType === "proposta" || c.speechType === "promessa").length;
  const last = [...speakerSegs].reverse()[0];
  const lastCls = last ? s.classifications.find((c) => c.segmentId === last.id) : undefined;
  const lastSpeaker = last ? s.participants.find((p) => p.id === last.speakerId) : undefined;
  const connectedSources = s.sources.filter((x) => x.status !== "unavailable" && x.status !== "pending").length;

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 md:px-6 md:py-6">
      <AutoRefresh enabled={s.isLive} />

      {/* HERO — evento atual */}
      <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
        <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative grid gap-6 p-5 md:p-7 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">Evento atual</span>
                {s.isLive && <LiveDot label={s.mode === "demo" ? "AO VIVO · REPLAY DEMO" : "AO VIVO"} />}
                {s.mode === "demo" && <DemoBadge />}
              </div>
              <h1 className="mt-3 font-display text-[34px] leading-[1.02] font-bold tracking-tight text-fg uppercase md:text-[48px]">{debate.title}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-2">
                <span className="font-display text-[15px] font-semibold tracking-wide text-fg tnum">{fmtDate(debate.startsAt)}</span>
                <span className="text-fg-3">·</span>
                <span>{debate.broadcaster}</span>
                <span className="text-fg-3">·</span>
                <span>{debate.officeLabel} · {debate.round}º turno</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href={`/debates/${debate.id}/live`} variant="primary">
                <Radio size={14} aria-hidden /> Acompanhar ao vivo
              </ButtonLink>
              <ButtonLink href={`/debates/${debate.id}/analytics`}>
                <BarChart3 size={14} aria-hidden /> Análise do debate
              </ButtonLink>
              <span className="ml-1 text-[12px] text-fg-3 tnum">
                {wallClock(debate.startsAt, 0, false)} → agora {wallClock(debate.startsAt, s.offset, false)}
              </span>
            </div>
          </div>

          {last && lastSpeaker && lastCls ? (
            <Link href={`/debates/${debate.id}/live?seg=${last.id}`} className="group block rounded-[var(--radius-md)] border border-border bg-bg/70 p-4 transition-colors hover:border-border-strong">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Última fala transcrita</span>
                <span className="font-mono text-[11px] text-fg-3">{wallClock(debate.startsAt, last.startOffset)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <Avatar initials={lastSpeaker.initials} color={lastSpeaker.swatch} size={30} />
                <div>
                  <p className="text-[13px] font-medium text-fg">{lastSpeaker.name}</p>
                  <p className="text-[11.5px] text-fg-3">{lastSpeaker.party?.acronym} · {lastSpeaker.party?.name}</p>
                </div>
              </div>
              <blockquote className="mt-3 line-clamp-4 font-display text-[17px] leading-snug text-fg">“{last.text}”</blockquote>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <ClassificationTags c={lastCls} compact />
                <span className="flex items-center gap-1 text-[11.5px] text-fg-3 group-hover:text-fg-2">
                  Contexto <ArrowRight size={12} aria-hidden />
                </span>
              </div>
            </Link>
          ) : (
            <StateView state="processing" compact>Aguardando as primeiras falas.</StateView>
          )}
        </div>
      </section>

      {/* KPIs — cada um responde a uma pergunta */}
      <KpiStrip className="grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Duração" value={fmtDuration(s.offset)} hint="desde a abertura" question="Há quanto tempo o debate está em andamento?" />
        <Kpi label="Tempo analisado" value={fmtDuration(analyzedSeconds)} hint={`${fmtPct(analyzedSeconds / Math.max(1, s.offset))} do total`} question="Quanto do debate já foi transcrito e classificado?" />
        <Kpi label="Falas" value={fmtInt(s.segments.length)} hint={`${speakerSegs.length} de candidatos`} href={`/debates/${debate.id}/live`} question="Quantos segmentos de fala foram analisados?" />
        <Kpi label="Temas" value={s.topics.length} hint="detectados" href={`/debates/${debate.id}/analytics#temas`} question="Quantos temas diferentes apareceram?" />
        <Kpi label="Propostas" value={proposals} hint="propostas e promessas" href={`/debates/${debate.id}/analytics#composicao`} question="Quantas falas foram classificadas como proposta?" />
        <Kpi label="Eventos" value={s.events.length} hint="detectados" href={`/debates/${debate.id}/analytics#eventos`} question="Quantos acontecimentos relevantes foram registrados?" />
        <Kpi label="Volume social" value={fmtCompact(s.social.total)} hint="publicações" href="/social" question="Quanto se publicou sobre o debate?" />
        <Kpi label="Fontes" value={connectedSources} hint={`de ${s.sources.length} registradas`} href="/sources" question="De onde vêm estes dados?" />
      </KpiStrip>

      {s.mode === "demo" && (
        <Notice state="partial">
          Modo demonstração: transcrição, classificações e repercussão são <strong className="text-fg">fictícias</strong> e reproduzidas em replay. Nenhum dado eleitoral real é exibido.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
        <Panel title="Sobre o que estão falando" question="Participação de cada tema nas falas dos candidatos" nature="ai" actions={<Link href={`/debates/${debate.id}/analytics#temas`} className="text-[12px] text-fg-3 hover:text-fg">Ver tudo</Link>}>
          {s.topics.length ? (
            <BarList items={s.topics.slice(0, 7).map((t) => ({ id: t.topic, label: TOPIC_LABEL[t.topic], value: t.segments, secondary: fmtPct(t.share) }))} />
          ) : (
            <StateView state="no_data" compact />
          )}
        </Panel>
        <Panel title="O que está repercutindo" question="Publicações por minuto em todas as plataformas monitoradas. Traços no topo marcam eventos do debate." nature="collected">
          <VolumeChart series={s.social.series} startsAt={debate.startsAt} markers={s.events.filter((e) => e.kind !== "topic_shift").map((e) => ({ t: e.startOffset, label: e.title, code: e.code }))} domainEnd={s.totalEnd} now={s.offset} />
          <p className="mt-2 text-[11.5px] text-fg-3">Proximidade temporal entre evento e volume não indica causalidade.</p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Panel title="Últimos acontecimentos" question="Eventos detectados automaticamente a partir das falas e do volume social" nature="analysis" actions={<Link href={`/debates/${debate.id}/analytics#eventos`} className="text-[12px] text-fg-3 hover:text-fg">Linha do tempo</Link>}>
          {s.events.length ? <EventList events={s.events} startsAt={debate.startsAt} debateId={debate.id} limit={6} /> : <StateView state="empty" compact>Nenhum evento detectado ainda.</StateView>}
        </Panel>
        <div className="space-y-5">
          <Panel title="Quem está falando" question="Tempo de fala e intervenções — sem avaliação de desempenho" nature="analysis" bodyClassName="p-0">
            <table className="w-full font-[family-name:var(--font-data)] text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-fg-3">
                  <th className="px-4 py-2 font-normal">Participante</th>
                  <th className="px-2 py-2 text-right font-normal">Tempo</th>
                  <th className="px-4 py-2 text-right font-normal">Falas</th>
                </tr>
              </thead>
              <tbody>
                {s.participants.map((p) => {
                  const a = s.activity.find((x) => x.candidateId === p.id)!;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <Avatar initials={p.initials} color={p.swatch} size={20} />
                          <span className="text-fg">{p.name}</span>
                          <span className="text-fg-3">{p.party?.acronym}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-fg tnum">{fmtDuration(a.speakingSeconds)}</td>
                      <td className="px-4 py-2 text-right text-fg-2 tnum">{a.interventions}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
          <Panel title="Como ler os dados" question="Toda informação é identificada pela sua natureza">
            <NatureLegend />
            <p className="mt-3 text-[11.5px] text-fg-3">
              Nenhuma métrica desta plataforma indica quem “venceu” ou é “melhor”. <Link className="text-fg-2 underline decoration-border-strong underline-offset-2 hover:text-fg" href="/methodology">Metodologia</Link>
            </p>
          </Panel>
        </div>
      </div>
      <p className="flex items-center gap-2 pb-2 text-[11px] text-fg-3">
        <NatureBadge nature="analysis" compact /> Snapshot gerado às {wallClock(debate.startsAt, s.offset)} (horário de Brasília). Atualiza automaticamente a cada 30 s.
      </p>
    </div>
  );
}
