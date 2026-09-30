import { EditorialTimeline } from "@/components/live/EditorialTimeline";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getOverview } from "@/services/overview";
import { fmtDate, fmtDuration, fmtInt, wallClock } from "@/lib/format";
import { NatureBadge, Panel } from "@/components/ui/primitives";
import { Notice, StateView } from "@/components/ui/states";
import { ConversationChart, type Annotation } from "@/components/charts/ConversationChart";
import { EventList } from "@/components/debate/EventList";
import { NowBlock } from "@/components/overview/NowBlock";
import { MentionList, PlatformList, TopicMomentumList } from "@/components/overview/Modules";
import { MapExplorer } from "@/components/map/MapExplorer";
import { AutoRefresh } from "@/components/shell/AutoRefresh";
import { TOPIC_LABEL } from "@/domain/labels";

const KIND: Record<string, Annotation["kind"]> = { social_spike: "spike", topic_shift: "topic", mention: "mention", reply_chain: "mention", fact_check_flag: "flag" };

export async function OverviewPage() {
  const o = await getOverview();
  if (!o) {
    return (
      <div className="px-4 py-10 md:px-8">
        <StateView state="empty" title="Nenhum evento monitorado">Quando um debate for agendado, ele aparecerá aqui.</StateView>
      </div>
    );
  }
  const { s } = o;
  const { debate } = s;
  const annotations: Annotation[] = s.events.map((e) => ({
    t: e.startOffset,
    code: e.code,
    kind: KIND[e.kind],
    label: e.kind === "social_spike" ? `Pico · ${TOPIC_LABEL[e.topic]}` : e.kind === "topic_shift" ? TOPIC_LABEL[e.topic] : e.kind === "fact_check_flag" ? "Dado citado" : e.title.split(" ").slice(0, 1).join(" ") + " → " + (s.participants.find((p) => p.id === e.candidateIds[1])?.name.split(" ")[0] ?? ""),
  }));
  const mentionTotal = Object.values(s.social.mentions).reduce((a, b) => a + b, 0);
  // Sem métricas sociais = NÃO COLETADO (nunca exibido como zero).
  const socialCollected = s.social.series.length > 0;
  const ended = debate.status === "ended";
  const notCollected = (
    <StateView state="provider_unavailable" title="Repercussão não coletada" compact>
      Nenhum provider de redes sociais está configurado para este debate. Os valores não são zero — não foram coletados.
    </StateView>
  );

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh enabled={s.isLive} />

      {/* Cabeçalho do evento */}
      <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">
            {debate.broadcaster} · {debate.officeLabel} · {debate.round}º turno · {fmtDate(debate.startsAt)}
          </p>
          <h1 className="mt-2 font-display text-[40px] leading-[0.95] font-bold tracking-[-0.02em] text-fg uppercase md:text-[64px]">{debate.title}</h1>
        </div>
        <dl className="flex gap-6 text-right">
          {[
            [ended ? "Situação" : "Em andamento", ended ? "Encerrado" : fmtDuration(s.offset)],
            ["Falas", fmtInt(s.segments.length)],
            ["Temas", String(s.topics.length)],
            ["Eventos", String(s.events.length)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="eyebrow">{k}</dt>
              <dd className="mt-1 font-display text-[22px] leading-none font-semibold tnum">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* 01 — Agora */}
      <section className="py-8" aria-label="O que está acontecendo agora">
        {o.now ? <NowBlock data={o.now} startsAt={debate.startsAt} debateId={debate.id} ended={ended} /> : <StateView state="processing" compact>Aguardando as primeiras falas.</StateView>}
      </section>

      {/* 02 — Conversa (protagonista) */}
      <Panel
        index="01"
        title="Conversa ao longo do debate"
        question="Publicações por minuto em todas as plataformas, com os temas em debate e os eventos detectados."
        nature="collected"
        actions={
          <Link href="/social" className="flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
            Repercussão <ArrowUpRight size={12} aria-hidden />
          </Link>
        }
      >
        {socialCollected ? (
          <ConversationChart series={s.social.series} startsAt={debate.startsAt} domainEnd={s.totalEnd} now={s.isLive ? s.offset : undefined} runs={s.timeline} annotations={annotations} height={330} />
        ) : s.speechTimeline.kind === "value" ? (
          <>
            <p className="mb-2 text-[12px] text-fg-3">Repercussão não coletada — exibindo o volume de FALA (palavras por minuto) da transcrição.</p>
            <ConversationChart series={s.speechTimeline.value.map((b) => ({ t: b.start, v: b.words }))} startsAt={debate.startsAt} domainEnd={s.totalEnd} runs={s.timeline} annotations={annotations} height={330} />
          </>
        ) : (
          <StateView state="no_data" title="Sem série temporal" compact>
            A repercussão não foi coletada e a transcrição não informa horários ({s.timing.untimed} de {s.timing.total} falas sem marcação de tempo). Nenhum horário foi estimado.
          </StateView>
        )}
        {o.editorial.length > 0 && (
          <div className="mt-4" data-testid="overview-editorial-markers">
            <p className="mb-1 text-[12px] text-fg-3">Marcadores da cobertura editorial (g1 · atualização editorial, horário informado pela fonte) — clique para ver o registro original.</p>
            <EditorialTimeline items={o.editorial} names={o.editorialNames} />
          </div>
        )}
        <p className="mt-2 text-[11.5px] text-fg-3">Faixa inferior: tema da fala em cada momento. Marcadores: eventos detectados. Proximidade temporal entre evento e volume não indica causalidade.</p>
      </Panel>

      {/* 03 — Assuntos · Plataformas · Nomes */}
      <div className="mt-10 grid gap-x-10 gap-y-10 lg:grid-cols-3">
        <Panel index="02" title="Assuntos em movimento" question="Publicações por tema nos últimos 15 min, comparadas aos 15 anteriores.">
          {socialCollected ? <TopicMomentumList items={o.momentum} startsAt={debate.startsAt} /> : notCollected}
        </Panel>
        <Panel index="03" title="Onde a conversa está" question="Participação de cada plataforma no volume. Acessos às APIs diferem.">
          {socialCollected ? <PlatformList items={o.platforms} total={s.social.total} /> : notCollected}
        </Panel>
        <Panel index="04" title="Nomes mais citados" question="Menções nominais em publicações, na ordem de púlpito.">
          {socialCollected ? (
            <>
              <MentionList items={s.participants.map((p) => ({ id: p.id, name: p.name, party: p.party?.acronym ?? "", color: p.swatch, count: s.social.mentions[p.id] ?? 0 }))} />
              <p className="mt-4 text-[11.5px] text-fg-3">Menções não indicam apoio, rejeição ou preferência. Total: {fmtInt(mentionTotal)}.</p>
            </>
          ) : (
            notCollected
          )}
        </Panel>
      </div>

      {/* 04 — Mapa · Eventos */}
      <div className="mt-10 grid gap-x-10 gap-y-10 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          index="05"
          title="Onde a conversa acontece"
          question="Candidato mais mencionado por estado, em publicações com localização inferida."
          actions={
            <Link href="/map" className="flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
              Abrir mapa <ArrowUpRight size={12} aria-hidden />
            </Link>
          }
        >
          {o.map ? <MapExplorer {...o.map} compact initialLayer="candidato" /> : <StateView state="provider_unavailable" compact>Dados geográficos indisponíveis.</StateView>}
        </Panel>
        <Panel index="06" title="Eventos recentes" question="Acontecimentos detectados a partir das falas e do volume social." nature="analysis">
          {s.events.length ? <EventList events={s.events} startsAt={debate.startsAt} debateId={debate.id} limit={7} dense /> : <StateView state="empty" compact>Nenhum evento detectado ainda.</StateView>}
          <Link href={`/debates/${debate.id}/analytics#eventos`} className="mt-3 inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
            Linha do tempo completa <ArrowUpRight size={12} aria-hidden />
          </Link>
        </Panel>
      </div>

      {s.isLive && s.offset < s.totalEnd * 0.98 && (
        <Notice state="partial" className="mt-10">
          Dados parciais até {wallClock(debate.startsAt, s.offset)} (horário de Brasília). A página atualiza a cada 30 s.
        </Notice>
      )}
      <p className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-fg-3">
        <NatureBadge nature="official" compact /> <NatureBadge nature="collected" compact /> <NatureBadge nature="ai" compact /> <NatureBadge nature="analysis" compact />
        Cada bloco indica a natureza do dado. <Link href="/methodology#natureza" className="underline decoration-border-strong underline-offset-2 hover:text-fg-2">Como ler</Link>
      </p>
    </div>
  );
}
