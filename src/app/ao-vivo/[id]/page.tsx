import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getRepository } from "@/repository";
import { LiveIngestFeed, type SpeakerInfo } from "@/components/live/LiveIngestFeed";
import { PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ao vivo · ingestão" };

/** Tela ao vivo alimentada exclusivamente pelo Repository (PostgreSQL no perfil live). */
export default async function AoVivoDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const state = await repo.getLiveState(id, -1, 200);
  if (!state) notFound();
  const [candidates, parties] = await Promise.all([repo.getCandidates(), repo.getParties()]);
  const speakers: Record<string, SpeakerInfo> = Object.fromEntries(
    candidates.map((c) => [c.id, { name: `${c.name}${parties.find((p) => p.id === c.partyId) ? ` (${parties.find((p) => p.id === c.partyId)!.acronym})` : ""}`, color: c.swatch }]),
  );
  return (
    <div className="mx-auto max-w-[960px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow={<Link href="/ao-vivo">Ao vivo</Link>} title={state.title} description="Segmentos persistidos no banco, na ordem em que chegam. Atualizar a página não perde nada: tudo é lido do banco." />
      <LiveIngestFeed initial={state} speakers={speakers} />
    </div>
  );
}
