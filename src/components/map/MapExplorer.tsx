"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronRight, Info } from "lucide-react";
import type { GeoAggregate, GeoBoundarySet, GeoLevelId, GeoResponse } from "@/geo/types";
import { GEO_LEVEL_LABEL } from "@/geo/types";
import type { TopicId } from "@/domain/types";
import { TOPIC_LABEL } from "@/domain/labels";
import { fmtInt, fmtPct, wallClock } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Delta } from "@/components/ui/primitives";
import { valueOr } from "@/domain/quality";
import { StateView } from "@/components/ui/states";
import { MapCanvas, type MapEntity } from "./MapCanvas";
import { MapLegend } from "./MapLegend";
import { LAYERS, type MapLayer } from "./scales";
import { TimeScrubber, type ScrubberEvent } from "./TimeScrubber";

export interface MapExplorerProps {
  debateId: string;
  startsAt: string;
  now: number;
  totalEnd: number;
  entities: MapEntity[];
  topics: TopicId[];
  series: { t: number; v: number }[];
  events: ScrubberEvent[];
  initial: GeoResponse;
  initialBoundaries: GeoBoundarySet | null;
  compact?: boolean;
  initialLayer?: MapLayer;
}

type WindowMode = "acumulado" | "janela";
const WINDOW = 900;

