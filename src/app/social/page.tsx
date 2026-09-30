import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getOverview } from "@/services/overview";
import { fmtCompact, fmtInt } from "@/lib/format";
import { Panel, PageHeader } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { ConversationChart, type Annotation } from "@/components/charts/ConversationChart";
import { TopicSmallMultiples } from "@/components/charts/SmallMultiples";
import { MentionList, PlatformList } from "@/components/overview/Modules";
import { EventList } from "@/components/debate/EventList";
import { MapExplorer } from "@/components/map/MapExplorer";
import { TOPIC_LABEL } from "@/domain/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Repercussão" };

export default async function SocialPage() {
  const o = await getOverview();
  if (!o) return <div className="px-4 py-10"><StateView state="empty">Nenhum evento com repercussão monitorada.</StateView></div>;
  const { s } = o;
  const spikes = s.events.filter((e) => e.kind === "social_spike");
  const mentionTotal = Object.values(s.social.mentions).reduce((a, b) => a + b, 0);
  const annotations: Annotation[] = s.events
    .filter((e) => e.kind === "social_spike" || e.kind === "topic_shift")
    .map((e) => ({ t: e.startOffset, code: e.code, kind: e.kind === "social_spike" ? "spike" : "topic", label: e.kind === "social_spike" ? `Pico · ${TOPIC_LABEL[e.topic]}` : TOPIC_LABEL[e.topic] }));

  return (
    <div className="mx-auto max-w-[1480px] space-y-10 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        eyebrow="Acompanhar · Repercussão"
        title="O que está sendo discutido"
        description="Volume e comportamento da conversa pública sobre o debate. Não medimos popularidade nem indicamos quem está “ganhando”."
        meta={
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            {[
              ["Publicações", fmtCompact(s.social.total)],
              ["Plataformas", `${s.social.byPlatform.length} de ${s.social.platforms.length}`],
              ["Menções a candidatos", fmtCompact(mentionTotal)],
              ["Picos de volume", String(spikes.length)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-1 font-display text-[22px] leading-none font-semibold tnum">{v}</dd>
              </div>
            ))}
          </dl>
        }
      />

      <Panel index="01" title="Volume ao longo do debate" question="Publicações por minuto, com temas e picos marcados. Associação temporal não indica causalidade." nature="collected">
        <ConversationChart series={s.social.series} startsAt={s.debate.startsAt} domainEnd={s.totalEnd} now={s.isLive ? s.offset : undefined} runs={s.timeline} annotations={annotations} height={300} />
      </Panel>

      <Panel index="02" title="Temas na conversa" question="Como o volume de cada tema evoluiu? Mesma escala para comparação direta." nature="ai">
        <TopicSmallMultiples items={o.allTopics} startsAt={s.debate.startsAt} domainEnd={s.offset} />
      </Panel>

      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-2">
        <Panel index="03" title="Onde a conversa está" question="Participação por plataforma. Os níveis de acesso às APIs diferem — não compare como amostra da população." nature="collected">
          <PlatformList items={o.platforms} total={s.social.total} />
          <Link href="/sources" className="mt-3 inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
            Limitações por plataforma <ArrowUpRight size={12} aria-hidden />
          </Link>
        </Panel>
        <Panel index="04" title="Nomes mais citados" question="Menções nominais, na ordem de púlpito." nature="collected">
          <MentionList items={s.participants.map((p) => ({ id: p.id, name: p.name, party: p.party?.acronym ?? "", color: p.swatch, count: s.social.mentions[p.id] ?? 0 }))} />
          <p className="mt-4 text-[11.5px] text-fg-3">Menções não indicam apoio, rejeição ou preferência. Total de {fmtInt(mentionTotal)}.</p>
        </Panel>
      </div>

      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          index="05"
          title="Onde está crescendo"
          question="Variação do volume nos últimos 15 min por estado."
          actions={
            <Link href="/map?camada=tendencia" className="flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
              Abrir mapa <ArrowUpRight size={12} aria-hidden />
            </Link>
          }
        >
          {o.map ? <MapExplorer {...o.map} compact initialLayer="tendencia" /> : <StateView state="provider_unavailable" compact />}
        </Panel>
        <Panel index="06" title="Picos de volume" question="Quando a conversa se intensificou e o que ocorria no debate." nature="analysis">
          {spikes.length ? <EventList events={spikes} startsAt={s.debate.startsAt} debateId={s.debate.id} newestFirst={false} /> : <StateView state="empty" compact>Nenhum pico detectado ainda.</StateView>}
        </Panel>
      </div>
    </div>
  );
}
