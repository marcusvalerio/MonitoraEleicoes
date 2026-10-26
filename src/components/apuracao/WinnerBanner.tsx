"use client";

import { motion } from "motion/react";
import { Celebration } from "./Celebration";

/** Faixa de resultado OFICIAL: só aparece quando o arquivo do TSE marca a candidatura como eleita. */
export function WinnerBanner({ sq, name, party, pct, color, round, pending, remaining }: { sq: string; name: string; party: string | null; pct: number | null; color: string; round: number; pending?: boolean; remaining?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="relative mt-4 overflow-hidden rounded-[var(--radius-lg)] border p-4 sm:p-6"
      style={{ borderColor: color, background: `linear-gradient(120deg, ${color}22, transparent 70%)` }}
      data-testid="winner-banner"
    >
      <div className="pointer-events-none absolute -top-6 right-2 sm:right-10"><Celebration seed={`banner-${sq}`} /></div>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-3 uppercase">{pending ? `Resultado matematicamente definido · ${round}º turno` : `Eleito · ${round}º turno · resultado oficial do TSE`}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-[26px] leading-tight font-semibold text-fg sm:text-[34px]">
        {name} {party && <span className="text-fg-2">({party})</span>}
      </p>
      {pct !== null && <p className="mt-1 font-[family-name:var(--font-num)] text-[15px] text-fg-2 tabular-nums">{pct.toFixed(2).replace(".", ",")}% dos votos válidos</p>}
      {pending && <p className="mt-2 text-[11.5px] text-fg-3">A diferença de votos já é maior que todo o eleitorado das seções ainda não totalizadas ({(remaining ?? 0).toLocaleString("pt-BR")} eleitores). A marcação oficial “eleito” aparece quando o TSE publicar no arquivo de resultados.</p>}
    </motion.div>
  );
}
