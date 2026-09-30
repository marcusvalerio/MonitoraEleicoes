import { TOPIC_LABEL } from "@/domain/labels";
import type { TopicMomentum } from "@/analytics/momentum";
import { fmtCompact, wallClock } from "@/lib/format";

/**
 * Small multiples: uma mini-série por tema, todas na MESMA escala vertical
 * (comparáveis entre si). Janelas de 5 min.
 */
export function TopicSmallMultiples({ items, startsAt, domainEnd, bucket = 300 }: { items: TopicMomentum[]; startsAt: string; domainEnd: number; bucket?: number }) {
  const max = Math.max(1, ...items.flatMap((i) => i.series));
  const n = Math.ceil(domainEnd / bucket);
  const W = 220;
  const H = 56;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 4);
  return (
    <div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
        {items.map((m) => {
          const pts = m.series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
          const total = m.series.reduce((a, b) => a + b, 0);
          return (
            <li key={m.topic} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[11.5px] font-semibold tracking-[0.1em] text-fg uppercase">{TOPIC_LABEL[m.topic]}</span>
                <span className="text-[11.5px] text-fg-2 tnum">{fmtCompact(total)}</span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-1.5 h-[56px] w-full" role="img" aria-label={`${TOPIC_LABEL[m.topic]}: ${total} publicações`}>
                <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#34343a" vectorEffect="non-scaling-stroke" />
                {pts.length > 1 && (
                  <>
                    <polygon points={`0,${H} ${pts.join(" ")} ${x(m.series.length - 1)},${H}`} fill="#6b9cf2" opacity={0.18} />
                    <polyline points={pts.join(" ")} fill="none" stroke="#6b9cf2" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  </>
                )}
              </svg>
              <p className="mt-1 text-[10.5px] text-fg-3 tnum">{m.lastSpokenAt !== null ? `última fala ${wallClock(startsAt, m.lastSpokenAt, false)}` : "sem falas no debate"}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] text-fg-3">Todas as séries usam a mesma escala vertical (máx. {fmtCompact(max)} publicações por janela de 5 min) · eixo de {wallClock(startsAt, 0, false)} a {wallClock(startsAt, domainEnd, false)}.</p>
    </div>
  );
}
