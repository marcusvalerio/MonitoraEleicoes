"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { normName } from "@/geo/names";
import { fmtInt } from "@/lib/format";

export interface MunResult {
  /** código TSE do município */
  tse: string;
  name: string;
  valid: number;
  leader: { name: string; party: string | null; color: string; pct: number } | null;
}
interface Malha {
  viewBox: string;
  municipios: { ibge: string; nome: string; key: string; d: string }[];
}

/**
 * Mapa da UF dividido por município (malha oficial do IBGE), colorido pelo partido de quem lidera em cada um.
 * Município sem resultado oficial fica neutro (nunca colorido por estimativa). Clique ⇒ explorar até a escola.
 */
export function StateMunicipalMap({ uf, rows, roundLabel }: { uf: string; rows: MunResult[]; roundLabel: string }) {
  const [malha, setMalha] = useState<Malha | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/malha/${uf}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((m: Malha) => live && setMalha(m))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [uf]);
  const byName = useMemo(() => new Map(rows.map((r) => [normName(r.name), r])), [rows]);
  const matched = malha ? malha.municipios.filter((m) => byName.has(m.key)).length : 0;
  const h = hover ? byName.get(hover) : null;
  const legend = useMemo(() => {
    const m = new Map<string, { name: string; party: string | null; color: string; n: number }>();
    for (const r of rows) if (r.leader) m.set(r.leader.name, { ...r.leader, n: (m.get(r.leader.name)?.n ?? 0) + 1 });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [rows]);

  if (failed) return <p className="text-[12.5px] text-fg-3">Malha municipal do IBGE indisponível no momento.</p>;
  return (
    <figure className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface" data-testid="state-municipal-map">
      {!malha ? (
        <div className="aspect-[4/3] w-full animate-pulse bg-elevated" />
      ) : (
        <motion.svg viewBox={malha.viewBox} className="block h-auto max-h-[70vh] w-full" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }} role="img" aria-label={`Municípios de ${uf} por candidato à frente`}>
          {malha.municipios.map((m, i) => {
            const r = byName.get(m.key);
            const fill = r?.leader?.color ?? "#1f2430";
            return (
              <Link key={m.ibge} href={r ? `/apuracao/explorar?uf=${uf}&mun=${r.tse}` : "#"} scroll={false}>
                <motion.path
                  d={m.d}
                  fill={fill}
                  stroke="#0e1015"
                  strokeWidth={hover === m.key ? 2.5 : 0.6}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: hover && hover !== m.key ? 0.55 : r?.leader ? 0.55 + 0.45 * Math.min(1, Math.max(0, (r.leader.pct - 40) / 30)) : 1 }}
                  transition={{ duration: 0.5, delay: Math.min(i, 400) * 0.0015 }}
                  onPointerEnter={() => setHover(m.key)}
                  onPointerLeave={() => setHover(null)}
                  className="cursor-pointer"
                />
              </Link>
            );
          })}
        </motion.svg>
      )}
      {h && (
        <div className="pointer-events-none absolute top-3 left-3 max-w-[80%] rounded-[var(--radius-md)] border border-border bg-surface/95 p-3 text-[12.5px] shadow-xl backdrop-blur">
          <p className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-fg">{h.name}</p>
          {h.leader ? (
            <p className="mt-1 flex items-center gap-1.5 text-fg-2">
              <span className="size-2 rounded-full" style={{ background: h.leader.color }} aria-hidden />
              {h.leader.name} ({h.leader.party}) · {h.leader.pct.toFixed(1).replace(".", ",")}%
            </p>
          ) : (
            <p className="mt-1 text-fg-3">Sem votos oficiais publicados.</p>
          )}
          <p className="mt-0.5 text-[11px] text-fg-3">{fmtInt(h.valid)} válidos · toque para ver zonas e escolas</p>
        </div>
      )}
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-surface/80 px-3 py-2 text-[11.5px] text-fg-2">
        {legend.map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px]" style={{ background: l.color }} aria-hidden />
            {l.name} ({l.party}) · {fmtInt(l.n)} municípios
          </span>
        ))}
        <span className="text-fg-3">· {roundLabel} · cor mais forte = vantagem maior{malha && matched < malha.municipios.length ? ` · ${malha.municipios.length - matched} sem dado` : ""}</span>
      </figcaption>
    </figure>
  );
}
