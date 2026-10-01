"use client";

import { useEffect, useRef, useState } from "react";

const fmt = (n: number, digits: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Número que transita suavemente do valor anterior para o novo (Clash Grotesk, algarismos tabulares, largura estável).
 * prefers-reduced-motion ⇒ troca instantânea. Valor null ⇒ texto do estado (nunca "0").
 */
export function NumberTicker({ value, digits = 0, suffix = "", empty = "—", className }: { value: number | null; digits?: number; suffix?: string; empty?: string; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (value === null || from.current === null || value === from.current) {
      from.current = value;
      const r = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(r);
    }
    const start = from.current;
    from.current = value;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const r = requestAnimationFrame(() => {
        setFresh(true);
        setShown(value);
      });
      const t = setTimeout(() => setFresh(false), 600);
      return () => {
        cancelAnimationFrame(r);
        clearTimeout(t);
      };
    }
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setFresh(true);
      setShown(start + (value - start) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setFresh(false), 500);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={`font-[family-name:var(--font-num)] tabular-nums transition-colors duration-700 ${fresh ? "text-[#f5f1e3]" : ""} ${className ?? ""}`} data-fresh={fresh || undefined}>
      {shown === null ? empty : `${fmt(shown, digits)}${suffix}`}
    </span>
  );
}
