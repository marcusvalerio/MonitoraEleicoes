"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Atualização viva de páginas server-side: re-busca os dados no servidor a cada `intervalS` (só com a aba visível),
 * sem recarregar a página nem deslocar o layout. Mostra "Atualizado há Ns" e o estado "atualizando…".
 */
export function LiveRefresh({ intervalS = 30, label = "Atualizado" }: { intervalS?: number; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) setAt(Date.now());
    wasPending.current = pending;
  }, [pending]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") start(() => router.refresh());
    }, intervalS * 1000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [intervalS, router]);
  const s = Math.max(0, Math.round((now - at) / 1000));
  const ago = s < 60 ? `há ${s}s` : `há ${Math.floor(s / 60)} min`;
  return (
    <span className="inline-flex min-w-[150px] items-center gap-1.5 text-[11.5px] text-fg-3 tnum" aria-live="polite" data-testid="live-refresh">
      <RefreshCw size={11} className={pending ? "motion-safe:animate-spin" : ""} aria-hidden />
      {pending ? "atualizando…" : `${label} ${ago}`}
      <button type="button" className="ml-1 text-fg-3 underline-offset-2 hover:text-fg hover:underline" onClick={() => start(() => router.refresh())}>
        atualizar
      </button>
    </span>
  );
}
