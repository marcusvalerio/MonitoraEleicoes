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

      <div className="relative grid grid-cols-2 items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
        <Side s={a} year={year} align="left" />
        <div className="hidden pb-2 text-center md:order-none md:block">
          <motion.p key={headline} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="font-[family-name:var(--font-display)] text-[30px] leading-tight font-bold tracking-tight" style={{ color: decided ? a.color : "#fff" }}>{headline}</motion.p>
        </div>
        <Side s={b} year={year} align="right" />
      </div>

      <p className="relative mt-3 text-center font-[family-name:var(--font-display)] text-[22px] leading-tight font-bold tracking-tight md:hidden" style={{ color: decided ? a.color : "#fff" }}>{headline}</p>

      <div className="relative mt-5 h-3 overflow-hidden rounded-full bg-white/10 md:h-4" role="img" aria-label={`${a.name} ${pct(a.pct)} × ${b.name} ${pct(b.pct)}`}>
        <motion.div className="absolute inset-y-0 left-0" style={{ background: a.color }} initial={{ width: "50%" }} animate={{ width: `${wa}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
        <motion.div className="absolute inset-y-0 right-0" style={{ background: b.color }} initial={{ width: "50%" }} animate={{ width: `${100 - wa}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
        <span className="absolute inset-y-[-4px] left-1/2 w-0.5 -translate-x-1/2 bg-white" aria-hidden />
        
      </div>

      <div className="relative mt-3 h-[3px] overflow-hidden rounded-full bg-white/10" aria-label="Seções apuradas">
        <motion.div className="h-full bg-[#3ddc84]" initial={{ width: 0 }} animate={{ width: `${countedPct ?? 0}%` }} transition={{ duration: 1.2 }} />
      </div>
      <p className="relative mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] leading-snug text-white/50">
        <span>{pct(countedPct)} apurado{remaining !== null && remaining > 0 ? ` · faltam ${fmtInt(remaining)} eleitores` : ""}</span>
        <span>
          {status === "eleito" ? "Eleito · marcação oficial do TSE" : status === "definido" ? "Definido pela conta · confirmação oficial quando o TSE marcar" : "Dados oficiais · TSE"}
        </span>
      </p>
    </section>
  );
}

function Side({ s, year, align }: { s: HeroSide; year: number; align: "left" | "right" }) {
  const r = align === "right";
  return (
    <div className={`flex min-w-0 flex-col gap-2 md:flex-row md:items-end md:gap-4 ${r ? "items-end text-right md:flex-row-reverse" : "items-start"}`}>
      <span className="shrink-0 overflow-hidden rounded-full ring-[3px] ring-offset-2 ring-offset-[#0d0f14]" style={{ ["--tw-ring-color" as string]: s.color }}>
        <span className="block md:hidden"><CandidatePhoto year={year} sq={s.sq} name={s.name} size={52} /></span>
        <span className="hidden md:block"><CandidatePhoto year={year} sq={s.sq} name={s.name} size={76} /></span>
      </span>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium tracking-[0.06em] text-white/80 uppercase md:text-[13px]">{titleCase(s.name)} <span className="text-white/40">{s.number ?? ""}</span></p>
        <p className="font-[family-name:var(--font-num)] text-[34px] leading-[1.05] font-bold tracking-tight tabular-nums md:text-[52px]" style={{ color: s.color }}>{pct(s.pct)}</p>
        <p className="text-[11px] text-white/50 tabular-nums">{s.votes === null ? "—" : `${fmtInt(s.votes)} votos`}</p>
      </div>
    </div>
  );
}

const titleCase = (n: string) => n.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
