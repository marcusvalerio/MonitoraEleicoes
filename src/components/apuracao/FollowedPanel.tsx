"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { CandidatePhoto } from "./CandidatePhoto";
import { useFollow } from "./follow";
import { fmtInt } from "@/lib/format";

interface Status {
  sq: string;
  personId: number | null;
  office: string;
  uf: string;
  ballotName: string;
  party: string | null;
  phase: string | null;
  votes: { value: number | null; status: string };
  pct: { value: number | null; status: string };
  position: number | null;
  of: number | null;
  elected: boolean | null;
}

/** SEU ACOMPANHAMENTO — situação oficial das candidaturas marcadas (posição na própria disputa; ranking geral intocado). */
export function FollowedPanel({ year, round, refreshKey }: { year: number; round: number; refreshKey: string }) {
  const { list, toggle } = useFollow(year);
  const [data, setData] = useState<Status[] | null>(null);
  const sqs = list.map((x) => x.sq).join(",");
  useEffect(() => {
    let alive = true;
    if (!sqs) {
      queueMicrotask(() => alive && setData([]));
      return () => {
        alive = false;
      };
    }
    fetch(`/api/apuracao/acompanhados?ano=${year}&turno=${round}&sq=${sqs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => alive && setData(j.data))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [sqs, year, round, refreshKey]);
  return (
    <section aria-label="Seu acompanhamento" data-testid="followed-panel">
      <h2 className="mb-2 flex items-center gap-2 font-[family-name:var(--font-display)] text-[12px] font-semibold tracking-[0.14em] text-[#e7c35a]">
        <Star size={13} fill="currentColor" aria-hidden /> SEU ACOMPANHAMENTO
      </h2>
      {!list.length ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border px-3 py-3 text-[12.5px] text-fg-3">
          Toque em <Star size={12} className="inline align-[-1px]" aria-hidden /> ao lado de uma candidatura para acompanhá-la aqui. Isso não altera a classificação oficial.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {list.map((l) => data?.find((d) => d.sq === l.sq) ?? ({ sq: l.sq, ballotName: l.name } as Status)).map((s) => (
            <li key={s.sq} className="flex items-center gap-3 rounded-[var(--radius)] border border-[#e7c35a]/25 bg-[#e7c35a]/[0.04] px-3 py-2.5">
              <CandidatePhoto year={year} sq={s.sq} name={s.ballotName} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {s.personId ? <Link href={`/candidatos/${s.personId}`} className="truncate font-[family-name:var(--font-display)] text-[14px] font-semibold text-fg hover:underline">{s.ballotName}</Link> : <span className="truncate font-[family-name:var(--font-display)] text-[14px] font-semibold text-fg">{s.ballotName}</span>}
                  {s.elected && <span className="rounded-[3px] bg-pos px-1 text-[9.5px] font-bold tracking-[0.1em] text-[#04130b]">ELEITO</span>}
                </span>
                <span className="block truncate text-[11.5px] text-fg-3">{[s.office, s.uf, s.party].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="text-right text-[11.5px] text-fg-3">
                {s.position !== null && s.position !== undefined ? (
                  <>
                    <span className="block font-[family-name:var(--font-num)] text-[16px] font-semibold text-fg tabular-nums">{s.position}º</span>
                    posição oficial{s.of ? ` de ${s.of}` : ""}
                    {s.votes?.value !== null && s.votes?.value !== undefined && <span className="block tnum">{fmtInt(s.votes.value)} votos</span>}
                  </>
                ) : (
                  <span>{s.phase === "not_started" ? "Não iniciada" : "Não coletado"}</span>
                )}
              </span>
              <button type="button" onClick={() => toggle({ sq: s.sq, name: s.ballotName, officeId: 0 })} aria-label={`Deixar de acompanhar ${s.ballotName}`} className="text-[#e7c35a] hover:text-fg">
                <Star size={15} fill="currentColor" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
