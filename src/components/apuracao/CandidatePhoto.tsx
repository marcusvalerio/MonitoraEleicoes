"use client";

import { useEffect, useRef, useState } from "react";

/** Foto OFICIAL (TSE) ou monograma — nunca imagem de outra origem. */
export function CandidatePhoto({ year, sq, name, size = 44, ring }: { year: number; sq: string; name: string; size?: number; ring?: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Erro de carregamento antes da hidratação não dispara onError: confere o estado da imagem após montar.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) queueMicrotask(() => setFailed(true));
  }, [sq]);
  const initials = name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("") || name.slice(0, 2);
  const style = { width: size, height: size, boxShadow: ring ? `0 0 0 2px #0a0a0b, 0 0 0 3.5px ${ring}` : undefined };
  if (failed)
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-elevated font-[family-name:var(--font-display)] text-[13px] font-semibold text-fg-2" style={style} aria-hidden>
        {initials.toUpperCase()}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagem oficial servida pela própria API (cache + proveniência)
    <img ref={img} src={`/api/foto/${year}/${sq}`} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className="shrink-0 rounded-full bg-elevated object-cover object-top" style={style} />
  );
}
