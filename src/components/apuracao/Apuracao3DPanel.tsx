"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Column3D } from "./Brazil3D";
import { fmtInt } from "@/lib/format";

const Brazil3D = dynamic(() => import("./Brazil3D"), { ssr: false, loading: () => <Shimmer /> });

export interface Territory3D {
  key: string;
  name: string;
  countedPct: number | null;
  validVotes: number | null;
  live: boolean;
  leader: { name: string; party: string | null; pct: number | null; votes: number; color: string } | null;
}

type Mode = "lider" | "votos" | "apuracao";
const MODES: [Mode, string][] = [
  ["lider", "Quem lidera"],
  ["votos", "Peso em votos"],
  ["apuracao", "Apuração"],
];

const subscribeRM = (fn: () => void) => {
  const m = window.matchMedia("(prefers-reduced-motion: reduce)");
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};
const subscribeSm = (fn: () => void) => {
  const m = window.matchMedia("(max-width: 639px)");
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};
/** Celular: mapa 2D leve e legível no lugar da cena 3D (menos bateria, toque mais preciso). */
const useSmall = () => useSyncExternalStore(subscribeSm, () => window.matchMedia("(max-width: 639px)").matches, () => false);
const useReducedMotion = () => useSyncExternalStore(subscribeRM, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);

/** % → texto pt-BR. */
const pct = (v: number | null, d = 1) => (v === null ? "—" : `${v.toFixed(d).replace(".", ",")}%`);

/**
 * Painel 3D da apuração: altura e cor de cada UF (e do Exterior) vêm só de números oficiais. Três leituras:
 * quem lidera (altura = % do líder), peso em votos (altura = votos válidos apurados) e andamento (altura = % de seções).
 */
export function Apuracao3DPanel({ territories, fallback, legend }: { territories: Territory3D[]; fallback: React.ReactNode; legend: { name: string; color: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<Mode>("lider");
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const selected = params.get("uf")?.toUpperCase() ?? null;
  const by = useMemo(() => new Map(territories.map((t) => [t.key, t])), [territories]);
  const maxVotes = Math.max(1, ...territories.map((t) => t.validVotes ?? 0));

  const columns: Column3D[] = useMemo(
    () =>
      territories.map((t) => {
        if (mode === "apuracao") return { key: t.key, color: t.countedPct !== null && t.countedPct >= 100 ? "#8dbaf2" : "#4a8be6", height: t.countedPct === null ? null : t.countedPct / 100, live: t.live };
        if (!t.leader) return { key: t.key, color: "#2a2f3b", height: null };
        // Líder: piso visual de 15% para que a cor sempre apareça; o número exato está no tooltip.
        const h = mode === "lider" ? (t.leader.pct === null ? null : 0.15 + (t.leader.pct / 100) * 0.85) : Math.sqrt((t.validVotes ?? 0) / maxVotes);
        return { key: t.key, color: t.leader.color, height: h, live: t.live };
      }),
    [territories, mode, maxVotes],
  );

  const select = (k: string) => {
    const q = new URLSearchParams(params.toString());
    if (q.get("uf") === k) q.delete("uf");
    else q.set("uf", k);
    router.push(`?${q.toString()}`, { scroll: false });
  };

  const small = useSmall();
  if (failed || small) return <>{fallback}</>;
  const h = hover ? by.get(hover.key) : null;

  return (
    <figure className="relative" data-testid="apuracao-3d" aria-label="Mapa 3D da apuração por UF e Exterior">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative flex rounded-full border border-border bg-surface/70 p-0.5 text-[12px] backdrop-blur" role="radiogroup" aria-label="Leitura do mapa">
          {MODES.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={`relative z-10 h-7 rounded-full px-3 transition-colors ${mode === id ? "text-bg" : "text-fg-2 hover:text-fg"}`}>
              {mode === id && <motion.span layoutId="mode-pill" className="absolute inset-0 -z-10 rounded-full bg-fg" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-fg-3">Toque num estado: ele sobe em 3D e abre os municípios</span>
      </div>

      <div className="relative aspect-square max-h-[560px] w-full sm:aspect-auto sm:h-[min(68vh,560px)] sm:min-h-[380px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-[radial-gradient(80%_70%_at_50%_30%,rgba(57,135,229,0.10),transparent_70%),radial-gradient(60%_50%_at_80%_90%,rgba(25,158,112,0.08),transparent_70%)] motion-safe:animate-[map-in_900ms_cubic-bezier(.2,.7,.2,1)_both]">
        <Brazil3D columns={columns} selected={selected} reducedMotion={reduced} onHover={(k, p) => setHover(k && p ? { key: k, ...p } : null)} onSelect={select} onFail={() => setFailed(true)} />
        <span className="pointer-events-none absolute right-3 bottom-3 rounded-full border border-border bg-bg/70 px-2 py-0.5 text-[10px] tracking-[0.12em] text-fg-3 uppercase backdrop-blur">Exterior ⬢ no Atlântico</span>
        <AnimatePresence>
          {h && hover && (
            <motion.div
              key={h.key}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.16 }}
              className="pointer-events-none absolute z-10 w-60 rounded-[var(--radius)] border border-border bg-surface/95 p-3 text-[12px] shadow-2xl backdrop-blur"
              style={{ left: `min(${hover.x + 14}px, calc(100% - 15.5rem))`, top: Math.max(8, hover.y - 20) }}
              data-testid="apuracao-3d-tooltip"
            >
              <p className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-fg">{h.name}</p>
              {h.leader ? (
                <p className="mt-1 flex items-center gap-1.5 text-fg-2">
                  <span className="size-2 rounded-full" style={{ background: h.leader.color }} aria-hidden />
                  <span className="truncate">{h.leader.name}</span>
                  <span className="ml-auto font-[family-name:var(--font-num)] font-semibold text-fg tabular-nums">{pct(h.leader.pct, 2)}</span>
                </p>
              ) : (
                <p className="mt-1 text-fg-3">Sem votos oficiais publicados.</p>
              )}
              <p className="mt-1 text-[11px] text-fg-3">
                {h.countedPct === null ? "Seções: dado indisponível" : `${pct(h.countedPct, 2)} das seções`} {h.validVotes !== null && `· ${fmtInt(h.validVotes)} válidos`}
              </p>
              <p className="mt-1.5 text-[10px] tracking-[0.08em] text-fg-3 uppercase">Dado oficial · TSE</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-2">
        {mode === "apuracao" ? (
          <>
            <Swatch c="#4a8be6" l="Em apuração" />
            <Swatch c="#8dbaf2" l="100% das seções" />
            <Swatch c="#2a2f3b" l="Sem dado" />
            <span className="text-fg-3">· estado escolhido sobe conforme o % de seções totalizadas</span>
          </>
        ) : (
          <>
            {legend.map((e) => (
              <Swatch key={e.name} c={e.color} l={e.name} round />
            ))}
            <span className="text-fg-3">· {mode === "lider" ? "cor = partido de quem lidera · o estado escolhido sobe conforme o % do líder" : "cor = partido de quem lidera · o estado escolhido sobe conforme os votos válidos apurados"}</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}

function Swatch({ c, l, round }: { c: string; l: string; round?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 ring-1 ring-border ${round ? "rounded-full" : "rounded-[2px]"}`} style={{ background: c }} aria-hidden />
      {l}
    </span>
  );
}

function Shimmer() {
  return <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.03)_50%,transparent_70%)]" />;
}
