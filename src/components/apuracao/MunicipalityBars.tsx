"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { fmtInt } from "@/lib/format";

export interface MunicipalityRow {
  key: string;
  name: string;
  validVotes: number | null;
  countedPct: number | null;
  /** fatias por candidato (ordem fixa = identidade), % dos válidos */
  parts: { name: string; color: string; pct: number }[];
}

const PAGE = 24;

/** Municípios da UF: barra empilhada com a divisão oficial dos votos válidos. Busca por nome; ordenação por votos. */
export function MunicipalityBars({ rows }: { rows: MunicipalityRow[] }) {
  const [q, setQ] = useState("");
  const [n, setN] = useState(PAGE);
  const list = useMemo(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const k = norm(q.trim());
    return rows.filter((r) => !k || norm(r.name).includes(k)).sort((a, b) => (b.validVotes ?? -1) - (a.validVotes ?? -1));
  }, [rows, q]);
  if (!rows.length) return <p className="text-[12.5px] text-fg-3">Resultados por município ainda não coletados para esta UF.</p>;
  return (
    <div data-testid="municipality-bars">
      <input value={q} onChange={(e) => { setQ(e.target.value); setN(PAGE); }} placeholder={`Buscar entre ${fmtInt(rows.length)} municípios…`} className="mb-3 h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-[13px] text-fg placeholder:text-fg-3 focus:border-border-strong focus:outline-none sm:max-w-sm" />
      <ul className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
        {list.slice(0, n).map((r, i) => (
          <motion.li key={r.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 16) * 0.02 }} className="border-t border-border/60 py-2">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="truncate text-fg-2">{r.name}</span>
              <span className="shrink-0 font-[family-name:var(--font-num)] text-fg tabular-nums">{r.validVotes === null ? "—" : fmtInt(r.validVotes)}<span className="ml-1 text-[10.5px] text-fg-3">{r.countedPct !== null && r.countedPct < 100 ? `${r.countedPct.toFixed(0)}% seções` : ""}</span></span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-[#1a1a1e]" title={r.parts.map((p) => `${p.name}: ${p.pct.toFixed(1).replace(".", ",")}%`).join(" · ")}>
              {r.parts.map((p, j) => (
                <motion.span key={p.name} className="h-full" style={{ background: p.color }} initial={{ width: 0 }} animate={{ width: `${p.pct}%` }} transition={{ duration: 0.7, delay: 0.05 * j, ease: [0.2, 0.7, 0.2, 1] }} />
              ))}
            </div>
          </motion.li>
        ))}
      </ul>
      {list.length > n && (
        <button type="button" onClick={() => setN((v) => v + PAGE * 2)} className="mt-3 h-8 rounded-[var(--radius-md)] border border-border px-3 text-[12px] text-fg-2 hover:text-fg">
          Mostrar mais ({fmtInt(list.length - n)})
        </button>
      )}
    </div>
  );
}
