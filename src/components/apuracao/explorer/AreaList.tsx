"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { fmtInt } from "@/lib/format";

export interface Cand {
  number: string;
  name: string;
  party: string | null;
  color: string;
}
export interface AreaRow {
  key: string;
  name: string;
  href: string;
  sub?: string;
  votes: Record<string, number>;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const PAGE = 30;

/** Lista navegável (UF, municípios, zonas ou escolas): barra empilhada por candidato na cor do partido, busca e ordenação. */
export function AreaList({ rows, cands, noun }: { rows: AreaRow[]; cands: Cand[]; noun: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"votos" | "nome">("votos");
  const [n, setN] = useState(PAGE);
  const numbers = useMemo(() => new Set(cands.map((c) => c.number)), [cands]);
  const prepared = useMemo(
    () =>
      rows.map((r) => {
        const valid = Object.entries(r.votes).reduce((a, [k, v]) => (numbers.has(k) ? a + v : a), 0);
        const parts = cands.map((c) => ({ ...c, v: r.votes[c.number] ?? 0 })).filter((c) => c.v > 0).sort((a, b) => b.v - a.v);
        return { ...r, valid, parts, lead: parts[0] ?? null };
      }),
    [rows, cands, numbers],
  );
  const list = useMemo(() => {
    const k = norm(q.trim());
    const f = prepared.filter((r) => !k || norm(r.name).includes(k) || norm(r.sub ?? "").includes(k));
    return f.sort((a, b) => (sort === "nome" ? a.name.localeCompare(b.name, "pt-BR") : b.valid - a.valid));
  }, [prepared, q, sort]);

  return (
    <div data-testid="area-list">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setN(PAGE); }} placeholder={`Buscar ${noun}…`} className="h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-[14px] text-fg placeholder:text-fg-3 focus:border-border-strong focus:outline-none sm:max-w-sm" />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-10 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-fg-2" aria-label="Ordenar">
          <option value="votos">Mais votos</option>
          <option value="nome">Nome</option>
        </select>
        <span className="text-[12px] text-fg-3">{fmtInt(list.length)} {noun}</span>
      </div>
      <ul className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
        {list.slice(0, n).map((r, i) => (
          <motion.li key={r.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 14) * 0.025, ease: [0.2, 0.7, 0.2, 1] }}>
            <Link href={r.href} scroll={false} className="group block border-t border-border/70 py-2.5 transition-colors hover:bg-elevated/60">
              <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-fg group-hover:underline">{r.name}</span>
                  {r.sub && <span className="block truncate text-[11.5px] text-fg-3">{r.sub}</span>}
                </span>
                <span className="shrink-0 text-right">
                  {r.lead && (
                    <span className="flex items-center justify-end gap-1.5 text-[12px] text-fg-2">
                      <span className="size-2 rounded-full" style={{ background: r.lead.color }} aria-hidden />
                      <span className="max-w-[9rem] truncate">{r.lead.name}</span> <b className="font-[family-name:var(--font-num)] text-fg tabular-nums">{pct((r.lead.v / Math.max(1, r.valid)) * 100)}</b>
                    </span>
                  )}
                  <span className="block text-[11px] text-fg-3 tabular-nums">{fmtInt(r.valid)} válidos</span>
                </span>
              </div>
              <div className="mx-1 flex h-2 overflow-hidden rounded-full bg-[#1f2430]" title={r.parts.map((p) => `${p.name}: ${pct((p.v / Math.max(1, r.valid)) * 100)}`).join(" · ")}>
                {r.parts.map((p, j) => (
                  <motion.span key={p.number} className="h-full" style={{ background: p.color }} initial={{ width: 0 }} animate={{ width: `${(p.v / Math.max(1, r.valid)) * 100}%` }} transition={{ duration: 0.7, delay: 0.04 * j, ease: [0.2, 0.7, 0.2, 1] }} />
                ))}
              </div>
            </Link>
          </motion.li>
        ))}
      </ul>
      {list.length > n && (
        <button type="button" onClick={() => setN((v) => v + PAGE * 2)} className="mt-4 h-10 w-full rounded-[var(--radius-md)] border border-border text-[13px] text-fg-2 hover:text-fg sm:w-auto sm:px-4">
          Mostrar mais ({fmtInt(list.length - n)})
        </button>
      )}
    </div>
  );
}