export function MapExplorer(p: MapExplorerProps) {
  const [data, setData] = useState<GeoResponse>(p.initial);
  const [parentKey, setParentKey] = useState(p.initial.parent.key);
  const [ufView, setUfView] = useState<"uf" | "regiao">("uf");
  const [layer, setLayer] = useState<MapLayer>(p.initialLayer ?? "candidato");
  const [topic, setTopic] = useState<TopicId>(p.topics[0] ?? "economia");
  const [pinnedTo, setTo] = useState(p.now);
  const [followNow, setFollowNow] = useState(true);
  // Acompanha o "agora" enquanto o usuário não fixa um instante.
  const to = followNow ? p.now : pinnedTo;
  const [winMode, setWinMode] = useState<WindowMode>("acumulado");
  const [status, setStatus] = useState<"ready" | "loading" | "error">("ready");
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusEvent, setFocusEvent] = useState<ScrubberEvent | null>(null);
  const boundaryCache = useRef(new Map<string, GeoBoundarySet | null>([[p.initial.childLevel, p.initialBoundaries]]));
  const [boundaries, setBoundaries] = useState<GeoBoundarySet | null>(p.initialBoundaries);
  const first = useRef(true);


  const childLevel: GeoLevelId = parentKey === "BR" ? ufView : data.childLevel;
  const load = useCallback(async () => {
    const from = winMode === "janela" ? Math.max(0, to - WINDOW) : 0;
    const qs = new URLSearchParams({ debate: p.debateId, parent: parentKey, from: String(Math.floor(from)), to: String(Math.floor(to)) });
    if (parentKey === "BR") qs.set("level", ufView);
    if (layer === "tema") qs.set("topic", topic);
    setStatus("loading");
    try {
      const r = await fetch(`/api/geo?${qs}`);
      if (!r.ok) throw new Error();
      const j: GeoResponse = await r.json();
      if (!boundaryCache.current.has(j.childLevel)) {
        const b = await fetch(`/api/geo/boundaries?level=${j.childLevel}`).then((x) => x.json());
        boundaryCache.current.set(j.childLevel, b.boundaries === null ? null : b);
      }
      setBoundaries(boundaryCache.current.get(j.childLevel) ?? null);
      setData(j);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [p.debateId, parentKey, ufView, layer, topic, to, winMode]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(load, 120);
    return () => clearTimeout(t);
  }, [load]);

  // Sincroniza estado com a URL (compartilhável), sem navegação.
  useEffect(() => {
    if (p.compact) return;
    const u = new URL(window.location.href);
    u.searchParams.set("territorio", parentKey);
    u.searchParams.set("camada", layer);
    if (layer === "tema") u.searchParams.set("tema", topic);
    else u.searchParams.delete("tema");
    window.history.replaceState(null, "", u);
  }, [parentKey, layer, topic, p.compact]);

  const byKey = useMemo(() => new Map(data.rows.map((r) => [r.key, r])), [data.rows]);
  const max = useMemo(() => Math.max(1, ...data.rows.map((r) => r.topicPosts)), [data.rows]);
  const entity = (id: string | null) => p.entities.find((e) => e.id === id);
  const drill = (key: string) => {
    const r = byKey.get(key);
    if (!r?.hasChildren || p.compact) return;
    setParentKey(key);
    setSelected(null);
    setHover(null);
  };
  const activate = (key: string, pointer: "mouse" | "touch" | "keyboard") => {
    if (p.compact) return setSelected(key === selected ? null : key);
    if (pointer === "touch" && selected !== key) return setSelected(key);
    drill(key);
  };

  const layerMeta = LAYERS.find((l) => l.id === layer)!;
  const detailKey = hover?.key ?? selected;
  const detail = detailKey ? byKey.get(detailKey) : undefined;
  const tableRows = [...data.rows].sort((a, b) => (layer === "tendencia" ? valueOr(b.trend, -9) - valueOr(a.trend, -9) : b.topicPosts - a.topicPosts));
  const focusKeys = focusEvent ? new Set(data.rows.filter((r) => valueOr(r.trend, 0) >= 0.2).map((r) => r.key)) : null;

  const tooltip = (r: GeoAggregate) => {
    const e = entity(r.predominantCandidateId);
    return (
      <div className="space-y-1.5">
        <p className="font-display text-[14px] font-semibold tracking-wide text-fg uppercase">{r.name}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11.5px]">
          <dt className="text-fg-3">{layer === "tema" ? `Publicações · ${TOPIC_LABEL[topic]}` : "Volume de conversa"}</dt>
          <dd className="text-right text-fg tnum">{fmtInt(r.topicPosts)}</dd>
          <dt className="text-fg-3">Partido mais mencionado</dt>
          <dd className="text-right text-fg">{e ? `${e.partyAcronym} · ${fmtPct(r.predominantShare)}` : "—"}</dd>
          <dt className="text-fg-3">Candidato mais mencionado</dt>
          <dd className="text-right text-fg">{e?.name ?? "—"}</dd>
          <dt className="text-fg-3">Tema principal</dt>
          <dd className="text-right text-fg">{r.topTopic ? TOPIC_LABEL[r.topTopic] : "—"}</dd>
          <dt className="text-fg-3">Variação (15 min)</dt>
          <dd className="text-right">
            <Delta value={r.trend} />
          </dd>
        </dl>
      </div>
    );
  };

  const controls = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex rounded-[var(--radius-md)] border border-border p-0.5" role="radiogroup" aria-label="Camada do mapa">
        {LAYERS.map((l) => (
          <button key={l.id} role="radio" aria-checked={layer === l.id} onClick={() => setLayer(l.id)} className={cn("h-7 rounded-[4px] px-2.5 text-[12px] transition-colors", layer === l.id ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg-2")}>
            {l.label}
          </button>
        ))}
      </div>
      {layer === "tema" && (
        <select value={topic} onChange={(e) => setTopic(e.target.value as TopicId)} aria-label="Tema" className="h-8 rounded-[var(--radius-md)] border border-border bg-bg px-2 text-[12px] text-fg">
          {p.topics.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABEL[t]}
            </option>
          ))}
        </select>
      )}
      {parentKey === "BR" && !p.compact && (
        <div className="flex rounded-[var(--radius-md)] border border-border p-0.5" role="radiogroup" aria-label="Agrupamento">
          {(["uf", "regiao"] as const).map((v) => (
            <button key={v} role="radio" aria-checked={ufView === v} onClick={() => setUfView(v)} className={cn("h-7 rounded-[4px] px-2.5 text-[12px]", ufView === v ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg-2")}>
              {v === "uf" ? "Estados" : "Regiões"}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("grid gap-6", !p.compact && "xl:grid-cols-[1fr_340px]")}>
      <div className="min-w-0 space-y-4">
        {!p.compact && (
          <nav aria-label="Território" className="flex flex-wrap items-center gap-1 font-display text-[15px] font-semibold tracking-wide uppercase">
            {data.breadcrumb.map((b, i) => (
              <span key={b.key} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={14} className="text-fg-3" aria-hidden />}
                {i < data.breadcrumb.length - 1 ? (
                  <button type="button" onClick={() => setParentKey(b.key === "R:" ? "BR" : b.key)} className="text-fg-3 hover:text-fg">
                    {b.name}
                  </button>
                ) : (
                  <span className="text-fg">{b.name}</span>
                )}
              </span>
            ))}
            <span className="ml-2 font-sans text-[11.5px] font-normal tracking-normal text-fg-3 normal-case">· {GEO_LEVEL_LABEL[childLevel]}s</span>
          </nav>
        )}
        {controls}
        <p className="text-[12.5px] text-fg-2">{layer === "tema" ? `Onde ${TOPIC_LABEL[topic].toLowerCase()} está sendo mais discutido?` : layerMeta.question}</p>

        <div className="relative" onMouseLeave={() => setHover(null)}>
          {data.unavailableReason && !data.rows.length ? (
            <StateView state="no_data" title="Sem dados neste nível">{data.unavailableReason}</StateView>
          ) : status === "error" ? (
            <StateView state="error" action={<button className="text-info" onClick={load}>Tentar novamente</button>}>Não foi possível carregar o mapa.</StateView>
          ) : (
            <div className={cn("transition-opacity", status === "loading" && "opacity-60")} aria-busy={status === "loading"}>
              <MapCanvas
                boundaries={boundaries}
                rows={data.rows}
                layer={layer}
                entities={p.entities}
                selectedKey={selected}
                onHover={(k, pos) => setHover(k && pos ? { key: k, ...pos } : null)}
                onActivate={activate}
                height={p.compact ? 340 : 520}
              />
              {focusKeys && focusKeys.size > 0 && layer !== "tendencia" && (
                <p className="mt-1 text-[11.5px] text-fg-3">
                  {focusKeys.size} território(s) com alta ≥ 20% no volume. Use a camada <button className="text-info" onClick={() => setLayer("tendencia")}>Tendência</button> para vê-los.
                </p>
              )}
            </div>
          )}
          <AnimatePresence>
            {hover && byKey.get(hover.key) && (
              <motion.div
                role="tooltip"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="pointer-events-none absolute z-20 hidden w-[270px] rounded-[var(--radius-md)] border border-border-strong bg-elevated/95 px-3 py-2.5 shadow-2xl backdrop-blur md:block"
                style={{ left: Math.min(hover.x + 16, 9999), top: hover.y + 12, transform: hover.x > 420 ? "translateX(calc(-100% - 32px))" : undefined }}
              >
                {tooltip(byKey.get(hover.key)!)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <MapLegend layer={layer} max={max} entities={p.entities} topicLabel={TOPIC_LABEL[topic]} byParty={layer === "partido"} />
          <p className="max-w-[420px] text-[11px] leading-snug text-fg-3">
            <Info size={11} className="mr-1 inline -translate-y-px" aria-hidden />
            {layer === "partido" || layer === "candidato"
              ? "A cor identifica quem é mais mencionado; a intensidade, sua participação nas menções. Não indica apoio nem intenção de voto."
              : `Considera ${data.coverage.coveragePercentage === null ? "—" : fmtPct(data.coverage.coveragePercentage)} das publicações (localização inferida, não exata). Valores absolutos acompanham o tamanho da população.`}
          </p>
        </div>

        {/* Mobile: detalhe do território tocado */}
        {detail && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3 md:hidden">
            {tooltip(detail)}
            {detail.hasChildren && !p.compact && (
              <button type="button" onClick={() => drill(detail.key)} className="mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-[var(--radius-md)] bg-fg text-[12.5px] font-medium text-bg">
                Abrir {detail.name} <ChevronRight size={14} aria-hidden />
              </button>
            )}
          </div>
        )}

        {!p.compact && p.series.length > 0 && (
          <TimeScrubber
            series={p.series}
            startsAt={p.startsAt}
            totalEnd={p.totalEnd}
            now={p.now}
            value={to}
            windowMode={winMode}
            onWindowMode={setWinMode}
            events={p.events}
            onChange={(v, ev) => {
              setFollowNow(v >= p.now);
              setTo(Math.min(v, p.now));
              setFocusEvent(ev ?? null);
              if (ev) setLayer("tendencia");
            }}
            focusEvent={focusEvent}
          />
        )}
      </div>

      {!p.compact ? (
        <aside className="min-w-0 space-y-5 xl:border-l xl:border-border xl:pl-6" aria-label="Detalhes do território">
          <dl className="grid grid-cols-3 gap-3 border-b border-border pb-4 text-[11.5px]" aria-label="Cobertura geográfica">
            <div>
              <dt className="text-fg-3">Analisadas</dt>
              <dd className="mt-0.5 font-display text-[15px] font-semibold tnum">{fmtInt(data.coverage.totalRecords)}</dd>
            </div>
            <div>
              <dt className="text-fg-3">Com localização</dt>
              <dd className="mt-0.5 font-display text-[15px] font-semibold tnum">{fmtInt(data.coverage.geolocatedRecords)}</dd>
            </div>
            <div>
              <dt className="text-fg-3">Cobertura</dt>
              <dd className="mt-0.5 font-display text-[15px] font-semibold tnum">{data.coverage.coveragePercentage === null ? "—" : fmtPct(data.coverage.coveragePercentage)}</dd>
            </div>
            <dd className="col-span-3 text-[10.5px] leading-snug text-fg-3">Localização inferida (perfil, menção ou geotag) — nunca tratada como exata. Precisão: {Object.entries(data.coverage.byPrecision).map(([k, v]) => `${{ municipality: "município", state: "estado", country: "país", unknown: "desconhecida" }[k]} ${fmtPct((v ?? 0) / Math.max(1, data.coverage.geolocatedRecords))}`).join(" · ")}.</dd>
          </dl>
          <div>
            <p className="eyebrow">Recorte</p>
            <p className="mt-1 font-display text-[28px] leading-none font-semibold tnum">{fmtInt(layer === "tema" ? data.totals.topicPosts : data.totals.posts)}</p>
            <p className="mt-1 text-[12px] text-fg-3">
              publicações geolocalizadas · {winMode === "janela" ? `${wallClock(p.startsAt, Math.max(0, to - WINDOW), false)}–` : "até "}
              {wallClock(p.startsAt, to, false)}
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="eyebrow">{GEO_LEVEL_LABEL[childLevel]}s</p>
              <p className="text-[10.5px] text-fg-3">ordenado por {layer === "tendencia" ? "variação" : "volume"}</p>
            </div>
            <table className="w-full font-[family-name:var(--font-data)] text-[12px]">
              <thead className="sr-only">
                <tr>
                  <th>Território</th>
                  <th>Mais mencionado</th>
                  <th>Publicações</th>
                  <th>Variação</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(0, 14).map((r) => {
                  const e = entity(r.predominantCandidateId);
                  return (
                    <tr
                      key={r.key}
                      onMouseEnter={() => setSelected(r.key)}
                      onMouseLeave={() => setSelected(null)}
                      onClick={() => drill(r.key)}
                      className={cn("cursor-pointer border-b border-border/70 last:border-0", selected === r.key && "bg-elevated")}
                    >
                      <td className="max-w-[120px] truncate py-1.5 pr-2 text-fg">{r.level === "uf" ? r.shortName : r.name}</td>
                      <td className="py-1.5 pr-2">
                        {e && <span className="mr-1.5 inline-block size-2 rounded-[2px]" style={{ background: e.color }} aria-hidden />}
                        <span className="text-fg-3">{e ? (layer === "partido" ? e.partyAcronym : e.name.split(" ")[0]) : "—"}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-right text-fg tnum">{fmtInt(r.topicPosts)}</td>
                      <td className="w-[74px] py-1.5 text-right text-[11.5px]">
                        <Delta value={r.trend} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tableRows.length > 14 && <p className="mt-1 text-[11px] text-fg-3">+{tableRows.length - 14} territórios no mapa</p>}
          </div>
          <div className="space-y-2 border-t border-border pt-4 text-[11.5px] leading-snug text-fg-3">
            <p>Níveis disponíveis para repercussão: Brasil → Região → Estado → Município. Zona, local e seção existem somente nos dados oficiais.</p>
            <Link href="/eleicoes" className="inline-flex items-center gap-1 text-fg-2 hover:text-fg">
              Resultados oficiais no Explorador eleitoral <ArrowUpRight size={12} aria-hidden />
            </Link>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
