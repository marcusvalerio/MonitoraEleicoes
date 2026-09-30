"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, Radio, Search, X } from "lucide-react";
import type { Candidate, DebateBlock, DebateEvent, Party, SpeechClassification, TopicId, TranscriptSegment } from "@/domain/types";
import { RELEVANCE_LABEL, TOPIC_LABEL } from "@/domain/labels";
import { Avatar, LiveDot, NatureBadge, Panel } from "@/components/ui/primitives";
import { Notice, StateView } from "@/components/ui/states";
import { ClassificationTags } from "./tags";
import { AnalysisPanel } from "./AnalysisPanel";
import { EventList } from "./EventList";
import { fmtClock, fmtDuration, wallClock } from "@/lib/format";
import { demoReplayOffset } from "@/lib/demo-clock";
import { cn } from "@/lib/cn";
import { useOnline } from "@/components/shell/OfflineBanner";

type Participant = Candidate & { party: Party | null };
interface InProgress {
  speakerId: string;
  startOffset: number;
  blockId: string;
}

export interface LiveDebateProps {
  debate: { id: string; title: string; startsAt: string; broadcaster: string; mode: "demo" | "live" };
  participants: Participant[];
  blocks: DebateBlock[];
  initial: { offset: number; totalEnd: number; segments: TranscriptSegment[]; classifications: SpeechClassification[]; events: DebateEvent[]; inProgress: InProgress | null };
  focusSegmentId?: string | null;
  moderatorId: string;
}

const SPEEDS = [1, 4, 16] as const;
const POLL_MS = 2500;

