"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { fmtInt } from "@/lib/format";

export interface CompareFinalist {
  sq: string;
  name: string;
  party: string | null;
  color: string;
  first: { votes: number; pct: number | null } | null;
  second: { votes: number; pct: number | null } | null;
}
export interface CompareRow {
  key: string;
  name: string;
  /** por sq do finalista */
  first: Record<string, { votes: number; pct: number | null } | null>;
  second: Record<string, { votes: number; pct: number | null } | null>;
}

const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : `${v.toFixed(d).replace(".", ",")}%`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1).replace(".", ",")} p.p.`;
const ease = [0.2, 0.7, 0.2, 1] as const;

/**
 * 1º × 2º turno dos finalistas: % dos válidos e votos em cada turno, lado a lado — números oficiais do TSE.
 * A variação é aritmética (2º − 1º). Não há inferência de transferência de votos nem de causa.
 */
export function RoundCompare({ finalists, rows, secondPartial }: { finalists: CompareFinalist[]; rows: CompareRow[]; secondPartial: boolean }) {
  const [focus, setFocus] = useState(finalists[0]?.sq ?? "");
  const [sort, setSort] = useState<"delta" | "nome">("delta");
  const f = finalists.find((x) => x.sq === focus) ?? finalists[0];
  const sorted = useMemo(() => {
    const d = (r: CompareRow) => {
      const a = r.first[f.sq]?.pct;
      const b = r.second[f.sq]?.pct;
      return a !== null && a !== undefined && b !== null && b !== undefined ? b - a : -Infinity;
    };
    return [...rows].sort((x, y) => (sort === "nome" ? x.name.localeCompare(y.name, "pt-BR") : d(y) - d(x)));
  }, [rows, sort, f.sq]);

  return (
    <div data-testid="round-compare">
      {/* Nacional */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {finalists.map((c, i) => {
          const d = c.first?.pct != null && c.second?.pct != null ? c.second.pct - c.first.pct : null;
          return (
            <motion.article
              key={c.sq}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, delay: i * 0.08, ease }}
              className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60 p-5"
            >
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: c.color }} aria-hidden />
              <header className="flex items-baseline justify-between gap-3">
                <h3 className="font-[family-name:var(--font-display)] text-[17px] font-semibold text-fg">{c.name}</h3>
                <span className="text-[11.5px] text-fg-3">{c.party ?? ""}</span>
              </header>
              <div className="mt-4 space-y-3">
                {(["first", "second"] as const).map((r) => {
                  const v = c[r];
                  return (
                    <div key={r}>
                      <div className="mb-1 flex items-baseline justify-between text-[11.5px] text-fg-3">
                        <span>{r === "first" ? "1º turno" : `2º turno${secondPartial ? " · em apuração" : ""}`}</span>
                        <span>{v ? `${fmtInt(v.votes)} votos` : "não coletado"}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#1d1d21]">
                          <motion.div className="h-full rounded-full" style={{ background: c.color, opacity: r === "first" ? 0.55 : 1 }} initial={{ width: 0 }} whileInView={{ width: `${v?.pct ?? 0}%` }} viewport={{ once: true }} transition={{ duration: 1.1, delay: 0.15 + (r === "second" ? 0.15 : 0), ease }} />
                        </div>
                        <span className="w-16 text-right font-[family-name:var(--font-num)] text-[18px] font-semibold text-fg tabular-nums">{pct(v?.pct)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {d !== null && <p className={`mt-3 text-[12px] font-medium ${d >= 0 ? "text-pos" : "text-neg"}`}>{signed(d)} entre os turnos</p>}
            </motion.article>
          );
        })}
      </div>

      {/* Por UF */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full border border-border bg-surface/70 p-0.5 text-[12px]" role="radiogroup" aria-label="Candidato em foco">
          {finalists.map((c) => (
            <button key={c.sq} type="button" role="radio" aria-checked={focus === c.sq} onClick={() => setFocus(c.sq)} className={`relative z-10 inline-flex h-7 items-center gap-1.5 rounded-full px-3 ${focus === c.sq ? "text-bg" : "text-fg-2 hover:text-fg"}`}>
              {focus === c.sq && <motion.span layoutId="cmp-pill" className="absolute inset-0 -z-10 rounded-full bg-fg" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
              {c.name}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11.5px] text-fg-3">
          Ordenar
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-7 rounded-[4px] border border-border bg-surface px-2 text-[12px] text-fg-2">
            <option value="delta">maior variação</option>
            <option value="nome">nome</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11.5px] text-fg-3">Barra clara = 1º turno · barra cheia = 2º turno · % dos votos válidos em cada turno.</p>
      <motion.ul layout className="mt-3 grid grid-cols-1 gap-x-8 md:grid-cols-2" data-testid="round-compare-rows">
        {sorted.map((r) => {
          const a = r.first[f.sq]?.pct ?? null;
          const b = r.second[f.sq]?.pct ?? null;
          const d = a !== null && b !== null ? b - a : null;
          return (
            <motion.li layout key={r.key} transition={{ type: "spring", stiffness: 300, damping: 32 }} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_4.5rem] items-center gap-3 border-t border-border/60 py-2">
              <span className="truncate text-[12.5px] text-fg-2">{r.name}</span>
              <span className="relative h-3" aria-hidden>
                <span className="absolute inset-y-[3px] left-0 w-full rounded-full bg-[#1a1a1e]" />
                {a !== null && <motion.span className="absolute inset-y-[3px] left-0 rounded-full" style={{ background: f.color, opacity: 0.35 }} initial={{ width: 0 }} animate={{ width: `${a}%` }} transition={{ duration: 0.8, ease }} />}
                {b !== null && <motion.span className="absolute inset-y-[5px] left-0 rounded-full" style={{ background: f.color }} initial={{ width: 0 }} animate={{ width: `${b}%` }} transition={{ duration: 0.9, delay: 0.08, ease }} />}
                <span className="absolute inset-y-0 left-1/2 w-px bg-fg-3/40" />
              </span>
              <span className={`text-right font-[family-name:var(--font-num)] text-[12.5px] tabular-nums ${d === null ? "text-fg-3" : d >= 0 ? "text-pos" : "text-neg"}`} title={`1º: ${pct(a)} · 2º: ${pct(b)}`}>
                {d === null ? "—" : signed(d)}
              </span>
            </motion.li>
          );
        })}
      </motion.ul>
      <p className="mt-4 text-[10.5px] text-fg-3">Comparação aritmética entre resultados oficiais (TSE) de cada turno. Não indica para onde foram os votos de quem não disputou o 2º turno.</p>
    </div>
  );
}
