"use client";

import { useEffect, useState } from "react";
import type { Headline } from "./LiveStatus";

/**
 * Transição de estado da apuração: quando a página percebe a passagem para AO VIVO ou ENCERRADA (entre atualizações),
 * mostra uma faixa elegante por ~2,4 s (varredura de luz + título). Sem reduced-motion. Não repete a cada refresh.
 */
export function LiveIntro({ headline, year }: { headline: Headline; year: number }) {
  const [show, setShow] = useState<Headline | null>(null);
  useEffect(() => {
    const k = `monitora:apuracao:estado:${year}`;
    let prev: string | null = null;
    try {
      prev = sessionStorage.getItem(k);
      sessionStorage.setItem(k, headline);
    } catch {
      /* sem sessionStorage */
    }
    const changed = prev !== null && prev !== headline && (headline === "ao_vivo" || headline === "encerrada");
    if (!changed || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = setTimeout(() => setShow(headline), 0);
    const t = setTimeout(() => setShow(null), 2400);
    return () => {
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [headline, year]);
  if (!show) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-4" data-testid="live-intro">
      <div className="relative overflow-hidden rounded-full border border-white/10 bg-[#0a0a0b]/90 px-6 py-3 shadow-[0_0_60px_-10px_rgba(229,72,77,0.45)] backdrop-blur motion-safe:animate-[enter_300ms_ease-out_both]">
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent motion-safe:animate-[sweep_1.6s_ease-in-out_both]" aria-hidden />
        <span className={`relative font-[family-name:var(--font-display)] text-[15px] font-bold motion-safe:animate-[live-in_1.2s_ease-out_both] ${show === "ao_vivo" ? "text-[#ff8a8e]" : "text-pos"}`}>
          {show === "ao_vivo" ? "APURAÇÃO AO VIVO" : "APURAÇÃO ENCERRADA"}
        </span>
      </div>
    </div>
  );
}
