import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getRepository } from "@/repository";
import { LiveIngestFeed, type SpeakerInfo } from "@/components/live/LiveIngestFeed";
import { PageHeader } from "@/components/ui/primitives";
import { intelSql } from "@/services/intelligence";
import { debateSocial } from "@/analytics/debate-social";
import { COUNT_STATE_LABEL, countByUf, countView } from "@/analytics/apuracao";
import { getBoundaries } from "@/services/geo";
import { LiveRefresh } from "@/components/intel/LiveRefresh";
import { EvidenceSection } from "@/components/intel/EvidenceSection";
import { CountSummary } from "@/components/intel/CountSummary";
import { ElectionMap } from "@/components/intel/ElectionMap";
import { fmtDateTime, fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ao vivo" };

/** Tela ao vivo alimentada exclusivamente pelo Repository (PostgreSQL no perfil live). */
export default async function AoVivoDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const state = await repo.getLiveState(id, -1, 200);
  if (!state) notFound();
  const sql = await intelSql();
  const [candidates, parties, social, count, byUf, boundaries] = await Promise.all([
    repo.getCandidates(),
    repo.getParties(),
    sql ? debateSocial(sql, id) : null,
    sql ? countView(sql, { year: 2026, round: 1, officeId: 1, territoryId: 0 }) : null,
    sql ? countByUf(sql, { year: 2026, round: 1, officeId: 1 }) : null,
    getBoundaries("uf"),
  ]);
  const speakers: Record<string, SpeakerInfo> = Object.fromEntries(
    candidates.map((c) => [c.id, { name: `${c.name}${parties.find((p) => p.id === c.partyId) ? ` (${parties.find((p) => p.id === c.partyId)!.acronym})` : ""}`, color: c.swatch }]),
  );
  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-6 md:px-6">
      <PageHeader eyebrow={<Link href="/ao-vivo">Ao vivo</Link>} title={state.title} description="Centro operacional: dado oficial, cobertura editorial, transcrição e conversação pública — sempre separados, com fonte e horário. Tudo é lido do banco; atualizar a página não perde nada." />
      <LiveRefresh intervalS={20} />

      <EvidenceSection kind="oficial" source="TSE" title="Apuração · Presidente · Brasil" aside={<Link className="hover:text-fg" href="/eleicoes?ano=2026">apuração completa →</Link>}>
        {count ? <CountSummary view={count} limit={4} /> : <p className="text-[12.5px] text-fg-3">Fonte indisponível neste ambiente.</p>}
      </EvidenceSection>

      <EvidenceSection kind="cobertura" source="g1 · transcrição" title="Agora e linha do tempo" aside="atualizações editoriais não são falas literais">
        <LiveIngestFeed initial={state} speakers={speakers} />
      </EvidenceSection>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <EvidenceSection kind="conversacao" source="Redes conectadas" title="Conversação pública" aside="associação temporal, não causal">
          {social ? (
            <>
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
              <p className="mt-2 text-[11px] text-fg-3">{social.statement} Janelas de mesma duração do debate. Conteúdos (não pessoas); menção ≠ apoio.</p>
            </>
          ) : (
            <p className="text-[12.5px] text-fg-3">Fonte indisponível neste ambiente.</p>
          )}
        </EvidenceSection>
        <EvidenceSection kind="oficial" source="TSE" title="Mapa · estado da apuração">
          {byUf ? <ElectionMap boundaries={boundaries} entities={[]} rows={byUf.map((u) => ({ uf: u.uf, leader: null, note: COUNT_STATE_LABEL[u.state] }))} title="Estado da apuração presidencial por UF" /> : <p className="text-[12.5px] text-fg-3">Fonte indisponível.</p>}
        </EvidenceSection>
      </div>
    </div>
  );
}
