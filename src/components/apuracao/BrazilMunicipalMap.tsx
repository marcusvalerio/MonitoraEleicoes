"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { fmtInt } from "@/lib/format";

/** [líder, % líder, 2º, % 2º, válidos, código TSE] */
type Entry = [number, number, number | null, number | null, number, number];
interface MapData { viewBox: string; m: [string, string][] }
interface Res { source: "apuracao" | "secao"; coverage: number; m: Record<string, Entry> }

type Mode = "vencedor" | "margem" | "virada";
const f = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const NONE = "#1d2230";

/**
 * Brasil inteiro por município (malha oficial do IBGE). Vencedor, margem sobre o 2º colocado e "virada"
 * (variação do 1º colocado entre turnos). Só números oficiais; sem dado = grafite (ausência ≠ zero).
 * Toque numa cidade abre a ficha dela, com o 1º turno ao lado e o caminho até as escolas.
 */
export function BrazilMunicipalMap({ year, round, cands, focus }: { year: number; round: number; cands: { number: number; name: string; color: string }[]; focus: number | null }) {
  const [geo, setGeo] = useState<MapData | null>(null);
  const [res, setRes] = useState<Record<number, Res>>({});
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<Mode>("vencedor");
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/malha-br").then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => live && setGeo(j)).catch(() => live && setFailed(true));
    for (const r of round === 2 ? [1, 2] : [1]) fetch(`/api/municipios/${year}/${r}`).then((x) => (x.ok ? x.json() : null)).then((j) => live && j && setRes((o) => ({ ...o, [r]: j })));
    return () => {
      live = false;
    };
  }, [year, round]);

  const color = useMemo(() => new Map(cands.map((c) => [c.number, c.color])), [cands]);
  const name = useMemo(() => new Map(cands.map((c) => [c.number, c.name])), [cands]);
  const cur = res[round];
  const first = round === 2 ? res[1] : undefined;
  const pctOf = (e: Entry | undefined, n: number | null) => (!e || n === null ? null : e[0] === n ? e[1] : e[2] === n ? e[3] : null);

  const fill = (k: string): string => {
    const e = cur?.m[k];
    if (!e) return NONE;
    const c = color.get(e[0]) ?? "#6b7180";
    if (mode === "vencedor") return c;
    if (mode === "margem") return mix("#141824", c, 0.18 + Math.min(1, (e[1] - (e[3] ?? 0)) / 50) * 0.82);
    const a = pctOf(e, focus), b = pctOf(first?.m[k], focus);
    if (a === null || b === null) return NONE;
    const d = Math.max(-25, Math.min(25, a - b)) / 25;
    return d >= 0 ? mix("#141824", color.get(focus!) ?? "#888", 0.15 + d * 0.85) : mix("#141824", "#cfd3dc", 0.15 - d * 0.6);
  };

  const counts = useMemo(() => (cur ? Object.values(cur.m).reduce<Record<number, number>>((a, e) => ((a[e[0]] = (a[e[0]] ?? 0) + 1), a), {}) : {}), [cur]);
  if (failed) return <p className="text-[12px] text-fg-3">Malha municipal do IBGE indisponível no momento.</p>;
  const focusName = focus !== null ? name.get(focus) : null;
  const modes: [Mode, string][] = [["vencedor", "Vencedor"], ["margem", "Margem"], ...(round === 2 && focus !== null ? ([["virada", "Virada"]] as [Mode, string][]) : [])];
  const sel = pick ? cur?.m[pick] : undefined;

  return (
    <figure className="relative" data-testid="brazil-municipal-map">
      <div className="relative">
        {/* placar de cidades sobreposto */}
        <div className="pointer-events-none absolute top-0 left-0 z-10 flex flex-col gap-1.5">
          {cands.filter((c) => counts[c.number]).sort((a, b) => (counts[b.number] ?? 0) - (counts[a.number] ?? 0)).map((c) => (
            <span key={c.number} className="flex items-baseline gap-2">
              <span className="font-[family-name:var(--font-num)] text-[28px] leading-none font-extrabold tracking-[-0.03em] tabular-nums md:text-[44px]" style={{ color: c.color }}>{fmtInt(counts[c.number])}</span>
              <span className="text-[11px] tracking-[0.12em] text-fg-3 uppercase">{titleCase(c.name)}</span>
            </span>
          ))}
          {cur && <span className="text-[10.5px] text-fg-3">cidades vencidas</span>}
        </div>
        <div className="absolute top-0 right-0 z-10 flex flex-col items-end gap-1" role="radiogroup" aria-label="Leitura do mapa">
          {modes.map(([id, l]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={`h-7 rounded-full px-3 text-[12px] transition-colors ${mode === id ? "bg-fg font-semibold text-bg" : "text-fg-3 hover:text-fg"}`}>
              {l}
            </button>
          ))}
        </div>

        {!geo ? (
          <div className="mx-auto aspect-square w-full max-w-[760px] animate-pulse rounded-full bg-[radial-gradient(closest-side,#121722,transparent)]" />
        ) : (
          <svg viewBox={geo.viewBox} className="mx-auto block h-auto max-h-[86vh] w-full max-w-[860px] [filter:drop-shadow(0_30px_60px_rgba(0,0,0,.6))]" role="img" aria-label="Mapa do Brasil por município">
            {geo.m.map(([k, d], i) => (
              <path
                key={k}
                d={d}
                fill={fill(k)}
                stroke={pick === k ? "#fff" : "#07080b"}
                strokeWidth={pick === k ? 1.6 : 0.3}
                className="cursor-pointer motion-safe:animate-[enter_700ms_both] hover:brightness-150"
                style={{ transition: "fill 600ms ease", animationDelay: `${(i % 60) * 12}ms` }}
                onClick={() => setPick(k)}
              />
            ))}
          </svg>
        )}
      </div>

      <figcaption className="mt-2 text-center text-[11px] text-fg-3">
        {mode === "vencedor" && "Cor = quem teve mais votos na cidade"}
        {mode === "margem" && "Cor mais intensa = vantagem maior sobre o 2º colocado"}
        {mode === "virada" && `Intenso = ${focusName} cresceu do 1º para o 2º turno · claro = caiu`}
        <span className="ml-1 opacity-70">· TSE / IBGE</span>
      </figcaption>

      {/* ficha da cidade */}
      <AnimatePresence>
        {pick && (
          <motion.aside
            key={pick}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="glass fixed inset-x-3 bottom-20 z-40 mx-auto max-w-md rounded-[20px] border hairline p-4 shadow-2xl md:absolute md:inset-x-auto md:right-0 md:bottom-4"
            data-testid="city-sheet"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.14em] text-fg-3 uppercase">{pick.split("|")[0]}</p>
                <p className="font-[family-name:var(--font-display)] text-[22px] leading-tight font-bold text-fg">{titleCase(pick.split("|")[1])}</p>
              </div>
              <button type="button" onClick={() => setPick(null)} className="grid size-8 place-items-center rounded-full text-fg-3 hover:bg-hover hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            {sel ? (
              <>
                {[[sel[0], sel[1]] as const, ...(sel[2] !== null ? [[sel[2], sel[3]!] as const] : [])].map(([n, p]) => {
                  const p1 = pctOf(first?.m[pick], n);
                  return (
                    <div key={n} className="mt-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] text-fg-2">{titleCase(name.get(n) ?? String(n))}</span>
                        <span className="font-[family-name:var(--font-num)] text-[22px] font-bold tabular-nums" style={{ color: color.get(n) }}>{f(p)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <motion.div className="h-full rounded-full" style={{ background: color.get(n) }} initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.7 }} />
                      </div>
                      {p1 !== null && <p className="mt-1 text-[11px] text-fg-3">1º turno: {f(p1)} · {p - p1 >= 0 ? "+" : ""}{(p - p1).toFixed(1).replace(".", ",")} p.p.</p>}
                    </div>
                  );
                })}
                <p className="mt-3 text-[11px] text-fg-3">{fmtInt(sel[4])} votos válidos · dado oficial TSE</p>
                <div className="mt-3 flex gap-2">
                  <Link href={`/apuracao/explorar?uf=${pick.split("|")[0]}&mun=${sel[5]}`} className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-fg text-[13px] font-semibold text-bg">Zonas e escolas →</Link>
                  <Link href={`?uf=${pick.split("|")[0]}#uf-escolhida`} scroll={false} className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-[13px] text-fg-2">Estado</Link>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[12.5px] text-fg-3">Sem dado oficial para esta cidade.</p>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </figure>
  );
}

const titleCase = (n: string) => n.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t)))).join(",")})`;
}
