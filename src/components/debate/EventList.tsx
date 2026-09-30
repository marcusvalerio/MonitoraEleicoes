"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AtSign, ArrowLeftRight, Shuffle, TrendingUp, ScanSearch } from "lucide-react";
import type { DebateEvent, DebateEventKind } from "@/domain/types";
import { EVENT_KIND_LABEL, TOPIC_LABEL } from "@/domain/labels";
import { wallClock, fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";

export const EVENT_ICON: Record<DebateEventKind, typeof AtSign> = {
  mention: AtSign,
  reply_chain: ArrowLeftRight,
  topic_shift: Shuffle,
  social_spike: TrendingUp,
  fact_check_flag: ScanSearch,
};

/** Linha do tempo de eventos (mais recente primeiro por padrão). */
export function EventList({ events, startsAt, debateId, limit, dense, newestFirst = true, onSelect, selectedId }: { events: DebateEvent[]; startsAt: string; debateId: string; limit?: number; dense?: boolean; newestFirst?: boolean; onSelect?: (e: DebateEvent) => void; selectedId?: string | null }) {
  const list = (newestFirst ? [...events].reverse() : events).slice(0, limit);
  return (
    <ol className="relative">
      <span className="absolute top-2 bottom-2 left-[13px] w-px bg-border" aria-hidden />
      <AnimatePresence initial={false}>
        {list.map((e) => {
          const Icon = EVENT_ICON[e.kind];
          const variation = e.metrics.find((m) => m.unit === "%");
          const content = (
            <>
              <span className={cn("relative z-[1] mt-0.5 flex size-[27px] shrink-0 items-center justify-center rounded-full border bg-surface", e.kind === "social_spike" ? "border-info/40 text-info" : e.kind === "fact_check_flag" ? "border-warn/40 text-warn" : "border-border-strong text-fg-2")}>
                <Icon size={13} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] text-fg-3">
                  <span className="font-mono text-fg-2">{e.code}</span>
                  <span className="tnum">{wallClock(startsAt, e.startOffset)}</span>
                  <span>·</span>
                  <span>{EVENT_KIND_LABEL[e.kind]}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-fg">{e.title}</p>
                {!dense && <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{e.description}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-3">
                  {e.topic !== "outros" && <span className="text-fg-2">{TOPIC_LABEL[e.topic]}</span>}
                  {variation && (
                    <span className="tnum">
                      Volume social {variation.value >= 0 ? "+" : ""}
                      {fmtInt(variation.value)}% em 5 min
                    </span>
                  )}
                </div>
              </div>
            </>
          );
          const cls = cn("flex w-full gap-3 rounded-[var(--radius-md)] px-0 py-2 text-left transition-colors", selectedId === e.id ? "bg-elevated" : "hover:bg-elevated/60");
          return (
            <motion.li key={e.id} layout="position" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(e)} className={cls}>
                  {content}
                </button>
              ) : (
                <Link href={`/debates/${debateId}/live?seg=${e.segmentIds[0] ?? ""}`} className={cls}>
                  {content}
                </Link>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
