import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listDebates } from "@/services/debates";
import { fmtDate, wallClock } from "@/lib/format";
import { DemoBadge, LiveDot, PageHeader, Tag } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";

export const metadata: Metadata = { title: "Debates" };

export default async function DebatesPage() {
  const debates = await listDebates();
  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Debates" title="Debates monitorados" description="Transmissões transcritas, segmentadas e classificadas. Cada fala mantém o texto original ao lado da classificação automática." />
      {debates.length === 0 ? (
        <StateView state="empty">Nenhum debate cadastrado.</StateView>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          {debates.map((d) => (
            <li key={d.id}>
              <Link href={`/debates/${d.id}`} className="group flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-elevated sm:flex-row sm:items-center">
                <div className="w-[120px] shrink-0">
                  <p className="font-display text-[15px] font-semibold tnum">{fmtDate(d.startsAt)}</p>
                  <p className="text-[11.5px] text-fg-3 tnum">{wallClock(d.startsAt, 0, false)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {d.status === "live" && <LiveDot />}
                    {d.status === "ended" && <Tag>Encerrado</Tag>}
                    {d.status === "scheduled" && <Tag tone="info">Agendado</Tag>}
                    {d.mode === "demo" && <DemoBadge />}
                  </div>
                  <p className="mt-1 text-[14px] font-medium text-fg">{d.title}</p>
                  <p className="text-[12px] text-fg-3">
                    {d.broadcaster} · {d.officeLabel} · {d.participantIds.length} participantes
                  </p>
                </div>
                <ArrowRight size={15} className="hidden text-fg-3 group-hover:text-fg sm:block" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
