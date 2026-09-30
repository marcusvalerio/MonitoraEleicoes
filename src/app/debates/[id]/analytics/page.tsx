import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Radio } from "lucide-react";
import { getDebateSnapshot } from "@/services/debates";
import { SPEECH_GROUPS, TOPIC_LABEL } from "@/domain/labels";
import type { TopicId } from "@/domain/types";
import { TOPICS } from "@/domain/types";
import { fmtDuration, fmtInt, fmtPct, wallClock } from "@/lib/format";
import { Avatar, ButtonLink, Kpi, KpiStrip, NatureBadge, PageHeader, Panel } from "@/components/ui/primitives";
import { Notice, StateView } from "@/components/ui/states";
import { BarList } from "@/components/charts/BarList";
import { Heatmap } from "@/components/charts/Heatmap";
import { StackedBars } from "@/components/charts/StackedBars";
import { InteractionMap } from "@/components/charts/InteractionMap";
import { ConversationChart } from "@/components/charts/ConversationChart";
import { EventList } from "@/components/debate/EventList";
import { AutoRefresh } from "@/components/shell/AutoRefresh";
import { emptyComposition } from "@/analytics/debate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Análise do debate" };

const GROUP_COLORS = ["var(--color-grp-1)", "var(--color-grp-2)", "var(--color-grp-3)", "var(--color-grp-4)", "var(--color-grp-5)"];

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tema?: string }> }) {
  const { id } = await params;
  const { tema } = await searchParams;
  const s = await getDebateSnapshot(id);
  if (!s) notFound();
  const { debate } = s;
  const highlight = TOPICS.includes(tema as TopicId) ? (tema as TopicId) : null;

  if (!s.segments.length) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-6">
        <PageHeader eyebrow="Debate · Análise" title={debate.title} />
        <StateView state={debate.status === "scheduled" ? "empty" : "no_data"} className="mt-8">
          {debate.status === "scheduled" ? "O debate ainda não começou." : "Não há transcrição disponível para este debate."}
        </StateView>
      </div>
    );
  }

  const cand = s.segments.filter((x) => x.speakerId !== s.moderatorId);
  const analyzed = s.segments.reduce((a, x) => a + (x.endOffset - x.startOffset), 0);
  const count = (f: (t: string) => boolean) => s.classifications.filter((c) => f(c.speechType)).length;
  const mentionsTotal = s.classifications.reduce((a, c) => a + c.mentions.length, 0);
  const keys = SPEECH_GROUPS.map((g, i) => ({ id: g.id, label: g.label, color: GROUP_COLORS[i] }));
  const overall = emptyComposition();
  for (const c of Object.values(s.composition)) for (const k of Object.keys(c) as (keyof typeof c)[]) overall[k] += c[k];
  const segmentText = Object.fromEntries(
    s.segments.map((x) => [x.id, { speaker: s.participants.find((p) => p.id === x.speakerId)?.name ?? "Moderação", text: x.text, time: wallClock(debate.startsAt, x.startOffset) }]),
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 md:px-6 md:py-6">
      <AutoRefresh enabled={s.isLive} seconds={45} />
      <PageHeader
        eyebrow={
          <>
            <Link href={`/debates/${debate.id}`} className="hover:text-fg-2">Debate</Link> <span>/</span> <span>Análise</span>
          </>
        }
        title={debate.title}
        description="Distribuição de temas, participação e interações. Contagens descrevem o que ocorreu — nenhuma métrica avalia desempenho ou indica vencedor."
        actions={
          s.isLive ? (
            <ButtonLink href={`/debates/${debate.id}/live`}>
              <Radio size={14} aria-hidden /> Ao vivo
            </ButtonLink>
          ) : undefined
        }
      />
      {s.isLive && (
        <Notice state="partial">
          Dados parciais: recorte de {wallClock(debate.startsAt, 0, false)} a {wallClock(debate.startsAt, s.offset, false)} ({fmtPct(s.offset / s.totalEnd)} da duração prevista). Os números mudam enquanto o debate acontece.
        </Notice>
      )}

      <nav aria-label="Seções" className="-mx-1 flex gap-1 overflow-x-auto text-[12px]">
        {[
          ["temas", "Temas"],
          ["candidatos", "Participação"],
          ["composicao", "Composição"],
          ["interacoes", "Interações"],
          ["eventos", "Eventos × Repercussão"],
        ].map(([h, l]) => (
          <a key={h} href={`#${h}`} className="rounded-[var(--radius-md)] px-2.5 py-1.5 whitespace-nowrap text-fg-3 hover:bg-surface hover:text-fg">
            {l}
          </a>
        ))}
      </nav>

      <KpiStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Falas" value={s.segments.length} hint={`${cand.length} de candidatos`} question="Quantos segmentos foram analisados?" />
        <Kpi label="Tempo analisado" value={fmtDuration(analyzed)} question="Quanto do debate está coberto?" />
        <Kpi label="Temas" value={s.topics.length} hint={`de ${TOPICS.length - 1} possíveis`} question="Quantos temas apareceram?" />
        <Kpi label="Propostas" value={count((t) => t === "proposta" || t === "promessa")} question="Quantas falas trazem proposta/promessa?" />
        <Kpi label="Perguntas" value={count((t) => t === "pergunta")} question="Quantas perguntas foram feitas entre candidatos?" />
        <Kpi label="Menções" value={mentionsTotal} hint="nominais entre candidatos" question="Quantas vezes um candidato citou outro?" />
      </KpiStrip>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <Panel index="01" id="temas" title="Frequência de temas" question="Quantas falas de candidatos abordaram cada tema?" nature="ai">
          <BarList items={s.topics.map((t) => ({ id: t.topic, label: TOPIC_LABEL[t.topic], value: t.segments, secondary: fmtPct(t.share), highlighted: t.topic === highlight }))} />
          <p className="mt-3 text-[11.5px] text-fg-3">Percentual sobre {cand.length} falas de candidatos. Falas de moderação e apresentações não entram na contagem.</p>
        </Panel>
        <Panel index="02" title="Intensidade por período" question="Em que momento do debate cada tema ocupou mais tempo de fala?" nature="analysis">
          <Heatmap rows={s.heatmap.topics.map((t) => ({ id: t, label: TOPIC_LABEL[t] }))} grid={s.heatmap.grid} windowSize={s.heatmap.windowSize} startsAt={debate.startsAt} currentWindow={s.isLive ? Math.floor(s.offset / s.heatmap.windowSize) : undefined} />
        </Panel>
      </div>

      <Panel index="03" id="candidatos" title="Participação dos candidatos" question="Quanto cada candidato falou, perguntou, respondeu e mencionou?" nature="analysis" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] font-[family-name:var(--font-data)] text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] text-fg-3">
                <th className="px-4 py-2.5 font-normal">Candidato</th>
                {["Tempo de fala", "Intervenções", "Perguntas feitas", "Perguntas recebidas", "Respostas", "Menções feitas", "Menções recebidas"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-right font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.participants.map((p) => {
                const a = s.activity.find((x) => x.candidateId === p.id)!;
                return (
                  <tr key={p.id} id={`candidato-${p.id}`} className="scroll-mt-20 border-b border-border last:border-0 target:bg-elevated hover:bg-elevated/50">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <Avatar initials={p.initials} color={p.swatch} size={22} />
                        <span className="text-fg">{p.name}</span>
                        <span className="text-fg-3">{p.party?.acronym}</span>
                      </span>
                    </td>
                    {[fmtDuration(a.speakingSeconds), a.interventions, a.questionsAsked, a.questionsReceived, a.answers, a.mentionsMade, a.mentionsReceived].map((v, i) => (
                      <td key={i} className="px-3 py-2.5 text-right text-fg tnum">{typeof v === "number" ? fmtInt(v) : v}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-2.5 text-[11.5px] text-fg-3">Ordem fixa dos participantes (púlpito), não ranking. Tempo de fala depende das regras da emissora.</p>
      </Panel>

      <Panel index="04" id="composicao" title="Composição das falas" question="Que tipo de fala cada candidato usou? (classificação automática)" nature="ai">
        <StackedBars
          keys={keys}
          rows={[
            ...s.participants.map((p) => ({ id: p.id, label: p.name, values: s.composition[p.id] })),
            { id: "all", label: "Todos", values: overall },
          ]}
        />
        <p className="mt-3 text-[11.5px] text-fg-3">
          Propostas = proposta + promessa · Críticas = crítica + ataque + contraponto · Respostas = resposta + defesa · Informações = informação + comparação. Detalhe por fala na <Link href={`/debates/${debate.id}/live`} className="underline decoration-border-strong underline-offset-2 hover:text-fg-2">transcrição</Link>.
        </p>
      </Panel>

      <Panel index="05" id="interacoes" title="Mapa de interações" question="Quem mencionou, perguntou ou respondeu a quem?" nature="analysis">
        <InteractionMap nodes={s.participants.map((p) => ({ id: p.id, label: p.name, initials: p.initials, color: p.swatch }))} edges={s.interactions} segmentText={segmentText} />
      </Panel>

      <Panel index="06" id="eventos" title="Debate → Evento → Repercussão" question="O que aconteceu no debate e como o volume de publicações se comportou no mesmo período?" nature="analysis">
        <ConversationChart
          series={s.social.series}
          startsAt={debate.startsAt}
          domainEnd={s.totalEnd}
          now={s.isLive ? s.offset : undefined}
          runs={s.timeline}
          annotations={s.events.filter((e) => e.kind === "social_spike" || e.kind === "fact_check_flag").map((e) => ({ t: e.startOffset, code: e.code, kind: e.kind === "social_spike" ? ("spike" as const) : ("flag" as const), label: e.kind === "social_spike" ? `Pico · ${TOPIC_LABEL[e.topic]}` : "Dado citado" }))}
          height={280}
        />
        <p className="mt-1 mb-4 flex items-center gap-2 text-[11.5px] text-fg-3">
          <NatureBadge nature="collected" compact /> Publicações/min. Faixa inferior = tema em debate. Traços no topo = eventos. Proximidade temporal não indica causalidade.
        </p>
        <div className="max-h-[560px] overflow-y-auto pr-1">
          <EventList events={s.events} startsAt={debate.startsAt} debateId={debate.id} newestFirst={false} />
        </div>
      </Panel>
    </div>
  );
}
