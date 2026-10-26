import type { Metadata } from "next";
import Link from "next/link";
import { intelSql } from "@/services/intelligence";
import { countView } from "@/analytics/apuracao";
import { municipalitiesOf, municipalityName, placeRounds, placesOf, resultsByUfPlaces, validOf, zonesOf } from "@/analytics/locais";
import { UF_IBGE, UF_NAME } from "@/elections/reference";
import { StateView } from "@/components/ui/states";
import { EvidenceBadge } from "@/components/intel/EvidenceSection";
import { partyColor } from "@/components/intel/partyColors";
import { AreaList, type Cand } from "@/components/apuracao/explorer/AreaList";
import { PlacesMap } from "@/components/apuracao/explorer/PlacesMap";
import { ZoomIn } from "@/components/apuracao/explorer/ZoomIn";
import { CandidatePhoto } from "@/components/apuracao/CandidatePhoto";
import { fmtInt } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explorar resultados" };

const int = (v: unknown) => (typeof v === "string" && /^\d{1,7}$/.test(v) ? Number(v) : null);
const pct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;

/**
 * EXPLORAR — Brasil › UF › município › zona › escola (local de votação). Presidente, votação OFICIAL por seção do TSE
 * somada por local. Cor = partido de quem lidera; nada é estimado (sem dado ⇒ estado explícito).
 */
export default async function Explorar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const year = Number(sp.ano) || 2026;
  const uf = typeof sp.uf === "string" && (sp.uf.toUpperCase() in UF_IBGE || sp.uf.toUpperCase() === "ZZ") ? sp.uf.toUpperCase() : null;
  const mun = uf ? int(sp.mun) : null;
  const zona = mun ? int(sp.zona) : null;
  const local = zona ? int(sp.local) : null;
  const sql = await intelSql();
  if (!sql)
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
        <StateView state="provider_unavailable" title="Fonte indisponível neste ambiente">A base oficial (TSE) não está disponível aqui.</StateView>
      </div>
    );
  const rounds = await placeRounds(sql, year);
  const round = sp.turno === "2" && rounds.includes(2) ? 2 : rounds.includes(1) ? 1 : (rounds[0] ?? 1);
  const br = await countView(sql, { year, round, officeId: 1, territoryId: 0 });
  // Lista oficial de candidaturas válidas do turno (cor = partido; ordem estável pelo nº de urna).
  const cands: Cand[] = br.candidates
    .filter((c) => c.ballotNumber !== null && (c.voteDestination === null || c.voteDestination === "Válido"))
    .sort((a, b) => (a.ballotNumber ?? 0) - (b.ballotNumber ?? 0))
    .map((c, i) => ({ number: String(c.ballotNumber), name: c.name, party: c.party, color: partyColor(c.party, i) }));
  const sqByNumber = new Map(br.candidates.map((c) => [String(c.ballotNumber), String(c.sqCandidato)]));
  const numbers = new Set(cands.map((c) => c.number));
  const q = (o: Record<string, string | number | null>) => `?${new URLSearchParams(Object.entries({ ...(year !== 2026 ? { ano: year } : {}), ...(round === 2 ? { turno: 2 } : {}), ...o }).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)]))}`;

  if (!rounds.length)
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
        <StateView state="no_data" title="Votação por local ainda não publicada">O TSE publica a votação por seção depois da totalização.</StateView>
      </div>
    );

  const munInfo = mun ? await municipalityName(sql, mun) : null;
  const level = local ? "local" : zona ? "zona" : mun ? "mun" : uf ? "uf" : "br";
  const [areas, places] = await Promise.all([
    level === "br" ? resultsByUfPlaces(sql, { year, round }) : level === "uf" ? municipalitiesOf(sql, { year, round, uf: uf! }) : level === "mun" ? zonesOf(sql, { year, round, municipality: mun! }) : Promise.resolve([]),
    mun ? placesOf(sql, { year, round, municipality: mun, zone: zona }) : Promise.resolve([]),
  ]);
  const ufName = uf === "ZZ" ? "Exterior" : uf ? UF_NAME[uf] : null;
  const crumbs = [
    { label: "Brasil", href: q({}) },
    ...(uf ? [{ label: ufName!, href: q({ uf }) }] : []),
    ...(mun && munInfo ? [{ label: munInfo.name, href: q({ uf, mun }) }] : []),
    ...(zona ? [{ label: `Zona ${zona}`, href: q({ uf, mun, zona }) }] : []),
  ];
  const sel = local ? places.find((p) => p.place === local) : null;
  const mapPlaces = places.filter((p) => p.lat !== null && p.lon !== null).map((p) => ({ key: p.key, name: p.name, href: q({ uf, mun, zona: p.zone, local: p.place }), lat: p.lat!, lon: p.lon!, votes: p.votes }));

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 md:px-6">
      <header className="pt-6 pb-4">
        <nav aria-label="Trilha" className="flex flex-wrap items-center gap-1 text-[13px]">
          {crumbs.map((c, i) => (
            <span key={c.href} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-fg-3">›</span>}
              <Link href={c.href} scroll={false} className={i === crumbs.length - 1 && !sel ? "font-semibold text-fg" : "text-fg-2 hover:text-fg hover:underline"}>
                {c.label}
              </Link>
            </span>
          ))}
          {sel && (
            <span className="inline-flex items-center gap-1">
              <span className="text-fg-3">›</span>
              <span className="font-semibold text-fg">{sel.name}</span>
            </span>
          )}
        </nav>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-[24px] leading-tight font-bold text-fg md:text-[30px]">{sel ? sel.name : (crumbs[crumbs.length - 1]?.label ?? "Brasil")}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3">
          <EvidenceBadge kind="oficial" source="TSE" />
          <span>Presidente · {round}º turno · votação por seção somada por local (TSE · Dados Abertos)</span>
          {rounds.length > 1 && (
            <span className="inline-flex gap-1">
              {rounds.map((r) => (
                <Link key={r} href={`?${new URLSearchParams({ ...(uf ? { uf } : {}), ...(mun ? { mun: String(mun) } : {}), ...(zona ? { zona: String(zona) } : {}), ...(r === 2 ? { turno: "2" } : {}) })}`} className={`rounded-full px-2 py-0.5 ${r === round ? "bg-fg text-bg" : "border border-border"}`}>
                  {r}º turno
                </Link>
              ))}
            </span>
          )}
          {year === 2026 && !rounds.includes(2) && (
            <span className="rounded-full border border-border bg-elevated px-2 py-0.5 text-fg-2">2º turno por escola: o TSE ainda não publicou a votação por seção — entra aqui assim que sair</span>
          )}
        </p>
      </header>

      <ZoomIn k={`${level}-${uf}-${mun}-${zona}-${local}`}>
        {sel && <PlaceCard place={sel} cands={cands} numbers={numbers} year={year} sqByNumber={sqByNumber} />}

        {mun && mapPlaces.length > 0 && (
          <section className="mt-6" aria-label="Mapa das escolas">
            <PlacesMap places={mapPlaces} cands={cands} selected={sel?.key ?? null} outline={uf && uf !== "ZZ" && munInfo ? { uf, name: munInfo.name } : null} />
          </section>
        )}

        {level !== "local" && level !== "zona" && (
          <section className="mt-6">
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-[0.14em] text-fg-2 uppercase">{level === "br" ? "Estados" : level === "uf" ? "Municípios" : "Zonas eleitorais"}</h2>
            <AreaList
              noun={level === "br" ? "estados" : level === "uf" ? "municípios" : "zonas"}
              cands={cands}
              rows={areas.map((a) => ({
                key: a.key,
                name: level === "br" ? (a.key === "ZZ" ? "Exterior" : (UF_NAME[a.key] ?? a.key)) : a.name,
                sub: `${fmtInt(a.places)} locais · ${fmtInt(a.sections)} seções`,
                href: level === "br" ? q({ uf: a.key }) : level === "uf" ? q({ uf, mun: Number(a.key) }) : q({ uf, mun, zona: Number(a.key) }),
                votes: a.votes,
              }))}
            />
          </section>
        )}

        {mun && level !== "local" && (
          <section className="mt-8">
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-[0.14em] text-fg-2 uppercase">Locais de votação (escolas)</h2>
            <AreaList noun="escolas" cands={cands} rows={places.map((p) => ({ key: p.key, name: p.name, sub: [p.address, p.neighborhood, `Zona ${p.zone}`].filter(Boolean).join(" · "), href: q({ uf, mun, zona: p.zone, local: p.place }), votes: p.votes }))} />
          </section>
        )}
      </ZoomIn>
      <p className="mt-10 text-[11px] text-fg-3">Válidos = votos nos números da lista oficial de candidaturas do turno; brancos (95), nulos (96) e números com votos anulados ficam fora, como no total oficial.</p>
    </div>
  );
}

