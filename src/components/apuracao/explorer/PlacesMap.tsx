"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { fmtInt } from "@/lib/format";
import type { Cand } from "./AreaList";

export interface MapPlace {
  key: string;
  name: string;
  href: string;
  lat: number;
  lon: number;
  votes: Record<string, number>;
}

/**
 * Escolas no mapa pela coordenada OFICIAL do TSE (latitude/longitude do local de votação). Cor = partido de quem lidera
 * no local; tamanho = votos válidos. Escola sem coordenada não aparece aqui (fica na lista) — posição nunca é inventada.
 */
export function PlacesMap({ places, cands, selected, outline }: { places: MapPlace[]; cands: Cand[]; selected?: string | null; outline?: { uf: string; name: string } | null }) {
  const router = useRouter();
  // Contorno oficial do município (IBGE) como base do mapa; sem ele, só os pontos.
  const [rings, setRings] = useState<{ for: string; r: number[][][] } | null>(null);
  const oKey = outline ? `${outline.uf}/${outline.name}` : "";
  useEffect(() => {
    if (!oKey) return;
    let live = true;
    fetch(`/api/contorno/${oKey.split("/").map(encodeURIComponent).join("/")}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j?.rings && setRings({ for: oKey, r: j.rings }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [oKey]);
  const [hover, setHover] = useState<string | null>(null);
  const numbers = useMemo(() => new Set(cands.map((c) => c.number)), [cands]);
  const W = 1000;
  const view = useMemo(() => {
    if (!places.length) return null;
    const lats = places.map((p) => p.lat).sort((a, b) => a - b);
    const lons = places.map((p) => p.lon).sort((a, b) => a - b);
    // recorte robusto (1%–99%): uma coordenada fora do lugar não achata o mapa
    const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.max(0, Math.round(f * (a.length - 1))))];
    const [la0, la1, lo0, lo1] = [q(lats, 0.01), q(lats, 0.99), q(lons, 0.01), q(lons, 0.99)];
    const k = Math.cos((((la0 + la1) / 2) * Math.PI) / 180);
    const spanX = Math.max(1e-4, (lo1 - lo0) * k);
    const spanY = Math.max(1e-4, la1 - la0);
    const H = Math.round(Math.min(900, Math.max(420, (W * spanY) / spanX)));
    const pad = 40;
    const s = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
    const ox = (W - spanX * s) / 2;
    const oy = (H - spanY * s) / 2;
    return { H, x: (lon: number) => ox + (lon - lo0) * k * s, y: (lat: number) => H - (oy + (lat - la0) * s) };
  }, [places]);
  const pts = useMemo(() => {
    if (!view) return [];
    const max = Math.max(1, ...places.map((p) => Object.entries(p.votes).reduce((a, [k, v]) => (numbers.has(k) ? a + v : a), 0)));
    return places.map((p) => {
      const valid = Object.entries(p.votes).reduce((a, [k, v]) => (numbers.has(k) ? a + v : a), 0);
      const lead = cands.map((c) => ({ c, v: p.votes[c.number] ?? 0 })).sort((a, b) => b.v - a.v)[0];
      return { ...p, x: view.x(p.lon), y: view.y(p.lat), r: 3 + Math.sqrt(valid / max) * 14, valid, lead: lead && lead.v > 0 ? lead : null };
    });
  }, [places, view, cands, numbers]);
  // Câmera do mapa (viewBox animado): zoom in na escola escolhida, zoom out ao voltar; botões, roda, pinça e arraste.
  const full = useMemo(() => ({ x: 0, y: 0, w: W, h: view?.H ?? W }), [view]);
  const sel = pts.find((p) => p.key === selected);
  type VB = typeof full;
  // Enquadramento automático (escola escolhida ⇒ zoom in; nenhuma ⇒ tudo); ajustes manuais valem até a seleção mudar.
  const auto: VB = sel ? { x: sel.x - W / 12, y: sel.y - (W / 12) * (full.h / W), w: W / 6, h: (W / 6) * (full.h / W) } : full;
  const [manual, setManual] = useState<{ for: string; vb: VB } | null>(null);
  const vb = manual && manual.for === (sel?.key ?? "") ? manual.vb : auto;
  const setVb = (f: VB | ((v: VB) => VB)) => setManual({ for: sel?.key ?? "", vb: typeof f === "function" ? f(vb) : f });
  const svgRef = useRef<SVGSVGElement>(null);
  const zoom = (f: number, cx?: number, cy?: number) =>
    setVb((v) => {
      const w = Math.min(full.w, Math.max(full.w / 40, v.w * f));
      const h = w * (full.h / full.w);
      const px = cx ?? v.x + v.w / 2;
      const py = cy ?? v.y + v.h / 2;
      return { x: px - ((px - v.x) * w) / v.w, y: py - ((py - v.y) * h) / v.h, w, h };
    });
  const toSvg = (cx: number, cy: number) => {
    const b = svgRef.current!.getBoundingClientRect();
    return { x: vb.x + ((cx - b.left) / b.width) * vb.w, y: vb.y + ((cy - b.top) / b.height) * vb.h };
  };
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const onDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const b = svgRef.current!.getBoundingClientRect();
    if (ptrs.current.size === 2) {
      const [a, c] = [...ptrs.current.values()];
      const other = a === prev ? c : a;
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (d0 > 0) {
        const m = toSvg((e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
        zoom(d0 / d1, m.x, m.y);
      }
    } else if (vb.w < full.w) {
      const dx = ((e.clientX - prev.x) / b.width) * vb.w;
      const dy = ((e.clientY - prev.y) / b.height) * vb.h;
      setVb((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onUp = (e: React.PointerEvent) => void ptrs.current.delete(e.pointerId);
  if (!view) return null;
  const h = pts.find((p) => p.key === hover);
  const zoomed = vb.w < full.w - 1;
  return (
    <figure className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-[radial-gradient(70%_60%_at_50%_40%,#ffffff,#f0ede6)]" data-testid="places-map">
      <motion.svg
        ref={svgRef}
        viewBox={`${full.x} ${full.y} ${full.w} ${full.h}`}
        animate={{ viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}` }}
        transition={{ duration: 0.9, ease: [0.22, 0.8, 0.2, 1] }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey && !zoomed) return;
          const m = toSvg(e.clientX, e.clientY);
          zoom(e.deltaY > 0 ? 1.25 : 0.8, m.x, m.y);
        }}
        className={`block h-auto w-full ${zoomed ? "touch-none cursor-grab" : "touch-pan-y"}`} role="img" aria-label={`Mapa de ${pts.length} locais de votação`}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#e3dfd6" strokeWidth={vb.w / full.w} />
          </pattern>
        </defs>
        <rect width={W} height={view.H} fill="url(#grid)" />
        {rings && rings.for === oKey && (
          <motion.path
            d={rings.r.map((r) => `M${r.map(([lon, lat]) => `${view.x(lon).toFixed(1)},${view.y(lat).toFixed(1)}`).join("L")}Z`).join("")}
            fill="#ffffff"
            fillOpacity={0.85}
            stroke="#b9b2a5"
            strokeWidth={(1.5 * vb.w) / full.w}
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            style={{ filter: "drop-shadow(0 6px 14px rgba(60,50,30,.10))" }}
          />
        )}
        {pts
          .sort((a, b) => b.r - a.r)
          .map((p, i) => (
            <motion.circle
              key={p.key}
              cx={p.x}
              cy={p.y}
              fill={p.lead?.c.color ?? "#85858c"}
              fillOpacity={hover && hover !== p.key ? 0.35 : 0.8}
              stroke={selected === p.key || hover === p.key ? "#1a1a1c" : "#ffffff"}
              strokeWidth={((selected === p.key || hover === p.key ? 2.5 : 1) * vb.w) / full.w}
              initial={{ r: 0 }}
              animate={{ r: Math.max(p.r * Math.pow(vb.w / full.w, 0.75), (2 * vb.w) / full.w) }}
              transition={{ duration: 0.6, delay: Math.min(i, 300) * 0.002, ease: [0.2, 0.7, 0.2, 1] }}
              onPointerEnter={() => setHover(p.key)}
              onPointerLeave={() => setHover(null)}
              onClick={() => router.push(p.href, { scroll: false })}
              className="cursor-pointer"
            />
          ))}
      </motion.svg>
      <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/95 shadow-lg backdrop-blur">
        <button type="button" aria-label="Aproximar" onClick={() => zoom(0.6)} className="size-9 text-[18px] text-fg hover:bg-elevated">+</button>
        <button type="button" aria-label="Afastar" onClick={() => zoom(1.6)} className="size-9 border-t border-border text-[18px] text-fg hover:bg-elevated">−</button>
        {zoomed && <button type="button" aria-label="Ver tudo" onClick={() => setVb(full)} className="size-9 border-t border-border text-[11px] text-fg-2 hover:bg-elevated">⤢</button>}
      </div>
      {h && (
        <div className="pointer-events-none absolute top-3 left-3 max-w-[80%] rounded-[var(--radius)] border border-border bg-surface/95 p-3 text-[12.5px] shadow-xl backdrop-blur">
          <p className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-fg">{h.name}</p>
          {h.lead && (
            <p className="mt-1 flex items-center gap-1.5 text-fg-2">
              <span className="size-2 rounded-full" style={{ background: h.lead.c.color }} aria-hidden />
              {h.lead.c.name} · {((h.lead.v / Math.max(1, h.valid)) * 100).toFixed(1).replace(".", ",")}%
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-fg-3">{fmtInt(h.valid)} votos válidos · toque para abrir</p>
        </div>
      )}
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-surface/70 px-3 py-2 text-[11.5px] text-fg-2">
        {cands.filter((c) => pts.some((p) => p.lead?.c.number === c.number)).map((c) => (
          <span key={c.number} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.name} ({c.party})
          </span>
        ))}
        <span className="text-fg-3">· cada ponto é uma escola (localização oficial do TSE) · tamanho = votos válidos</span>
      </figcaption>
    </figure>
  );
}
