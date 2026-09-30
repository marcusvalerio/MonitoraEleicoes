import type { Metadata } from "next";
import Link from "next/link";
import { getRepository } from "@/repository";
import { PageHeader, Tag } from "@/components/ui/primitives";
import { fmtDateTime, fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ao vivo" };

export default async function AoVivoIndex() {
  const repo = await getRepository();
  const debates = await repo.listDebates();
  const states = await Promise.all(debates.map(async (d) => ({ d, s: await repo.getLiveState(d.id, -1, 1) })));
  return (
    <div className="mx-auto max-w-[960px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Ao vivo" title="Debates acompanhados" description="Ingestão contínua: fonte → RAW → normalização → banco → esta tela. Replays são sempre identificados como tal." />
      <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-surface">
        {states.map(({ d, s }) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
            <Link href={`/ao-vivo/${d.id}`} className="font-medium text-fg hover:underline">
              {d.title}
            </Link>
            <span className="text-fg-3">{fmtDateTime(d.startsAt)}</span>
            {s?.sourceMode === "replay" && <Tag tone="info">replay</Tag>}
            {s?.sourceMode === "live" && <Tag tone="neg">fonte ao vivo</Tag>}
            <span className="ml-auto text-fg-3 tnum">{s ? `${fmtInt(s.totals.segments)} segmentos` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
