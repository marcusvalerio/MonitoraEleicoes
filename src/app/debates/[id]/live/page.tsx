import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDebateSnapshot } from "@/services/debates";
import { getRepository } from "@/repository";
import { LiveDebate } from "@/components/debate/LiveDebate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ao vivo" };

export default async function LivePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ seg?: string }> }) {
  const { id } = await params;
  const { seg } = await searchParams;
  let s = await getDebateSnapshot(id);
  if (!s) notFound();
  // Link para uma fala específica: em replay, avança o relógio até ela.
  if (seg) {
    const target = (await getRepository()).getSegment(id, seg);
    if (target && target.endOffset > s.offset) s = (await getDebateSnapshot(id, target.endOffset + 1))!;
  }
  return (
    <LiveDebate
      debate={{ id: s.debate.id, title: s.debate.title, startsAt: s.debate.startsAt, broadcaster: s.debate.broadcaster }}
      clock={s.clock}
      participants={s.participants}
      blocks={s.blocks}
      initial={{ offset: s.offset, totalEnd: s.totalEnd, segments: s.segments, classifications: s.classifications, events: s.events, inProgress: s.inProgress }}
      focusSegmentId={seg ?? null}
      moderatorId={s.moderatorId}
    />
  );
}
