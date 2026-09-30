import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TOPIC_LABEL } from "@/domain/labels";
import type { TopicId } from "@/domain/types";
import { wallClock } from "@/lib/format";
import { Delta, NatureBadge } from "@/components/ui/primitives";

export interface NowData {
  segmentId: string;
  at: number | null;
  topic: TopicId;
  subtopic: string | null;
  headline: string;
  quote: string;
  volumeChange: number | null;
  sources: string[];
  related: { id: string; name: string; color: string }[];
}

/** Bloco editorial "AGORA" — o que acabou de acontecer, com contexto e origem. */
export function NowBlock({ data, startsAt, debateId, ended }: { data: NowData; startsAt: string; debateId: string; ended?: boolean }) {
  return (
    <article className="grid gap-6 lg:grid-cols-[180px_1fr_240px]" aria-labelledby="agora-title">
      <div>
        {ended ? (
          <p className="text-[11px] font-semibold tracking-[0.16em] text-fg-2">ÚLTIMA FALA NA FONTE</p>
        ) : (
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-neg">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-neg" aria-hidden /> AGORA
          </p>
        )}
        <p className="mt-2 font-mono text-[26px] leading-none text-fg tnum">{wallClock(startsAt, data.at)}</p>
        <p className="mt-3 text-[11.5px] font-semibold tracking-[0.12em] text-fg-2 uppercase">
          {data.topic === "outros" ? "Debate" : TOPIC_LABEL[data.topic]}
          {data.subtopic && <span className="text-fg-3"> · {data.subtopic}</span>}
        </p>
      </div>
      <div className="min-w-0">
        <h2 id="agora-title" className="font-display text-[26px] leading-[1.15] font-semibold tracking-tight text-fg md:text-[32px]">
          {data.headline}
        </h2>
        <blockquote className="mt-3 line-clamp-2 max-w-[62ch] border-l-2 border-border-strong pl-3 text-[13.5px] leading-relaxed text-fg-2">“{data.quote}”</blockquote>
        <Link href={`/debates/${debateId}/live?seg=${data.segmentId}`} className="mt-3 inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
          Ver na transcrição <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
      <dl className="grid grid-cols-3 gap-4 text-[12px] lg:grid-cols-1 lg:gap-3 lg:border-l lg:border-border lg:pl-6">
        <div>
          <dt className="eyebrow">Volume · 5 min</dt>
          <dd className="mt-1 font-display text-[20px] font-semibold">
            <Delta value={data.volumeChange} />
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Fontes</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-x-1.5 text-fg-2">
            {data.sources.join(" · ")} <NatureBadge nature="ai" compact />
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Relacionados</dt>
          <dd className="mt-1 space-y-0.5">
            {data.related.map((r) => (
              <span key={r.id} className="flex items-center gap-1.5 text-fg">
                <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
                {r.name}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </article>
  );
}
