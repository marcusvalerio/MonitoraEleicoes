import type { Metadata } from "next";
import Link from "next/link";
import { getRepository } from "@/repository";
import { PageHeader, Tag } from "@/components/ui/primitives";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { intelSql } from "@/services/intelligence";
import { countView } from "@/analytics/apuracao";
import { EvidenceSection } from "@/components/intel/EvidenceSection";
import { CountSummary } from "@/components/intel/CountSummary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ao vivo" };

export default async function AoVivoIndex() {
  const repo = await getRepository();
  const debates = await repo.listDebates();
  const states = (await Promise.all(debates.map(async (d) => ({ d, s: await repo.getLiveState(d.id, -1, 1) })))).filter((x) => x.s);
  const sql = await intelSql();
  const count = sql ? await countView(sql, { year: 2026, round: 1, officeId: 1, territoryId: 0 }) : null;
  return (
    <div className="mx-auto max-w-[960px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Ao vivo" title="Ao vivo" description="Apuração oficial e eventos acompanhados em tempo real. Replays são sempre identificados como tal." />
      <EvidenceSection kind="oficial" source="TSE" title="Apuração · Presidente · Brasil" aside={<Link className="hover:text-fg" href="/eleicoes?ano=2026">completa →</Link>}>
        {count ? <CountSummary view={count} limit={4} /> : <p className="text-[12.5px] text-fg-3">Fonte indisponível neste ambiente.</p>}
      </EvidenceSection>
      <h2 className="pt-2 text-[11px] font-medium tracking-[0.08em] text-fg-3 uppercase">Eventos acompanhados</h2>
      {states.length === 0 && <p className="text-[12.5px] text-fg-3">Nenhum evento cadastrado para acompanhamento.</p>}
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
