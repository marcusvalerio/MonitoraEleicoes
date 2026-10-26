"use client";

import { motion } from "motion/react";
import { CandidatePhoto } from "./CandidatePhoto";
import { Celebration } from "./Celebration";
import { fmtInt } from "@/lib/format";

export interface HeroSide {
  sq: string;
  name: string;
  party: string | null;
  number: number | null;
  votes: number | null;
  pct: number | null;
  color: string;
}

const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}%`);

/**
 * Cabo de guerra do 2º turno: barra única dividida pelos % oficiais dos válidos, marca dos 50% e a manchete.
 * status "eleito" = marcação do TSE; "definido" = diferença maior que o eleitorado das seções não totalizadas
 * (conta com números oficiais, confirmada quando o TSE marcar); "apurando" = nenhum dos dois.
 */
export function RaceHero({ year, a, b, countedPct, status, remaining }: { year: number; a: HeroSide; b: HeroSide; countedPct: number | null; status: "eleito" | "definido" | "apurando"; remaining: number | null }) {
  const wa = a.pct ?? 50;
  const decided = status !== "apurando";
  const headline = decided ? `${titleCase(a.name)} é eleito presidente` : countedPct === null ? "Aguardando os primeiros números" : `${pct(countedPct)} das seções apuradas`;
  return (
    <section className="relative -mx-4 mb-6 overflow-hidden bg-[#0d0f14] px-4 pt-5 pb-6 text-white md:-mx-6 md:rounded-b-[var(--radius-lg)] md:px-8 md:pt-7 md:pb-8" data-testid="race-hero">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: `radial-gradient(60% 120% at 0% 0%, ${a.color}55, transparent 60%), radial-gradient(60% 120% at 100% 0%, ${b.color}55, transparent 60%)` }} aria-hidden />
      {decided && <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2"><Celebration seed={`hero-${a.sq}-${status}`} /></div>}

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <Side s={a} year={year} align="left" />
        <div className="hidden pb-2 text-center md:block">
          <motion.p key={headline} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="font-[family-name:var(--font-display)] text-[26px] leading-tight font-bold italic" style={{ color: decided ? a.color : "#fff" }}>{headline}</motion.p>
        </div>
        <Side s={b} year={year} align="right" />
      </div>

      <p className="relative mt-3 text-center font-[family-name:var(--font-display)] text-[19px] font-bold italic md:hidden" style={{ color: decided ? a.color : "#fff" }}>{headline}</p>

      <div className="relative mt-4 h-5 overflow-hidden rounded-full bg-white/10 md:h-7" role="img" aria-label={`${a.name} ${pct(a.pct)} × ${b.name} ${pct(b.pct)}`}>
        <motion.div className="absolute inset-y-0 left-0" style={{ background: a.color }} initial={{ width: "50%" }} animate={{ width: `${wa}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
        <motion.div className="absolute inset-y-0 right-0" style={{ background: b.color }} initial={{ width: "50%" }} animate={{ width: `${100 - wa}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
        <span className="absolute inset-y-[-4px] left-1/2 w-0.5 -translate-x-1/2 bg-white" aria-hidden />
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-1.5 text-[9px] font-bold text-black md:text-[10px]">50%</span>
      </div>

      <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/10" aria-label="Seções apuradas">
        <motion.div className="h-full bg-[#3ddc84]" initial={{ width: 0 }} animate={{ width: `${countedPct ?? 0}%` }} transition={{ duration: 1.2 }} />
      </div>
      <p className="relative mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-white/60">
        <span>{pct(countedPct)} apurado{remaining !== null && remaining > 0 ? ` · faltam ${fmtInt(remaining)} eleitores` : ""}</span>
        <span>
          {status === "eleito" ? "Eleito · marcação oficial do TSE" : status === "definido" ? "Definido pela conta: diferença maior que todos os votos que faltam · confirmação quando o TSE marcar" : "Dados oficiais · TSE"}
        </span>
      </p>
    </section>
  );
}

function Side({ s, year, align }: { s: HeroSide; year: number; align: "left" | "right" }) {
  const r = align === "right";
  return (
    <div className={`flex min-w-0 items-end gap-3 ${r ? "flex-row-reverse text-right" : ""}`}>
      <span className="shrink-0 overflow-hidden rounded-[14px] ring-2" style={{ ["--tw-ring-color" as string]: s.color }}>
        <CandidatePhoto year={year} sq={s.sq} name={s.name} size={64} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold md:text-[16px]">{titleCase(s.name)} <span className="text-white/50">{s.number ?? ""}</span></p>
        <p className="font-[family-name:var(--font-num)] text-[30px] leading-none font-bold tabular-nums md:text-[48px]" style={{ color: s.color }}>{pct(s.pct)}</p>
        <p className="mt-1 text-[11px] text-white/60 tabular-nums">{s.votes === null ? "—" : `${fmtInt(s.votes)} votos`}</p>
      </div>
    </div>
  );
}

const titleCase = (n: string) => n.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
