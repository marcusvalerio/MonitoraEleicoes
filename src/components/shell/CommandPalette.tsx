"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Flag, Landmark, CornerDownLeft, Database, FileText, Hash, Mic2, Search, User, Zap, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SearchHit, SearchKind } from "@/services/search";

const ICON: Record<SearchKind, typeof Search> = { pagina: BookOpen, candidato: User, partido: Flag, eleicao: Landmark, debate: Mic2, tema: Hash, evento: Zap, fala: FileText, fonte: Database, localidade: MapPin };
const KIND_LABEL: Record<SearchKind, string> = { pagina: "Páginas", candidato: "Candidatos", partido: "Partidos", eleicao: "Eleições", debate: "Debates", tema: "Temas", evento: "Eventos", fala: "Falas", fonte: "Fontes", localidade: "Localidades" };

/** `hotkey`: apenas uma instância deve registrar ⌘K. */
export function SearchTrigger({ compact, hotkey }: { compact?: boolean; hotkey?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        className={cn(
          "flex h-8 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface text-[12.5px] text-fg-3 transition-colors hover:border-border-strong hover:text-fg-2",
          compact ? "w-8 justify-center" : "w-full max-w-[340px] px-2.5",
        )}
      >
        <Search size={14} aria-hidden />
        {!compact && (
          <>
            <span className="flex-1 text-left">Buscar…</span>
            <kbd className="rounded border border-border px-1 font-mono text-2xs">⌘K</kbd>
          </>
        )}
      </button>
      <AnimatePresence>{open && <Palette onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setState("loading");
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error();
        const j = await r.json();
        setHits(j.hits);
        setActive(0);
        setState("ready");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState("error");
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const go = useCallback(
    (h: SearchHit) => {
      onClose();
      router.push(h.href);
    },
    [onClose, router],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    }
    if (e.key === "Enter" && hits[active]) go(hits[active]);
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        role="dialog"
        aria-label="Busca global"
        className="w-full max-w-[600px] overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-elevated shadow-2xl"
        initial={{ y: -8, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -8, scale: 0.98 }}
        transition={{ duration: 0.16 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={15} className="text-fg-3" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar candidato, partido, eleição, estado, município…"
            className="h-11 flex-1 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-fg-3"
            aria-label="Termo de busca"
          />
          <kbd className="rounded border border-border px-1 font-mono text-2xs text-fg-3">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {state === "error" && <p className="px-3 py-6 text-center text-[12px] text-neg">Busca indisponível no momento.</p>}
          {state !== "error" && hits.length === 0 && state === "ready" && (
            <p className="px-3 py-6 text-center text-[12px] text-fg-3">
              Nenhum resultado para “{q}”. Localidades eleitorais ficam disponíveis após a importação do TSE (P1).
            </p>
          )}
          {hits.map((h, i) => {
            const Icon = ICON[h.kind];
            const header = i === 0 || hits[i - 1].kind !== h.kind ? KIND_LABEL[h.kind] : null;
            return (
              <div key={`${h.kind}-${h.id}`}>
                {header && <div className="eyebrow px-2.5 pt-2.5 pb-1">{header}</div>}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={cn("flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left", i === active ? "bg-hover" : "")}
                >
                  <Icon size={14} className="shrink-0 text-fg-3" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{h.title}</span>
                    {h.subtitle && <span className="block truncate text-[11.5px] text-fg-3">{h.subtitle}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={13} className="text-fg-3" aria-hidden />}
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
