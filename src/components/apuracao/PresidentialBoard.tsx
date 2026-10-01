"use client";

import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Star } from "lucide-react";
import { CandidatePhoto } from "./CandidatePhoto";
import { NumberTicker } from "./NumberTicker";
import { Celebration } from "./Celebration";
import { useFollow } from "./follow";

export interface BoardCandidate {
  sq: string;
  personId: number | null;
  ballotName: string;
  name: string;
  party: string | null;
  number: number | null;
  votes: number | null;
  votesStatus: string;
  pct: number | null;
  position: number | null;
  elected: boolean | null;
  situation: string | null;
  color: string;
}

/**
 * Candidaturas presidenciais na ORDEM OFICIAL (votos do TSE). "À frente" só com votos apurados e sem totalização;
 * "ELEITO" somente quando o arquivo oficial marca a candidatura como eleita. Estrela = acompanhar (não reordena).
 */
export function PresidentialBoard({ year, officeLabel, candidates, started, final }: { year: number; officeLabel: string; candidates: BoardCandidate[]; started: boolean; final: boolean }) {
  const reduce = useReducedMotion();
  const { isFollowed, toggle } = useFollow(year);
  const top = Math.max(1, ...candidates.map((c) => c.pct ?? 0));
  return (
    <LayoutGroup>
      <ol className="divide-y divide-border/70" data-testid="presidential-board">
        {candidates.map((c) => {
          const followed = isFollowed(c.sq);
          const leading = started && !final && c.position === 1;
          return (
            <motion.li key={c.sq} layout={reduce ? false : "position"} transition={{ type: "spring", stiffness: 380, damping: 38 }} className={`relative grid grid-cols-[28px_auto_minmax(0,1fr)_auto] items-center gap-x-3 py-3 ${followed ? "bg-[#f5f1e3]/[0.03]" : ""}`} data-testid="board-row" data-sq={c.sq}>
              <span className="text-center font-[family-name:var(--font-num)] text-[15px] font-medium text-fg-3 tabular-nums">{c.position ?? "—"}</span>
              <span className="relative">
                <CandidatePhoto year={year} sq={c.sq} name={c.ballotName} size={48} ring={c.color} />
                {c.elected && <Celebration seed={c.sq} />}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={`truncate font-[family-name:var(--font-display)] text-[16px] leading-tight text-fg ${leading || c.elected ? "font-bold" : "font-semibold"}`}>{c.ballotName}</span>
                  {c.elected && (
                    <span className="rounded-[3px] bg-pos px-1.5 py-px font-[family-name:var(--font-display)] text-[10.5px] font-bold tracking-[0.12em] text-[#04130b]" data-testid="elected-badge">
                      ELEITO · {officeLabel.toUpperCase()}
                    </span>
                  )}
                  {leading && <span className="rounded-[3px] border border-fg/30 px-1.5 py-px text-[10px] font-semibold tracking-[0.12em] text-fg">À FRENTE</span>}
                  {final && !c.elected && c.situation && <span className="text-[10.5px] tracking-[0.06em] text-fg-3 uppercase">{c.situation}</span>}
                </span>
                <span className="block truncate text-[11.5px] text-fg-3">
                  {c.party ?? "—"}
                  {c.number !== null ? ` · ${c.number}` : ""}
                  {c.name && c.name !== c.ballotName ? ` · ${c.name}` : ""}
                </span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[#1d1d21]" aria-hidden>
                  <span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${c.pct !== null ? (c.pct / top) * 100 : 0}%`, background: c.color }} />
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-right">
                  <NumberTicker value={c.pct} digits={2} suffix="%" empty={c.votesStatus === "not_collected" ? "Não coletado" : "—"} className={`block text-[22px] leading-none text-fg ${c.elected || leading ? "font-bold" : c.position !== null && c.position <= 2 ? "font-semibold" : "font-medium"}`} />
                  <span className="mt-1 block text-[11px] text-fg-3">{c.votes !== null ? <NumberTicker value={c.votes} className="text-[11.5px]" /> : null}{c.votes !== null ? " votos" : ""}</span>
                </span>
                <button type="button" onClick={() => toggle({ sq: c.sq, name: c.ballotName, officeId: 1 })} aria-pressed={followed} aria-label={followed ? `Deixar de acompanhar ${c.ballotName}` : `Acompanhar ${c.ballotName}`} className={`rounded-full p-1.5 transition-colors ${followed ? "text-[#e7c35a]" : "text-fg-3 hover:text-fg"}`} data-testid="follow-toggle">
                  <Star size={16} fill={followed ? "currentColor" : "none"} aria-hidden />
                </button>
              </span>
            </motion.li>
          );
        })}
      </ol>
    </LayoutGroup>
  );
}
