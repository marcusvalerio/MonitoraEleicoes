import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getRepository } from "@/repository";
import { LiveIngestFeed, type SpeakerInfo } from "@/components/live/LiveIngestFeed";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { intelSql } from "@/services/intelligence";
import { debateSocial } from "@/analytics/debate-social";
import { fmtDateTime, fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ao vivo · ingestão" };

/** Tela ao vivo alimentada exclusivamente pelo Repository (PostgreSQL no perfil live). */
export default async function AoVivoDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const state = await repo.getLiveState(id, -1, 200);
  if (!state) notFound();
  const sql = await intelSql();
  const [candidates, parties, social] = await Promise.all([repo.getCandidates(), repo.getParties(), sql ? debateSocial(sql, id) : null]);
  const speakers: Record<string, SpeakerInfo> = Object.fromEntries(
    candidates.map((c) => [c.id, { name: `${c.name}${parties.find((p) => p.id === c.partyId) ? ` (${parties.find((p) => p.id === c.partyId)!.acronym})` : ""}`, color: c.swatch }]),
  );
  return (
    <div className="mx-auto max-w-[960px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow={<Link href="/ao-vivo">Ao vivo</Link>} title={state.title} description="Segmentos persistidos no banco, na ordem em que chegam. Atualizar a página não perde nada: tudo é lido do banco." />
      <LiveIngestFeed initial={state} speakers={speakers} />
      {social && (
        <Panel title="Fontes sociais conectadas" question={social.statement}>
          <div className="grid gap-3 sm:grid-cols-3" data-testid="debate-social">
            {social.phases.map((p) => (
              <div key={p.phase} className="rounded-[var(--radius-sm)] border border-border p-3">
                <p className="text-[12px] text-fg-3 capitalize">{p.phase} · {fmtDateTime(p.from)}</p>
                <p className="mt-1 text-[20px] text-fg tnum">{p.count === null ? "Não coletado" : fmtInt(p.count)}</p>
                {p.byCandidacy.slice(0, 3).map((c) => (
                  <p key={c.candidacyId} className="flex justify-between text-[12px] text-fg-2">
                    {c.name} <span className="tnum">{fmtInt(c.mentions)}</span>
                  </p>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-fg-3">Janelas de mesma duração do debate. Conteúdos (não pessoas); menção ≠ apoio.</p>
        </Panel>
      )}
    </div>
  );
}
