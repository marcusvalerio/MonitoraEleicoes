import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { getBoundaries } from "@/services/geo";
import { candidacyByUf, candidacyStanding, personHistory } from "@/analytics/elections";
import { candidateTable } from "@/analytics/social-listening";
import { PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { ElectionMap } from "@/components/intel/ElectionMap";
import { SERIES } from "@/components/intel/palette";
import { fmtInt, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Candidato" };

/**
 * CANDIDATO (pessoa) — trajetória SOMENTE por vínculo de identidade resolvido (título/CPF em HMAC) ou manual, nunca por nome.
 * Por candidatura: votos, % e colocação na própria disputa (dados oficiais). Nenhum atributo pessoal inferido.
 */
export default async function Candidate({ params, searchParams }: { params: Promise<{ personId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { personId } = await params;
  const sql = await intelSql();
  if (!sql)
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6">
        <StateView state="provider_unavailable" title="Fonte indisponível neste ambiente">A base eleitoral oficial (TSE) não está disponível aqui.</StateView>
      </div>
    );
  const id = Number(personId);
  if (!Number.isInteger(id)) notFound();
  const hist = await personHistory(sql, id);
  if (!hist.length) notFound();
  const { filter } = filtersFrom(await searchParams, { period: { preset: "30d" } });
  const current = hist.find((h) => h.year === 2026);
  const withVotes = hist.find((h) => h.votesRound1 !== null);
  const [standings, social, byUf, boundaries] = await Promise.all([
    Promise.all(hist.map((h) => (h.votesRound1 !== null ? candidacyStanding(sql, h.candidacyId) : Promise.resolve(null)))),
    current ? candidateTable(sql, { ...filter, year: 2026 }).then((t) => t.find((c) => c.candidacyId === current.candidacyId)) : Promise.resolve(undefined),
    withVotes ? candidacyByUf(sql, withVotes.candidacyId) : Promise.resolve([]),
    getBoundaries("uf"),
  ]);
  const latest = hist[0];
  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow="Candidato · fonte TSE"
        title={latest.ballotName}
        description={`${latest.office} · ${latest.uf ?? "BR"} · ${latest.party ?? "—"} (${latest.year}). ${hist.length} candidatura(s) vinculada(s) por identificador oficial (título de eleitor/CPF, armazenados apenas como hash).`}
      />
      <section className="flex flex-wrap gap-2 text-[12px]" aria-label="Partidos">
        {[...new Set(hist.map((h) => h.party).filter(Boolean))].map((p) => (
          <Link key={p} href={`/partido/${encodeURIComponent(p!)}`} className="rounded-[4px] border border-border px-2 py-0.5 text-fg-2 hover:text-fg">{p}</Link>
        ))}
      </section>

      <Panel title="Trajetória eleitoral" question="Candidaturas oficiais vinculadas · votos, percentual e colocação na própria disputa (1º turno)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]" data-testid="person-history">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="py-1 pr-2 font-normal">Ano</th>
                <th className="px-2 font-normal">Cargo</th>
                <th className="px-2 font-normal">Território</th>
                <th className="px-2 font-normal">Partido</th>
                <th className="px-2 text-right font-normal">Votos</th>
                <th className="px-2 text-right font-normal">% na disputa</th>
                <th className="px-2 text-right font-normal">Colocação</th>
                <th className="px-2 font-normal">Situação (TSE)</th>
                <th className="px-2 font-normal">Vínculo</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((h, i) => {
                const s = standings[i];
                return (
                  <tr key={h.candidacyId} className="border-t border-border/60">
                    <td className="py-1.5 pr-2 text-fg tnum">{h.year}</td>
                    <td className="px-2 text-fg-2">{h.office}</td>
                    <td className="px-2 text-fg-2">{h.territory}</td>
                    <td className="px-2 text-fg-2">{h.party ?? "—"}</td>
                    <td className="px-2 text-right tnum text-fg">{h.votesRound1 === null ? (h.year === 2026 ? "não publicado" : "sem registro") : fmtInt(h.votesRound1)}</td>
                    <td className="px-2 text-right tnum text-fg-2">{s ? fmtPct(s.pct, 1) : "—"}</td>
                    <td className="px-2 text-right tnum text-fg-2">{s ? `${s.rank}º de ${s.of}` : "—"}</td>
                    <td className="px-2 text-fg-3">{[h.statusRound1, h.statusRound2].filter((x) => x && x !== "#NULO").join(" / ") || "—"}</td>
                    <td className="px-2"><Tag tone={h.identity.status === "manual" ? "info" : "neutral"}>{h.identity.status === "manual" ? "manual" : h.identity.method}</Tag></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-fg-3">% e colocação: votos nominais da candidatura ÷ todos os votos nominais da mesma disputa (ciclo, cargo e circunscrição). Votos de cargos diferentes não são comparáveis.</p>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          {current && (
            <Panel title="2026" question={`${current.office} · ${current.uf ?? "BR"} · ${current.party ?? "—"}`}>
              <dl className="space-y-1.5 text-[12.5px]">
                <div className="flex justify-between gap-3 border-t border-border/60 pt-1.5"><dt className="text-fg-3">Resultado</dt><dd className="text-fg-2"><Link className="hover:text-fg" href={`/eleicoes?ano=2026&cargo=${current.officeId}${current.uf && current.uf !== "BR" ? `&uf=${current.uf}` : ""}`}>ver apuração →</Link></dd></div>
                <div className="flex justify-between gap-3 border-t border-border/60 pt-1.5" data-testid="person-social">
                  <dt className="text-fg-3">Redes (30 dias)</dt>
                  <dd className="text-right text-fg-2">{social ? `${fmtInt(social.mentions)} conteúdos mencionam · apoio explícito ${fmtInt(social.explicitSupport)} · crítica explícita ${fmtInt(social.explicitCritique)}` : "nenhuma menção coletada (ou fonte não configurada)"}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border/60 pt-1.5"><dt className="text-fg-3">Pesquisas</dt><dd className="text-right text-fg-2"><Link className="hover:text-fg" href={`/pesquisas?cargo=${current.officeId}${current.uf && current.uf !== "BR" ? `&uf=${current.uf}` : ""}`}>registros do cargo →</Link><span className="block text-[11px] text-fg-3">o registro do TSE não traz percentuais por candidato</span></dd></div>
                <div className="flex justify-between gap-3 border-t border-border/60 pt-1.5"><dt className="text-fg-3">Cobertura editorial</dt><dd className="text-right text-fg-3">sem vínculo com eventos editoriais coletados</dd></div>
              </dl>
              <p className="mt-2 text-[11px] text-fg-3">Menção não é apoio; volume não indica intenção de voto.</p>
            </Panel>
          )}
        </div>
        {withVotes && byUf.length > 0 && (
          <Panel title={`Votos por UF · ${withVotes.year}`} question={`${withVotes.office} · participação nos votos do cargo em cada UF`}>
            <ElectionMap
              boundaries={boundaries}
              entities={[{ id: "c", name: withVotes.ballotName, color: SERIES[0], partyAcronym: withVotes.party ?? "" }]}
              rows={byUf.map((u) => ({ uf: u.uf, leader: { id: "c", name: withVotes.ballotName, party: withVotes.party, votes: Number(u.votes), share: u.share } }))}
              title={`Votos de ${withVotes.ballotName} por UF em ${withVotes.year}`}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}
