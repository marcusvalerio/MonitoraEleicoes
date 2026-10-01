import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { personHistory } from "@/analytics/elections";
import { candidateTable } from "@/analytics/social-listening";
import { PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Candidato" };

/** Perfil: trajetória SOMENTE por vínculo de identidade resolvido (título/CPF em HMAC) ou manual — nunca por nome. */
export default async function Candidate({ params, searchParams }: { params: Promise<{ personId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { personId } = await params;
  const sql = await intelSql();
  if (!sql)
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6">
        <StateView state="provider_unavailable" title="Indisponível neste perfil">Perfis de candidatos usam os dados oficiais persistidos (DATA_MODE=live).</StateView>
      </div>
    );
  const id = Number(personId);
  if (!Number.isInteger(id)) notFound();
  const hist = await personHistory(sql, id);
  if (!hist.length) notFound();
  const { filter } = filtersFrom(await searchParams, { period: { preset: "30d" } });
  const current = hist.find((h) => h.year === 2026);
  const social = current ? (await candidateTable(sql, { ...filter, year: 2026 })).find((c) => c.candidacyId === current.candidacyId) : undefined;
  const latest = hist[0];
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Candidato · fonte TSE" title={latest.ballotName} description={`${hist.length} candidatura(s) vinculada(s) a esta pessoa por identificador oficial (título de eleitor/CPF, armazenados apenas como hash).`} />
      <Panel title="Trajetória eleitoral" question="Candidaturas oficiais vinculadas">
        <table className="w-full text-[12.5px]" data-testid="person-history">
          <thead>
            <tr className="text-left text-fg-3">
              <th className="py-1 pr-2 font-normal">Ano</th>
              <th className="px-2 font-normal">Cargo</th>
              <th className="px-2 font-normal">Território</th>
              <th className="px-2 font-normal">Partido</th>
              <th className="px-2 text-right font-normal">Votos (1º turno)</th>
              <th className="px-2 font-normal">Situação (TSE)</th>
              <th className="px-2 font-normal">Vínculo</th>
            </tr>
          </thead>
          <tbody>
            {hist.map((h) => (
              <tr key={h.candidacyId} className="border-t border-border/60">
                <td className="py-1.5 pr-2 text-fg tnum">{h.year}</td>
                <td className="px-2 text-fg-2">{h.office}</td>
                <td className="px-2 text-fg-2">{h.territory}</td>
                <td className="px-2 text-fg-2">{h.party ?? "—"}</td>
                <td className="px-2 text-right tnum text-fg">{h.votesRound1 === null ? (h.year === 2026 ? "não disponível" : "sem registro") : fmtInt(h.votesRound1)}</td>
                <td className="px-2 text-fg-3">{[h.statusRound1, h.statusRound2].filter(Boolean).join(" / ") || "—"}</td>
                <td className="px-2"><Tag tone={h.identity.status === "manual" ? "info" : "neutral"}>{h.identity.status === "manual" ? "manual" : h.identity.method}</Tag></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {current && (
        <Panel title="Menções em 2026" question="Fontes conectadas · últimos 30 dias">
          {social ? (
            <p className="text-[12.5px] text-fg-2" data-testid="person-social">
              <span className="tnum text-fg">{fmtInt(social.mentions)}</span> conteúdos mencionam · apoio explícito <span className="tnum text-fg">{fmtInt(social.explicitSupport)}</span> · crítica explícita <span className="tnum text-fg">{fmtInt(social.explicitCritique)}</span>.{" "}
              <Link className="text-fg hover:underline" href={`/comparar?modo=social&c=${current.candidacyId}`}>Comparar</Link>
            </p>
          ) : (
            <p className="text-[12.5px] text-fg-3">Nenhuma menção coletada no período (ou período não coletado — ver cobertura em Monitoramento).</p>
          )}
          <p className="mt-2 text-[11px] text-fg-3">Menção não é apoio; volume não indica intenção de voto.</p>
        </Panel>
      )}
    </div>
  );
}
