import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, Radio } from "lucide-react";
import { getDebateSnapshot } from "@/services/debates";
import { fmtDate, fmtDuration, wallClock } from "@/lib/format";
import { Avatar, ButtonLink, DemoBadge, LiveDot, PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { SOURCE_TYPE_LABEL } from "@/domain/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Debate" };

export default async function DebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getDebateSnapshot(id);
  if (!s) notFound();
  const { debate } = s;
  const hasData = s.segments.length > 0;
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow={
          <>
            <Link href="/debates" className="hover:text-fg-2">Debates</Link> <span>/</span>
            {s.isLive && <LiveDot />}
            {debate.mode === "demo" && <DemoBadge />}
          </>
        }
        title={debate.title}
        description={`${debate.broadcaster} · ${debate.officeLabel} · ${debate.round}º turno · ${fmtDate(debate.startsAt)}, ${wallClock(debate.startsAt, 0, false)}`}
        actions={
          hasData && (
            <>
              {s.isLive && (
                <ButtonLink href={`/debates/${debate.id}/live`} variant="primary">
                  <Radio size={14} aria-hidden /> Ao vivo
                </ButtonLink>
              )}
              <ButtonLink href={`/debates/${debate.id}/analytics`}>
                <BarChart3 size={14} aria-hidden /> Análise
              </ButtonLink>
            </>
          )
        }
      />
      {!hasData && (
        <Panel>
          <StateView state="no_data" title="Transcrição não disponível">
            Este debate está registrado, mas nenhuma transcrição foi importada. Ele não será analisado até que uma fonte de transcrição seja conectada.
          </StateView>
        </Panel>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Participantes" question="Ordem de púlpito">
          <ul className="space-y-2.5">
            {s.participants.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5">
                <Avatar initials={p.initials} color={p.swatch} size={26} />
                <span className="text-[13px] text-fg">{p.name}</span>
                <span className="text-[12px] text-fg-3">
                  {p.party?.acronym} · {p.party?.name}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Estrutura" question="Blocos definidos pelas regras da emissora">
          {s.blocks.length ? (
            <ol className="space-y-2">
              {s.blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-fg-2">{b.label}</span>
                  <span className="tnum text-fg-3">
                    {wallClock(debate.startsAt, b.startOffset, false)} · {fmtDuration(b.endOffset - b.startOffset)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <StateView state="no_data" compact>Estrutura não informada.</StateView>
          )}
        </Panel>
      </div>
      <Panel title="Fontes deste debate" question="De onde vêm os dados exibidos">
        <ul className="divide-y divide-border">
          {s.sources.map((src) => (
            <li key={src.id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
              <Tag>{SOURCE_TYPE_LABEL[src.type]}</Tag>
              <Link href={`/sources#${src.id}`} className="text-fg hover:underline">{src.name}</Link>
              <span className="ml-auto text-fg-3">{src.provider}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
