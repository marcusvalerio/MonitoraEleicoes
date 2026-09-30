import { TOPIC_LABEL } from "@/domain/labels";
import type { TopicMomentum } from "@/analytics/momentum";
import { fmtInt, fmtPct, wallClock } from "@/lib/format";
import { Delta, Sparkline } from "@/components/ui/primitives";

/** Assuntos em movimento — volume de publicações por tema e tendência (15 min). */
export function TopicMomentumList({ items, startsAt }: { items: TopicMomentum[]; startsAt: string }) {
  if (!items.length) return <p className="py-6 text-[12px] text-fg-3">Nenhum tema com publicações ainda.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((m) => (
        <li key={m.topic} className="grid grid-cols-[1fr_auto] items-center gap-x-3 py-2.5">
          <div className="min-w-0">
            <p className="flex items-baseline gap-2">
              <span className="text-[12px] font-semibold tracking-[0.1em] text-fg uppercase">{TOPIC_LABEL[m.topic]}</span>
              {m.change === null ? <span className="text-[11px] tracking-wide text-info">novo</span> : <Delta value={m.change} className="text-[12px]" />}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-3 tnum">
              {fmtInt(m.recent)} publ. em 15 min{m.lastSpokenAt !== null && <> · última fala {wallClock(startsAt, m.lastSpokenAt, false)}</>}
            </p>
          </div>
          <Sparkline values={m.series} width={76} height={26} color="#6b9cf2" />
        </li>
      ))}
    </ul>
  );
}

/** Onde a conversa está — participação por plataforma com sparkline. */
export function PlatformList({ items, total }: { items: { platform: string; name: string; posts: number; series: number[] }[]; total: number }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((p) => (
        <li key={p.platform} className="grid grid-cols-[1fr_76px_52px] items-center gap-3 py-2.5">
          <span className="text-[13px] text-fg">{p.name}</span>
          <Sparkline values={p.series} width={76} height={22} />
          <span className="text-right font-display text-[16px] font-semibold tnum text-fg">{fmtPct(p.posts / Math.max(1, total))}</span>
        </li>
      ))}
    </ul>
  );
}

/** Nomes mais citados — contagem de menções, em ordem fixa (não é ranking). */
export function MentionList({ items }: { items: { id: string; name: string; party: string; color: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.id}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-2 text-[13px] text-fg">
              <span className="size-2 rounded-full" style={{ background: i.color }} aria-hidden />
              {i.name}
              <span className="text-[11px] text-fg-3">{i.party}</span>
            </span>
            <span className="font-display text-[16px] font-semibold tnum">{fmtInt(i.count)}</span>
          </div>
          <div className="mt-1.5 ml-4 h-[3px] rounded-full bg-elevated">
            <div className="h-full rounded-full bg-fg-3" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