export function LiveDebate({ debate, participants, blocks, initial, focusSegmentId, moderatorId }: LiveDebateProps) {
  const online = useOnline();
  const [offset, setOffset] = useState(initial.offset);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [segments, setSegments] = useState(initial.segments);
  const [cls, setCls] = useState(initial.classifications);
  const [events, setEvents] = useState(initial.events);
  const [inProgress, setInProgress] = useState<InProgress | null>(initial.inProgress);
  const [status, setStatus] = useState<"ok" | "error">("ok");
  const [selected, setSelected] = useState<string | null>(focusSegmentId ?? null);
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState<TopicId | "">("");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [q, setQ] = useState("");
  const [mobileTab, setMobileTab] = useState<"transcricao" | "analise" | "eventos">("transcricao");
  const cursorRef = useRef(initial.segments.at(-1)?.endOffset ?? 0);
  const offsetRef = useRef(offset);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  const ended = offset >= initial.totalEnd;

  // Relógio (replay em demo; em produção, derivado do horário real)
  useEffect(() => {
    if (!playing || ended) return;
    const id = setInterval(() => setOffset((o) => Math.min(initial.totalEnd, o + speed)), 1000);
    return () => clearInterval(id);
  }, [playing, speed, ended, initial.totalEnd]);

  const fetchWindow = useCallback(
    async (from: number, to: number, replace = false) => {
      try {
        const r = await fetch(`/api/debates/${debate.id}/feed?from=${from}&to=${Math.floor(to)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { segments: TranscriptSegment[]; classifications: SpeechClassification[]; events: DebateEvent[]; inProgress: InProgress | null };
        setSegments((prev) => {
          const base = replace ? [] : prev;
          const seen = new Set(base.map((s) => s.id));
          return [...base, ...j.segments.filter((s) => !seen.has(s.id))];
        });
        setCls((prev) => {
          const base = replace ? [] : prev;
          const seen = new Set(base.map((s) => s.segmentId));
          return [...base, ...j.classifications.filter((s) => !seen.has(s.segmentId))];
        });
        setEvents(j.events);
        setInProgress(j.inProgress);
        if (j.segments.length) cursorRef.current = j.segments.at(-1)!.endOffset;
        else if (replace) cursorRef.current = 0;
        setStatus("ok");
      } catch {
        setStatus("error");
      }
    },
    [debate.id],
  );

  // Ingestão incremental: só busca a janela nova (cursor → agora)
  useEffect(() => {
    if (!online) return;
    const id = setInterval(() => {
      const to = offsetRef.current;
      if (to > cursorRef.current) fetchWindow(cursorRef.current, to);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchWindow, online]);

  const goLive = () => {
    const target = debate.mode === "demo" ? demoReplayOffset(Date.now(), initial.totalEnd) : offset;
    if (target < cursorRef.current) fetchWindow(0, target, true);
    setOffset(target);
    setPlaying(true);
    setSelected(null);
  };

  const clsById = useMemo(() => new Map(cls.map((c) => [c.segmentId, c])), [cls]);
  const byId = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const people = useMemo(() => participants.map((p) => ({ id: p.id, name: p.name })), [participants]);

  const latestCandidateSeg = useMemo(() => [...segments].reverse().find((s) => s.speakerId !== moderatorId) ?? null, [segments, moderatorId]);
  const following = selected === null;
  const selectedSeg = following ? latestCandidateSeg : (segments.find((s) => s.id === selected) ?? null);
  const selectedCls = selectedSeg ? (clsById.get(selectedSeg.id) ?? null) : null;

  // Scroll até fala focada via URL
  useEffect(() => {
    if (!focusSegmentId) return;
    const el = document.getElementById(`seg-${focusSegmentId}`);
    el?.scrollIntoView({ block: "center" });
  }, [focusSegmentId]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...segments]
      .reverse()
      .filter((s) => {
        const c = clsById.get(s.id);
        if (speakerFilter && s.speakerId !== speakerFilter) return false;
        if (topicFilter && c?.topic !== topicFilter) return false;
        if (onlyHigh && c?.relevance !== "alta") return false;
        if (term && !s.text.toLowerCase().includes(term)) return false;
        return true;
      });
  }, [segments, clsById, speakerFilter, topicFilter, onlyHigh, q]);

  const stats = useMemo(() => {
    const m = new Map<string, { secs: number; n: number }>();
    for (const s of segments) {
      const x = m.get(s.speakerId) ?? { secs: 0, n: 0 };
      x.secs += s.endOffset - s.startOffset;
      x.n++;
      m.set(s.speakerId, x);
    }
    return m;
  }, [segments]);

  const currentBlock = blocks.find((b) => offset >= b.startOffset && offset < b.endOffset) ?? blocks.at(-1);
  const speaker = inProgress && !ended ? byId.get(inProgress.speakerId) : null;
  const speakerIsModerator = inProgress?.speakerId === moderatorId && !ended;
  const currentTalk = inProgress ? offset - inProgress.startOffset : 0;
  const maxSecs = Math.max(1, ...participants.map((p) => (stats.get(p.id)?.secs ?? 0) + (inProgress?.speakerId === p.id ? currentTalk : 0)));
  const topicsSeen = useMemo(() => [...new Set(cls.map((c) => c.topic).filter((t) => t !== "outros"))], [cls]);
  const activeFilters = !!(speakerFilter || topicFilter || onlyHigh || q);

  const speakerPanelFor = (compact: boolean) => (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <span className="eyebrow">Falando agora</span>
          {!ended && <LiveDot label="" />}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={inProgress?.speakerId ?? "none"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="mt-3">
            {speaker ? (
              <div className="flex items-center gap-3">
                <Avatar initials={speaker.initials} color={speaker.swatch} size={44} />
                <div className="min-w-0">
                  <p className="font-display text-[20px] leading-tight font-semibold tracking-tight text-fg uppercase">{speaker.name}</p>
                  <p className="text-[12px] text-fg-3">
                    {speaker.party?.acronym} · {speaker.party?.name}
                  </p>
                </div>
              </div>
            ) : speakerIsModerator ? (
              <p className="font-display text-[20px] font-semibold text-fg-2 uppercase">Moderação</p>
            ) : (
              <p className="text-[13px] text-fg-3">{ended ? "Debate encerrado." : "Intervalo / sem fala detectada."}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {speaker && (
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-md)] border border-border bg-border text-center">
          {[
            ["Fala atual", fmtClock(currentTalk).slice(3)],
            ["Total", fmtDuration((stats.get(speaker.id)?.secs ?? 0) + currentTalk)],
            ["Falas", String((stats.get(speaker.id)?.n ?? 0) + 1)],
          ].map(([l, v]) => (
            <div key={l} className="bg-surface px-2 py-2.5">
              <dt className="eyebrow text-[9.5px]">{l}</dt>
              <dd className="tnum mt-1 font-display text-[17px] font-semibold text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className={compact ? "hidden" : undefined}>
        <p className="eyebrow mb-2">Tempo de fala acumulado</p>
        <ul className="space-y-2">
          {participants.map((p) => {
            const secs = (stats.get(p.id)?.secs ?? 0) + (inProgress?.speakerId === p.id && !ended ? currentTalk : 0);
            const active = inProgress?.speakerId === p.id && !ended;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setSpeakerFilter(speakerFilter === p.id ? null : p.id)} className={cn("w-full rounded-[var(--radius-sm)] px-1 py-1 text-left", speakerFilter === p.id && "bg-elevated")} aria-pressed={speakerFilter === p.id} title="Filtrar transcrição por participante">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="size-2 rounded-full" style={{ background: p.swatch }} aria-hidden />
                    <span className={active ? "text-fg" : "text-fg-2"}>{p.name}</span>
                    <span className="ml-auto tnum text-fg-3">{fmtDuration(secs)}</span>
                  </div>
                  <div className="mt-1 ml-4 h-1 overflow-hidden rounded-full bg-elevated">
                    <motion.div className="h-full rounded-full" style={{ background: active ? "#f2f2f0" : "#68686e" }} animate={{ width: `${(secs / maxSecs) * 100}%` }} transition={{ duration: 0.6 }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-fg-3">Tempo de fala não é medida de desempenho.</p>
      </div>
      {currentBlock && !compact && (
        <div className="border-t border-border pt-3">
          <p className="eyebrow mb-1.5">Bloco</p>
          <p className="text-[12.5px] text-fg">{currentBlock.label}</p>
          <div className="mt-2 flex gap-[2px]">
            {blocks.map((b) => (
              <span key={b.id} className={cn("h-1 rounded-full", b.id === currentBlock.id ? "bg-fg" : offset > b.endOffset ? "bg-fg-3" : "bg-elevated")} style={{ flex: b.endOffset - b.startOffset }} title={b.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const speakerPanel = speakerPanelFor(false);

  const transcript = (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <label className="relative min-w-[160px] flex-1">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na transcrição" aria-label="Buscar na transcrição" className="h-7 w-full rounded-[var(--radius-md)] border border-border bg-bg pr-2 pl-7 text-[12px] text-fg outline-none placeholder:text-fg-3 focus:border-border-strong" />
        </label>
        <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value as TopicId | "")} aria-label="Filtrar por tema" className="h-7 rounded-[var(--radius-md)] border border-border bg-bg px-2 text-[12px] text-fg-2">
          <option value="">Todos os temas</option>
          {topicsSeen.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABEL[t]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setOnlyHigh((v) => !v)} aria-pressed={onlyHigh} className={cn("h-7 rounded-[var(--radius-md)] border px-2 text-[12px]", onlyHigh ? "border-border-strong bg-elevated text-fg" : "border-border text-fg-3 hover:text-fg-2")}>
          Relevância alta
        </button>
        {activeFilters && (
          <button type="button" onClick={() => (setSpeakerFilter(null), setTopicFilter(""), setOnlyHigh(false), setQ(""))} className="flex h-7 items-center gap-1 px-1.5 text-[12px] text-fg-3 hover:text-fg">
            <X size={12} aria-hidden /> Limpar
          </button>
        )}
      </div>
      <ol className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" aria-live="polite" aria-relevant="additions">
        {!ended && inProgress && !activeFilters && (
          <li className="flex items-center gap-3 px-4 py-3 text-[12px] text-fg-3">
            <span className="w-[58px] shrink-0 font-mono text-[11px]">{wallClock(debate.startsAt, inProgress.startOffset)}</span>
            <span className="flex items-center gap-2">
              <span className="flex gap-0.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1 animate-pulse-dot rounded-full bg-fg-3" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </span>
              Transcrevendo fala de {byId.get(inProgress.speakerId)?.name ?? "moderação"}…
            </span>
          </li>
        )}
        <AnimatePresence initial={false}>
          {visible.map((s) => {
            const c = clsById.get(s.id);
            const p = byId.get(s.speakerId);
            const isMod = s.speakerId === moderatorId;
            const isSel = selectedSeg?.id === s.id;
            return (
              <motion.li key={s.id} id={`seg-${s.id}`} layout="position" initial={{ opacity: 0, backgroundColor: "#1d1d20" }} animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }} transition={{ duration: 0.9 }}>
                <button type="button" onClick={() => (setSelected(s.id), setMobileTab("analise"))} className={cn("group flex w-full gap-3 px-4 py-3 text-left transition-colors", isSel ? "bg-elevated" : "hover:bg-elevated/50")} aria-current={isSel ? "true" : undefined}>
                  <span className="w-[58px] shrink-0 pt-0.5 font-mono text-[11px] text-fg-3">{wallClock(debate.startsAt, s.startOffset)}</span>
                  <span className={cn("mt-1.5 w-[3px] shrink-0 self-stretch rounded-full", isSel ? "opacity-100" : "opacity-60")} style={{ background: p?.swatch ?? "#34343a" }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[11px] font-semibold tracking-wider uppercase", isMod ? "text-fg-3" : "text-fg")}>{p?.name ?? "Moderação"}</span>
                    <span className={cn("mt-0.5 block text-[13.5px] leading-relaxed", isMod ? "text-fg-3" : "text-fg-2 group-hover:text-fg")}>“{s.text}”</span>
                    {c && !isMod && (
                      <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ClassificationTags c={c} />
                        <span className="text-[10.5px] text-fg-3 tnum">
                          relevância {RELEVANCE_LABEL[c.relevance].toLowerCase()} · conf. {c.confidence.toFixed(2)}
                        </span>
                      </span>
                    )}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {visible.length === 0 && (
          <li>
            <StateView state={segments.length ? "no_data" : "processing"} compact>
              {segments.length ? "Nenhuma fala corresponde aos filtros." : "Aguardando as primeiras falas transcritas."}
            </StateView>
          </li>
        )}
      </ol>
    </div>
  );

  const analysis = <AnalysisPanel segment={selectedSeg} c={selectedCls} people={people} startsAt={debate.startsAt} following={following} />;
  const eventList = events.length ? (
    <EventList events={events} startsAt={debate.startsAt} debateId={debate.id} dense onSelect={(e) => e.segmentIds[0] && (setSelected(e.segmentIds.at(-1)!), setMobileTab("analise"))} />
  ) : (
    <StateView state="empty" compact>Nenhum evento detectado ainda.</StateView>
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6">
      {/* Barra do evento */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {ended ? <span className="text-2xs font-semibold tracking-wider text-fg-3">ENCERRADO</span> : <LiveDot label={debate.mode === "demo" ? "AO VIVO · REPLAY" : "AO VIVO"} />}
            <NatureBadge nature="collected" compact />
          </div>
          <h1 className="mt-1 font-display text-[22px] leading-tight font-bold tracking-tight uppercase md:text-[26px]">{debate.title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="tnum font-display text-[22px] leading-none font-semibold text-fg">{wallClock(debate.startsAt, offset)}</p>
            <p className="mt-1 text-[11px] text-fg-3 tnum">+{fmtClock(offset)} desde o início</p>
          </div>
          <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-1" role="group" aria-label="Controles de replay">
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pausar" : "Retomar"} className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-2 hover:bg-elevated hover:text-fg">
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            {debate.mode === "demo" &&
              SPEEDS.map((s) => (
                <button key={s} type="button" onClick={() => setSpeed(s)} aria-pressed={speed === s} className={cn("h-7 rounded-[var(--radius-sm)] px-2 text-[11.5px] tnum", speed === s ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg-2")}>
                  {s}×
                </button>
              ))}
            <button type="button" onClick={goLive} className="flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[11.5px] text-fg-3 hover:bg-elevated hover:text-fg" title="Voltar ao instante atual">
              <Radio size={12} aria-hidden /> Ao vivo
            </button>
          </div>
        </div>
      </div>

      {(!online || status === "error") && (
        <Notice state={online ? "provider_unavailable" : "offline"} className="mb-3">
          {online ? "Não foi possível buscar novas falas. Tentando novamente automaticamente; os dados abaixo continuam válidos." : "Sem conexão. A transcrição será atualizada quando a conexão voltar."}
        </Notice>
      )}

      {/* Mobile: falante compacto + abas */}
      <div className="space-y-3 lg:hidden">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">{speakerPanelFor(true)}</div>
        <div className="sticky top-12 z-20 -mx-4 flex border-b border-border bg-bg/95 px-4 backdrop-blur" role="tablist">
          {(
            [
              ["transcricao", "Transcrição"],
              ["analise", "Análise"],
              ["eventos", `Eventos · ${events.length}`],
            ] as const
          ).map(([id, l]) => (
            <button key={id} role="tab" aria-selected={mobileTab === id} onClick={() => setMobileTab(id)} className={cn("h-10 flex-1 border-b-2 text-[12.5px]", mobileTab === id ? "border-fg text-fg" : "border-transparent text-fg-3")}>
              {l}
            </button>
          ))}
        </div>
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface">
          {mobileTab === "transcricao" && <div className="max-h-[70dvh] overflow-hidden">{transcript}</div>}
          {mobileTab === "analise" && <div className="p-4">{analysis}</div>}
          {mobileTab === "eventos" && <div className="p-4">{eventList}</div>}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[1fr_360px] xl:grid-cols-[280px_1fr_380px]">
        <div className="hidden xl:block">
          <div className="sticky top-16 rounded-[var(--radius-lg)] border border-border bg-surface p-4">{speakerPanel}</div>
        </div>
        <section className="flex h-[calc(100dvh-160px)] min-h-[520px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface" aria-label="Transcrição">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[13px] font-medium">Transcrição</h2>
              <p className="text-[12px] text-fg-3">
                {segments.length} falas · mais recentes primeiro{activeFilters && ` · ${visible.length} exibidas`}
              </p>
            </div>
            <NatureBadge nature="collected" compact />
          </header>
          {transcript}
        </section>
        <div className="h-[calc(100dvh-160px)] min-h-[520px] space-y-4 overflow-y-auto pr-0.5">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 xl:hidden">{speakerPanel}</div>
          <Panel variant="card" title="Análise atual" bodyClassName="p-4">
            {analysis}
            {!following && (
              <button type="button" onClick={() => setSelected(null)} className="mt-3 text-[12px] text-fg-3 underline decoration-border-strong underline-offset-2 hover:text-fg">
                Seguir a fala mais recente
              </button>
            )}
          </Panel>
          <Panel variant="card" title="Eventos" question={`${events.length} detectados`} nature="analysis">
            {eventList}
          </Panel>
        </div>
      </div>
    </div>
  );
}
