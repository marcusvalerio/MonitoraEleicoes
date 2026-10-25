import type { Metadata } from "next";
import Link from "next/link";
import { intelSql } from "@/services/intelligence";
import { getBoundaries } from "@/services/geo";
import { COUNT_STATE_LABEL, countByUf, countView, type CountView } from "@/analytics/apuracao";
import { UF_IBGE, UF_NAME } from "@/elections/reference";
import { StateView } from "@/components/ui/states";
import { EvidenceBadge } from "@/components/intel/EvidenceSection";
import { LiveRefresh } from "@/components/intel/LiveRefresh";
import { OTHER } from "@/components/intel/palette";
import { partyColor } from "@/components/intel/partyColors";
import { FlagMark } from "@/components/apuracao/FlagMark";
import { LiveStatus, headlineOf } from "@/components/apuracao/LiveStatus";
import { LiveIntro } from "@/components/apuracao/LiveIntro";
import { VoteRing } from "@/components/apuracao/VoteRing";
import { ApuracaoMap, type UfCount } from "@/components/apuracao/ApuracaoMap";
import { Apuracao3DPanel, type Territory3D } from "@/components/apuracao/Apuracao3DPanel";
import { RoundCompare, type CompareFinalist } from "@/components/apuracao/RoundCompare";
import { ExteriorGlobe } from "@/components/apuracao/ExteriorGlobe";
import { MunicipalityBars } from "@/components/apuracao/MunicipalityBars";
import { compareRounds, resultsByMunicipality, resultsByUf, roundsWithData, type TerritoryResult } from "@/analytics/turnos";
import { exteriorCoords } from "@/geo/exterior";
import { PresidentialBoard, type BoardCandidate } from "@/components/apuracao/PresidentialBoard";
import { FollowedPanel } from "@/components/apuracao/FollowedPanel";
import { CandidatePhoto } from "@/components/apuracao/CandidatePhoto";
import { fmtDateTime, fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Apuração ao vivo" };

const pctOf = (m: { value: number | null; status: string }) => (m.status === "value" ? m.value : null);

/** Candidaturas da disputa na ordem OFICIAL (votos do TSE); posição só com votos apurados. Cor estável por nº de urna. */
function board(view: CountView, colorBySq: Map<string, string>): BoardCandidate[] {
  let pos = 0;
  return view.candidates
    .filter((c) => c.voteDestination === null || c.voteDestination === "Válido" || c.votes.status !== "value")
    .map((c) => ({
      sq: String(c.sqCandidato),
      personId: c.personId,
      ballotName: c.name,
      name: "",
      party: c.party,
      number: c.ballotNumber,
      votes: c.votes.status === "value" ? c.votes.value : null,
      votesStatus: c.votes.status,
      pct: pctOf(c.pct),
      position: c.votes.status === "value" ? ++pos : null,
      elected: c.elected === true ? true : null,
      situation: c.situation,
      color: colorBySq.get(String(c.sqCandidato)) ?? OTHER,
    }));
}

/**
 * APURAÇÃO AO VIVO — experiência da noite da eleição, com foco na Presidência. Somente DADO OFICIAL · TSE (arquivos do
 * sistema de divulgação coletados pelo worker). Ausência ≠ zero; "eleito" só quando o TSE marca. Funciona para qualquer
 * ano com retratos (2026 real; replay de demonstração apenas em ambiente de teste, sinalizado).
 */
export default async function Apuracao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const year = Number(sp.ano) || 2026;
  const uf = typeof sp.uf === "string" && sp.uf.toUpperCase() in UF_IBGE ? sp.uf.toUpperCase() : null;
  const sql = await intelSql();
  if (!sql)
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
        <StateView state="provider_unavailable" title="Fonte indisponível neste ambiente">A base oficial (TSE) não está disponível aqui. Nenhum número é exibido — nem estimado.</StateView>
      </div>
    );
  // Turno: o pedido na URL; sem pedido, o 2º turno assim que o TSE publicar algo dele (noite do 2º turno = ao vivo).
  const rounds = await roundsWithData(sql, year);
  const round = sp.turno === "1" ? 1 : sp.turno === "2" ? 2 : rounds.includes(2) ? 2 : 1;
  const [br, ufs, boundaries, ufPres, ufSen, ufDep, terr, exterior, muns, brFirst, ufFirst] = await Promise.all([
    countView(sql, { year, round, officeId: 1, territoryId: 0 }),
    countByUf(sql, { year, round, officeId: 1 }),
    getBoundaries("uf"),
    uf ? countView(sql, { year, round, officeId: 1, territoryId: UF_IBGE[uf] }) : Promise.resolve(null),
    uf ? countView(sql, { year, round, officeId: 5, territoryId: UF_IBGE[uf] }) : Promise.resolve(null),
    uf ? countView(sql, { year, round, officeId: 6, territoryId: UF_IBGE[uf] }) : Promise.resolve(null),
    resultsByUf(sql, { year, round, officeId: 1 }),
    resultsByMunicipality(sql, { year, round, officeId: 1, uf: "ZZ" }),
    uf ? resultsByMunicipality(sql, { year, round, officeId: 1, uf }) : Promise.resolve([] as TerritoryResult[]),
    round === 2 ? countView(sql, { year, round: 1, officeId: 1, territoryId: 0 }) : Promise.resolve(null),
    round === 2 ? resultsByUf(sql, { year, round: 1, officeId: 1 }) : Promise.resolve([] as TerritoryResult[]),
  ]);
  const s = br.snapshot;
  const headline = headlineOf(br.state);
  const started = headline === "ao_vivo" || headline === "encerrada";
  const final = br.state === "totalizada";
  const demo = !!s?.datasetKind && s.datasetKind !== "production";
  // Cor = identidade estável (ordem do nº de urna), nunca posição/ranking nem ideologia.
  // A cor acompanha o candidato entre os turnos: a ordem do nº de urna vem do 1º turno quando ele existe.
  const roster = (brFirst?.candidates.length ? brFirst : br).candidates;
  const colorByNumber = new Map([...roster].sort((a, b) => (a.ballotNumber ?? 999) - (b.ballotNumber ?? 999)).map((c, i) => [c.ballotNumber, partyColor(c.party, i)]));
  const colorBySq = new Map(br.candidates.map((c) => [String(c.sqCandidato), colorByNumber.get(c.ballotNumber) ?? OTHER]));
  const colorOf = (n: number | null) => colorByNumber.get(n) ?? OTHER;
  const leaderOf = (t: TerritoryResult) => {
    const c = t.candidates[0];
    return c && c.votes > 0 ? { name: c.name, party: c.party, pct: c.pct, votes: c.votes, color: colorOf(c.number) } : null;
  };
  const territories: Territory3D[] = terr.map((t) => ({ key: t.key, name: t.key === "ZZ" ? "Exterior" : UF_NAME[t.key] ?? t.name, countedPct: t.countedPct, validVotes: t.validVotes, live: t.phase === "partial", leader: leaderOf(t) }));
  const zz = terr.find((t) => t.key === "ZZ") ?? null;
  const cities = exterior.map((t) => ({ key: t.key, name: t.name, ...(exteriorCoords(t.name) ?? { lat: null, lon: null }), validVotes: t.validVotes, leader: leaderOf(t) }));
  const munRows = muns.map((m) => ({ key: m.key, name: m.name, validVotes: m.validVotes, countedPct: m.countedPct, parts: m.candidates.filter((c) => c.pct !== null).map((c) => ({ name: c.name, color: colorOf(c.number), pct: c.pct! })) }));
  const cmp = round === 2 ? compareRounds(ufFirst, terr, { key: "BR", territoryId: 0, name: "Brasil", uf: null, phase: br.snapshot?.phase ?? "", countedPct: null, validVotes: null, collectedAt: "", candidates: br.candidates.filter((c) => c.votes.status === "value").map((c) => ({ sq: String(c.sqCandidato), name: c.name, party: c.party, number: c.ballotNumber, votes: c.votes.value ?? 0, pct: c.pct.status === "value" ? c.pct.value : null })) }) : null;
  const finalists: CompareFinalist[] = cmp
    ? cmp.finalists.map((f) => {
        const a = brFirst?.candidates.find((c) => c.ballotNumber === f.number);
        return { sq: f.sq, name: f.name, party: f.party, color: colorOf(f.number), first: a && a.votes.status === "value" ? { votes: a.votes.value ?? 0, pct: a.pct.status === "value" ? a.pct.value : null } : null, second: { votes: f.votes, pct: f.pct } };
      })
    : [];
  const roundHref = (r: number) => `?${new URLSearchParams({ ...(year !== 2026 ? { ano: String(year) } : {}), turno: String(r), ...(uf ? { uf } : {}) })}`;
  const cands = board(br, colorBySq);
  const entities = cands.map((c) => ({ id: c.sq, name: c.ballotName, color: c.color, partyAcronym: c.party ?? "" }));
  const sqByName = new Map(cands.map((c) => [c.ballotName, c.sq]));
  const mapRows: UfCount[] = ufs.map((u) => ({
    uf: u.uf,
    state: u.state,
    stateLabel: COUNT_STATE_LABEL[u.state],
    countedPct: pctOf(u.countedPct),
    leader: u.leader ? { id: sqByName.get(u.leader.name) ?? u.leader.name, name: u.leader.name, party: cands.find((c) => c.ballotName === u.leader!.name)?.party ?? null, votes: u.leader.votes, pct: u.leader.pct } : null,
  }));
  const withData = mapRows.filter((r) => r.countedPct !== null && r.countedPct > 0).length;
  const closed = ufs.filter((u) => u.state === "totalizada").length;
  const refreshKey = s ? `${s.collectedAt}` : "none";

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 md:px-6">
      <LiveIntro headline={headline} year={year} />
      {/* BARRA DE IDENTIDADE */}
      <header className="relative -mx-4 mb-6 overflow-hidden border-b border-border bg-[radial-gradient(120%_140%_at_0%_0%,rgba(29,107,71,0.18),transparent_55%),radial-gradient(90%_120%_at_100%_0%,rgba(27,63,143,0.16),transparent_60%)] px-4 py-5 md:-mx-6 md:px-6" data-testid="apuracao-brand">
        {headline === "ao_vivo" && <span className="absolute inset-x-0 bottom-0 h-px overflow-hidden" aria-hidden><span className="block h-full w-1/3 bg-gradient-to-r from-transparent via-[#e5484d] to-transparent motion-safe:animate-[sweep_3.2s_linear_infinite]" /></span>}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <FlagMark size={30} />
            <div>
              <p className="font-[family-name:var(--font-display)] text-[22px] leading-none font-bold tracking-[0.04em] text-fg md:text-[26px]">ELEIÇÕES {year}</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-[12px] font-medium tracking-[0.16em] text-fg-2 uppercase">Apuração · Presidente · {round}º turno</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <nav className="flex rounded-full border border-border bg-bg/60 p-0.5 text-[12px] backdrop-blur" aria-label="Turno">
              {[1, 2].map((r) => (
                <Link key={r} href={roundHref(r)} scroll={false} aria-current={r === round ? "page" : undefined} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 transition-colors ${r === round ? "bg-fg font-semibold text-bg" : rounds.includes(r) ? "text-fg-2 hover:text-fg" : "text-fg-3"}`}>
                  {r}º turno
                  {r === 2 && rounds.includes(2) && !(round === 2 && final) && <span className="size-1.5 rounded-full bg-[#e5484d] motion-safe:animate-[pulse-dot_1.6s_ease-in-out_infinite]" aria-label="ao vivo" />}
                </Link>
              ))}
            </nav>
            <LiveStatus state={br.state} />
            <LiveRefresh intervalS={15} label="Atualizado" />
          </div>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3">
          <EvidenceBadge kind="oficial" source="TSE" />
          {s ? <span>arquivo oficial gerado em {fmtDateTime(s.generatedAt)} · coletado em {fmtDateTime(s.collectedAt)}</span> : <span>nenhum arquivo coletado ainda</span>}
          {s?.sourceUrl && <a className="hover:text-fg" href={s.sourceUrl} target="_blank" rel="noreferrer">ver fonte →</a>}
        </p>
      </header>

      {demo && (
        <div role="note" className="mb-6 rounded-[var(--radius)] border border-warn/40 bg-warn-bg px-4 py-3 text-[12.5px] text-warn" data-testid="demo-banner">
          <strong className="font-semibold">DEMONSTRAÇÃO · ambiente de teste.</strong> Replay controlado com totais oficiais do TSE de {year}; ordem e horário de chegada dos estados são da demonstração.
        </div>
      )}

      {/* PRESIDÊNCIA */}
      <section aria-labelledby="pres" className="grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-12">
        <h2 id="pres" className="sr-only">Presidente</h2>
        <div className="order-1 lg:order-2 lg:col-span-4">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface/60 p-5">
            {headline === "nao_iniciada" || headline === "indisponivel" ? (
              <p className="mb-4 font-[family-name:var(--font-display)] text-[15px] font-semibold text-fg" data-testid="not-started-note">
                {br.state === "nao_iniciada" ? "Dados ainda não publicados pelo TSE." : br.state === "nao_coletada" ? "Apuração ainda não coletada neste ambiente." : "Arquivo oficial indisponível no momento."}
                <span className="mt-1 block font-[family-name:var(--font-sans)] text-[12px] font-normal text-fg-3">Os zeros dos arquivos oficiais antes da totalização não são votos.</span>
              </p>
            ) : (
              <p className="mb-4 flex items-baseline justify-between text-[12px] text-fg-3">
                <span>{withData} de 27 UFs com dados · {closed} encerradas</span>
              </p>
            )}
            {s ? <VoteRing countedPct={s.countedPct} turnout={s.turnout} valid={s.validVotes} blank={s.blankVotes} nul={s.nullVotes} sectionsCounted={s.sectionsCounted} sectionsTotal={s.sectionsTotal} /> : <p className="text-[12.5px] text-fg-3">Nenhum retrato coletado.</p>}
          </div>
        </div>
        <div className="order-2 lg:order-1 lg:col-span-8">
          <Apuracao3DPanel territories={territories} legend={entities.filter((e) => territories.some((t) => t.leader?.name === e.name)).map((e) => ({ name: e.name, color: e.color }))} fallback={<ApuracaoMap boundaries={boundaries} rows={mapRows} entities={entities} />} />
        </div>
        <div className="order-3 lg:col-span-8">
          <h3 className="mb-1 font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-[0.14em] text-fg-2">PRESIDENTE · APURAÇÃO GERAL</h3>
          <p className="mb-2 text-[11.5px] text-fg-3">Ordem oficial por votos apurados (antes da totalização, pelo número de urna). Percentual sobre votos válidos.</p>
          <PresidentialBoard year={year} officeLabel="Presidente" candidates={cands} started={started} final={final} />
        </div>
        <aside className="order-4 lg:col-span-4">
          <FollowedPanel year={year} round={round} refreshKey={refreshKey} />
        </aside>
      </section>

      {/* COMPARATIVO 1º × 2º TURNO */}
      {round === 2 && (
        <section aria-labelledby="cmp" className="mt-14">
          <h2 id="cmp" className="mb-1 font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-[0.14em] text-fg-2">1º × 2º TURNO · FINALISTAS</h2>
          <p className="mb-4 text-[11.5px] text-fg-3">Desempenho de quem está no 2º turno, nos dois turnos, no Brasil e em cada estado.</p>
          {cmp && finalists.length === 2 ? <RoundCompare year={year} finalists={finalists} rows={cmp.rows} secondPartial={!final} /> : <StateView state="empty" title="Comparativo indisponível">O 2º turno ainda não tem votos oficiais coletados.</StateView>}
        </section>
      )}

      {/* MUNICÍPIOS DA UF SELECIONADA */}
      {uf && (
        <section aria-labelledby="mun" className="mt-14">
          <h2 id="mun" className="mb-1 font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-[0.14em] text-fg-2">MUNICÍPIOS · {UF_NAME[uf].toUpperCase()} · PRESIDENTE</h2>
          <p className="mb-4 text-[11.5px] text-fg-3">Divisão oficial dos votos válidos em cada município. Zonas e locais de votação: em breve (exigem a base por seção do TSE).</p>
          <MunicipalityBars rows={munRows} />
        </section>
      )}

      {/* EXTERIOR */}
      <section aria-labelledby="ext" className="mt-14">
        <h2 id="ext" className="mb-1 font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-[0.14em] text-fg-2">VOTOS NO EXTERIOR · PRESIDENTE</h2>
        <p className="mb-4 text-[11.5px] text-fg-3">Brasileiros que votaram fora do país (TSE “ZZ”). Arraste o globo para girar.</p>
        <ExteriorGlobe cities={cities} total={zz ? { validVotes: zz.validVotes, countedPct: zz.countedPct, leader: leaderOf(zz) } : null} />
      </section>

      {/* ESTADOS */}
      <section aria-labelledby="ufs" className="mt-12">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="ufs" className="font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-[0.14em] text-fg-2">ESTADOS · PRESIDENTE</h2>
          <Link href={uf ? `/apuracao/explorar?uf=${uf}` : "/apuracao/explorar"} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-semibold text-bg hover:opacity-90" data-testid="explorar-cta">
            Explorar até a escola →
          </Link>
        </div>
        <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-3" data-testid="states-rows">
          {mapRows.map((r) => (
            <li key={r.uf} className="border-t border-border/60">
              <Link href={`?${new URLSearchParams({ ...(year !== 2026 ? { ano: String(year) } : {}), uf: r.uf })}#estado`} scroll={false} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-3 py-2 hover:bg-elevated/50">
                <span className="font-[family-name:var(--font-display)] text-[13px] font-semibold text-fg">{r.uf}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-fg-2">{r.leader ? r.leader.name : r.stateLabel}</span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[#e8e4dc]" aria-hidden>
                    <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${r.countedPct ?? 0}%`, background: r.state === "totalizada" ? "#8dbaf2" : "#4a8be6" }} />
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-[family-name:var(--font-num)] text-[14px] font-medium text-fg tabular-nums">{r.leader?.pct !== null && r.leader?.pct !== undefined ? `${r.leader.pct.toFixed(1).replace(".", ",")}%` : "—"}</span>
                  <span className="block text-[10.5px] text-fg-3">{r.countedPct !== null ? `${r.countedPct.toFixed(0)}% seções` : r.stateLabel}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* UF SELECIONADA: Presidente na UF + Senado + Câmara */}
      <section id="estado" aria-labelledby="est" className="mt-12 scroll-mt-20">
        <h2 id="est" className="mb-1 font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-[0.14em] text-fg-2">SENADO E CÂMARA {uf ? `· ${UF_NAME[uf].toUpperCase()}` : ""}</h2>
        <p className="mb-3 text-[11.5px] text-fg-3">Senado e Câmara são disputas por estado (regra oficial do TSE): escolha uma UF.</p>
        <nav className="mb-5 flex flex-wrap gap-1" aria-label="Escolher UF">
          {Object.keys(UF_IBGE).sort().map((u) => (
            <Link key={u} href={`?${new URLSearchParams({ ...(year !== 2026 ? { ano: String(year) } : {}), uf: u })}#estado`} scroll={false} aria-current={u === uf ? "page" : undefined} className={`h-7 min-w-9 rounded-[4px] px-2 text-center text-[12px] leading-7 ${u === uf ? "bg-fg font-semibold text-bg" : "bg-elevated/60 text-fg-2 hover:text-fg"}`}>
              {u}
            </Link>
          ))}
        </nav>
        {uf && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="uf-detail">
            <RaceCard title="Presidente" subtitle={`Votação em ${UF_NAME[uf]}`} view={ufPres} year={year} limit={5} />
            <RaceCard title="Senador" subtitle={`${UF_NAME[uf]} · ordem oficial por votos`} view={ufSen} year={year} limit={6} electedLabel="Senador" />
            <RaceCard title="Deputado Federal" subtitle={`${UF_NAME[uf]} · mais votados (eleição proporcional)`} view={ufDep} year={year} limit={10} electedLabel="Deputado Federal" note="Eleição proporcional: votos individuais não definem sozinhos as vagas; “eleito” só quando o TSE marca." />
          </div>
        )}
      </section>
    </div>
  );
}

