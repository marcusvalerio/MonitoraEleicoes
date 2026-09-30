"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { useOnline } from "./OfflineBanner";

/** Indicador global do estado dos dados — o único lugar onde "DEMO" aparece. */
export function DataStatus({ mode, live }: { mode: "demo" | "live"; live: boolean }) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const state = !online ? "offline" : mode === "demo" ? "demo" : "ok";
  const dot = { offline: "bg-neg", demo: "bg-warn", ok: "bg-pos" }[state];
  const label = { offline: "Offline", demo: "Demo", ok: "Dados reais" }[state];
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className="flex h-8 items-center gap-2 rounded-[var(--radius-md)] border border-border px-2.5 text-[11.5px] text-fg-2 transition-colors hover:border-border-strong hover:text-fg">
        <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
        <span className="font-medium tracking-wide">{label}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="Status dos dados" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="absolute top-10 right-0 z-50 w-[300px] rounded-[var(--radius-lg)] border border-border-strong bg-elevated p-4 text-[12px] shadow-2xl">
            <p className="eyebrow mb-2">Status dos dados</p>
            <dl className="space-y-2">
              {[
                ["Modo", mode === "demo" ? "Demonstração — dados fictícios" : "Dados reais"],
                ["Transmissão", live ? (mode === "demo" ? "Replay contínuo do debate demo" : "Ao vivo") : "Sem evento ao vivo"],
                ["Conexão", online ? "Online" : "Offline — atualização pausada"],
                ["Resultados eleitorais", "Aguardando importação oficial (TSE)"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-fg-3">{k}</dt>
                  <dd className="text-right text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            {mode === "demo" && <p className="mt-3 border-t border-border pt-3 text-fg-3">Candidatos, partidos, falas, publicações e distribuição geográfica são fictícios. Nenhum dado demo é apresentado como real.</p>}
            <Link href="/sources" onClick={() => setOpen(false)} className="mt-3 inline-block text-info hover:underline">
              Ver todas as fontes →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
