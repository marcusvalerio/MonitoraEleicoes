"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Candidaturas ACOMPANHADAS (favoritos do usuário) — só neste navegador (localStorage), por ano.
 * Apenas destaque visual: a ordem oficial dos resultados NUNCA muda por causa disso.
 */
export interface Followed {
  sq: string;
  name: string;
  officeId: number;
}
const key = (year: number) => `monitora:acompanhados:${year}`;
const EVT = "monitora:acompanhados";

function read(year: number): Followed[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(year)) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && /^\d{6,15}$/.test(String(x.sq))).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function useFollow(year: number) {
  const [list, setList] = useState<Followed[]>([]);
  useEffect(() => {
    const sync = () => setList(read(year));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(EVT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVT, sync);
    };
  }, [year]);
  const toggle = useCallback(
    (f: Followed) => {
      const cur = read(year);
      const next = cur.some((x) => x.sq === f.sq) ? cur.filter((x) => x.sq !== f.sq) : [...cur, f].slice(0, 20);
      try {
        localStorage.setItem(key(year), JSON.stringify(next));
      } catch {
        /* armazenamento indisponível: segue só na sessão */
      }
      setList(next);
      window.dispatchEvent(new Event(EVT));
    },
    [year],
  );
  return { list, isFollowed: (sq: string) => list.some((x) => x.sq === sq), toggle };
}
