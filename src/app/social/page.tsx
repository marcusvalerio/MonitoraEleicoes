import type { Metadata } from "next";
import { getCurrentDebate, getDebateSnapshot } from "@/services/debates";
import { fmtCompact, fmtInt, fmtPct } from "@/lib/format";
import { DemoBadge, Kpi, KpiStrip, PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { Notice, StateView } from "@/components/ui/states";
import { VolumeChart } from "@/components/charts/VolumeChart";
import { BarList } from "@/components/charts/BarList";
import { EventList } from "@/components/debate/EventList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Repercussão" };

export default async function SocialPage() {
  const d = await getCurrentDebate();
  const s = d ? await getDebateSnapshot(d.id) : null;
  if (!s) return <div className="px-4 py-10"><StateView state="empty">Nenhum evento com repercussão monitorada.</StateView></div>;
  const names = Object.fromEntries(s.participants.map((p) => [p.id, p.name]));
  const mentionTotal = Object.values(s.social.mentions).reduce((a, b) => a + b, 0);
  const spikes = s.events.filter((e) => e.kind === "social_spike");
  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow={<>Repercussão <Tag tone="info">Prévia P1</Tag> {s.mode === "demo" && <DemoBadge />}</>} title="O que está sendo discutido" description="Volume e comportamento da conversa pública sobre o debate. Não medimos popularidade nem indicamos quem está “ganhando”." />
      <Notice state="partial">Nesta fase, a repercussão vem do <span className="font-mono">MockSocialProvider</span>. Integrações reais (X, YouTube, TikTok…) serão adapters independentes com limitações de acesso próprias — veja <a className="underline" href="/sources">Fontes</a>.</Notice>
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <Kpi label="Publicações" value={fmtCompact(s.social.total)} hint="todas as plataformas" />
        <Kpi label="Plataformas" value={s.social.byPlatform.length} hint={`de ${s.social.platforms.length} planejadas`} />
        <Kpi label="Menções a candidatos" value={fmtCompact(mentionTotal)} hint="nominais, em publicações" />
        <Kpi label="Picos de volume" value={spikes.length} hint="acima de média + 1,5σ" />
      </KpiStrip>
      <Panel title="Volume ao longo do debate" question="Como o volume de publicações evoluiu minuto a minuto?" nature="collected">
        <VolumeChart series={s.social.series} startsAt={s.debate.startsAt} markers={s.events.map((e) => ({ t: e.startOffset, label: e.title, code: e.code }))} domainEnd={s.totalEnd} now={s.isLive ? s.offset : undefined} height={220} />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Por plataforma" question="Onde o volume foi coletado? (acessos diferentes — não comparar diretamente)" nature="collected">
          <BarList items={s.social.byPlatform.map((p) => ({ id: p.platform, label: s.social.platforms.find((x) => x.id === p.platform)?.name ?? p.platform, value: p.posts, secondary: fmtPct(p.posts / s.social.total) }))} />
        </Panel>
        <Panel title="Candidatos mencionados" question="Quantas publicações citam cada candidato? Menção não indica apoio nem rejeição." nature="collected">
          <BarList items={s.participants.map((p) => ({ id: p.id, label: names[p.id], value: s.social.mentions[p.id] ?? 0, secondary: fmtPct((s.social.mentions[p.id] ?? 0) / Math.max(1, mentionTotal)) }))} />
          <p className="mt-2 text-[11.5px] text-fg-3">Ordem fixa dos participantes. Total de {fmtInt(mentionTotal)} menções.</p>
        </Panel>
      </div>
      <Panel title="Picos de volume" question="Quando a conversa se intensificou e o que acontecia no debate naquele momento?" nature="analysis">
        {spikes.length ? <EventList events={spikes} startsAt={s.debate.startsAt} debateId={s.debate.id} newestFirst={false} /> : <StateView state="empty" compact>Nenhum pico detectado ainda.</StateView>}
      </Panel>
    </div>
  );
}