function RaceCard({ title, subtitle, view, year, limit, electedLabel, note }: { title: string; subtitle: string; view: CountView | null; year: number; limit: number; electedLabel?: string; note?: string }) {
  const list = view ? view.candidates.slice(0, limit) : [];
  const started = !!view && (view.state === "em_apuracao" || view.state === "parcial" || view.state === "totalizada");
  return (
    <article className="rounded-[var(--radius-lg)] border border-border bg-surface/50 p-4" data-testid="race-card">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-fg">{title}</h3>
          <p className="text-[11.5px] text-fg-3">{subtitle}</p>
        </div>
        <span className="text-[10.5px] tracking-[0.08em] text-fg-3 uppercase">{view ? COUNT_STATE_LABEL[view.state] : "—"}</span>
      </header>
      {!view || !view.snapshot ? (
        <p className="text-[12.5px] text-fg-3">Não coletado.</p>
      ) : (
        <ol className="space-y-2">
          {list.map((c, i) => (
            <li key={c.sqCandidato} className="flex items-center gap-2.5">
              <span className="w-5 text-right font-[family-name:var(--font-num)] text-[12px] text-fg-3 tabular-nums">{started && c.votes.status === "value" ? i + 1 : "·"}</span>
              <CandidatePhoto year={year} sq={String(c.sqCandidato)} name={c.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-fg">{c.name}</span>
                  {c.elected === true && electedLabel && <span className="shrink-0 rounded-[3px] bg-pos px-1 text-[9.5px] font-bold tracking-[0.08em] text-[#04130b]">ELEITO · {electedLabel.toUpperCase()}</span>}
                </span>
                <span className="block text-[11px] text-fg-3">{c.party ?? "—"}</span>
              </span>
              <span className="text-right font-[family-name:var(--font-num)] text-[13px] font-medium text-fg tabular-nums">
                {c.votes.status === "value" && c.votes.value !== null ? fmtInt(c.votes.value) : c.votes.status === "not_collected" ? <span className="font-[family-name:var(--font-sans)] text-[11px] text-fg-3">Não coletado</span> : "—"}
              </span>
            </li>
          ))}
        </ol>
      )}
      {note && <p className="mt-3 text-[10.5px] text-fg-3">{note}</p>}
    </article>
  );
}
