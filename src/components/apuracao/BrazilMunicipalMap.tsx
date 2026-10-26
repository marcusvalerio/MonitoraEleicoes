"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { fmtInt } from "@/lib/format";

type Entry = [number, number, number | null, number | null, number];
interface MapData { viewBox: string; m: [string, string][] }
interface Res { source: "apuracao" | "secao"; coverage: number; m: Record<string, Entry> }

type Mode = "vencedor" | "margem" | "variacao";
const f = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/**
 * Brasil inteiro por município (malha oficial do IBGE): vencedor, força da vitória (margem) ou variação do
 * 1º para o 2º turno de um finalista. Só números oficiais; município sem dado fica neutro (ausência ≠ zero).
 */
export function BrazilMunicipalMap({ year, round, cands, focus }: { year: number; round: number; cands: { number: number; name: string; color: string }[]; focus: number | null }) {
  const [geo, setGeo] = useState<MapData | null>(null);
  const [res, setRes] = useState<Record<number, Res>>({});
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<Mode>("vencedor");
  const [hover, setHover] = useState<{ k: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let live = true;
    fetch("/api/malha-br").then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => live && setGeo(j)).catch(() => live && setFailed(true));
    const rounds = round === 2 ? [1, 2] : [1];
    for (const r of rounds) fetch(`/api/municipios/${year}/${r}`).then((x) => (x.ok ? x.json() : null)).then((j) => live && j && setRes((o) => ({ ...o, [r]: j })));
    return () => {
      live = false;
    };
  }, [year, round]);

  const color = useMemo(() => new Map(cands.map((c) => [c.number, c.color])), [cands]);
  const name = useMemo(() => new Map(cands.map((c) => [c.number, c.name])), [cands]);
  const cur = res[round];
  const first = res[1];

  const fill = (k: string): string => {
    const e = cur?.m[k];
    if (mode === "variacao") {
      const a = cur?.m[k], b = first?.m[k];
      if (!a || !b || focus === null) return "#232835";
      const pa = a[0] === focus ? a[1] : a[2] === focus ? a[3] : null;
      const pb = b[0] === focus ? b[1] : b[2] === focus ? b[3] : null;
      if (pa === null || pb === null) return "#232835";
      const d = Math.max(-30, Math.min(30, pa - pb));
      const t = Math.abs(d) / 30;
      return d >= 0 ? mix("#161a22", color.get(focus) ?? "#555", 0.15 + t * 0.85) : mix("#161a22", "#8a8f9c", 0.15 + t * 0.85);
    }
    if (!e) return "#232835";
    const c = color.get(e[0]) ?? "#6b7180";
    if (mode === "vencedor") return c;
    const margin = e[1] - (e[3] ?? 0);
    return mix("#161a22", c, 0.2 + Math.min(1, margin / 50) * 0.8);
  };

  if (failed) return <p className="text-[12px] text-fg-3">Malha municipal do IBGE indisponível no momento.</p>;
  const h = hover ? cur?.m[hover.k] : null;
  const counts = cur ? Object.values(cur.m).reduce<Record<number, number>>((a, e) => ((a[e[0]] = (a[e[0]] ?? 0) + 1), a), {}) : {};
  const focusName = focus !== null ? name.get(focus) : null;

  return (
    <figure data-testid="brazil-municipal-map">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border bg-surface p-0.5 text-[12px]" role="radiogroup" aria-label="Leitura do mapa">
          {([["vencedor", "Vencedor"], ["margem", "Força da vitória"], ...(round === 2 && focus !== null ? [["variacao", `Variação ${focusName ?? ""} 1º→2º`]] : [])] as [Mode, string][]).map(([id, l]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={`relative h-7 rounded-full px-3 ${mode === id ? "text-bg" : "text-fg-2 hover:text-fg"}`}>
              {mode === id && <motion.span layoutId="mm-pill" className="absolute inset-0 -z-0 rounded-full bg-fg" />}
              <span className="relative">{l}</span>
            </button>
          ))}
        </div>
        <span className="text-[11px] text-fg-3">
          {cur ? `${fmtInt(cur.coverage)} municípios com dado oficial · ${cur.source === "apuracao" ? `${round}º turno · apuração por município (TSE)` : `${round}º turno · votação por seção (TSE · Dados Abertos)`}` : "carregando resultados…"}
        </span>
      </div>
      <div ref={box} className="relative overflow-hidden rounded-[20px] border hairline bg-[radial-gradient(70%_60%_at_50%_45%,#121722,#07080b)]" onPointerLeave={() => setHover(null)}>
        {!geo ? (
          <div className="aspect-square w-full animate-pulse bg-[#0b0d12]" />
        ) : (
          <motion.svg viewBox={geo.viewBox} className="block h-auto max-h-[78vh] w-full" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7 }} role="img" aria-label="Mapa do Brasil por município">
            {geo.m.map(([k, d]) => (
              <path
                key={k}
                d={d}
                fill={fill(k)}
                stroke="#07080b"
                strokeWidth={0.3}
                className="cursor-pointer transition-[filter] hover:brightness-150"
                onClick={() => {
                  const q = new URLSearchParams(window.location.search);
                  q.set("uf", k.split("|")[0]);
                  router.push(`?${q.toString()}#uf-escolhida`, { scroll: false });
                }}
                onPointerEnter={(ev) => {
                  const b = box.current!.getBoundingClientRect();
                  setHover({ k, x: ev.clientX - b.left, y: ev.clientY - b.top });
                }}
                style={{ transition: "fill 500ms ease" }}
              />
            ))}
          </motion.svg>
        )}
        {hover && (
          <div className="pointer-events-none absolute z-10 w-56 rounded-[var(--radius)] border border-border bg-surface/95 p-2.5 text-[12px] shadow-xl backdrop-blur" style={{ left: `min(${hover.x + 12}px, calc(100% - 14.5rem))`, top: Math.max(6, hover.y - 10) }}>
            <p className="font-semibold text-fg">{titleCase(hover.k.split("|")[1])} <span className="text-fg-3">· {hover.k.split("|")[0]}</span></p>
            {h ? (
              <>
                <Line n={name.get(h[0]) ?? String(h[0])} c={color.get(h[0])} p={h[1]} />
                {h[2] !== null && <Line n={name.get(h[2]) ?? String(h[2])} c={color.get(h[2])} p={h[3]!} />}
                <p className="mt-1 text-[10.5px] text-fg-3">{fmtInt(h[4])} votos válidos · toque para abrir o estado</p>
              </>
            ) : (
              <p className="mt-1 text-fg-3">Sem dado oficial coletado.</p>
            )}
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-fg-2">
        {mode === "variacao" ? (
          <span className="text-fg-3">Mais forte = {focusName} ganhou mais pontos percentuais do 1º para o 2º turno; cinza-escuro = perdeu. Comparação aritmética dos % oficiais.</span>
        ) : (
          cands.filter((c) => counts[c.number]).map((c) => (
            <span key={c.number} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c.color }} />{c.name} <b className="tabular-nums">{fmtInt(counts[c.number])}</b> municípios</span>
          ))
        )}
        {mode === "margem" && <span className="text-fg-3">· cor mais forte = vantagem maior sobre o 2º colocado</span>}
      </figcaption>
    </figure>
  );
}

function Line({ n, c, p }: { n: string; c?: string; p: number }) {
  return (
    <p className="mt-1 flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: c ?? "#6b7180" }} />
      <span className="truncate text-fg-2">{n}</span>
      <b className="ml-auto tabular-nums text-fg">{f(p)}</b>
    </p>
  );
}

const titleCase = (n: string) => n.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}