function PlaceCard({ place, cands, numbers, year, sqByNumber }: { place: Awaited<ReturnType<typeof placesOf>>[number]; cands: Cand[]; numbers: Set<string>; year: number; sqByNumber: Map<string, string> }) {
  const valid = validOf(place.votes, numbers);
  const total = Object.values(place.votes).reduce((a, b) => a + b, 0);
  const rows = cands.map((c) => ({ ...c, v: place.votes[c.number] ?? 0 })).filter((c) => c.v > 0).sort((a, b) => b.v - a.v);
  return (
    <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-sm" data-testid="place-card">
      <p className="text-[12.5px] text-fg-2">{[place.address, place.neighborhood].filter(Boolean).join(" · ") || "Endereço não informado pelo TSE"}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
        {[
          ["Seções", fmtInt(place.sections)],
          ["Eleitores aptos", place.electorate === null ? "—" : fmtInt(place.electorate)],
          ["Votos (todos)", fmtInt(total)],
          ["Comparecimento", place.electorate ? pct((total / place.electorate) * 100) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[var(--radius-md)] bg-elevated px-3 py-2">
            <dt className="text-fg-3">{k}</dt>
            <dd className="font-[family-name:var(--font-num)] text-[16px] font-semibold text-fg tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <ol className="mt-4 space-y-2.5">
        {rows.map((c) => (
          <li key={c.number} className="flex items-center gap-3">
            <CandidatePhoto year={year} sq={sqByNumber.get(c.number) ?? "0"} name={c.name} size={36} ring={c.color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate font-medium text-fg">{c.name} <span className="text-fg-3">· {c.party}</span></span>
                <span className="font-[family-name:var(--font-num)] font-semibold text-fg tabular-nums">{pct((c.v / Math.max(1, valid)) * 100)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#e8e4dc]">
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(c.v / Math.max(1, valid)) * 100}%`, background: c.color }} />
              </div>
              <span className="text-[11px] text-fg-3 tabular-nums">{fmtInt(c.v)} votos</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-fg-3">Brancos: {fmtInt(place.votes["95"] ?? 0)} · Nulos: {fmtInt(place.votes["96"] ?? 0)}</p>
    </article>
  );
}
