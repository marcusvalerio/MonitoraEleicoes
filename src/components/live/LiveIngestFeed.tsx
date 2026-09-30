"use client";

import { useEffect, useRef, useState } from "react";
import type { Connection, LiveState } from "@/domain/live";
import { speakerStatus, type SpeechClassification, type TranscriptSegment } from "@/domain/types";
import { RELEVANCE_LABEL, SPEECH_TYPE_LABEL, TIMING_LABEL, TOPIC_LABEL } from "@/domain/labels";
import { fmtDecimal, fmtSeconds, fmtTime } from "@/lib/live-format";
import { fmtInt } from "@/lib/format";
import { LiveDot, Tag } from "@/components/ui/primitives";

export interface SpeakerInfo {
  name: string;
  color: string;
}

const CONNECTION: Record<Connection, { label: string; tone: "pos" | "warn" | "neg" | "neutral" | "info" }> = {
  online: { label: "Online", tone: "pos" },
  stale: { label: "Sem sinal do worker", tone: "warn" },
  connecting: { label: "Conectando", tone: "info" },
  paused: { label: "Pausado", tone: "warn" },
  finished: { label: "Encerrado", tone: "neutral" },
  not_started: { label: "Não iniciado", tone: "neutral" },
  error: { label: "Erro", tone: "neg" },
  unknown: { label: "Desconhecida", tone: "neutral" },
};

const POLL_MS = 2000;

/**
 * Feed ao vivo alimentado SOMENTE pela API `/api/debates/[id]/live` (Repository → PostgreSQL).
 * Busca incremental por cursor (`after=<seq>`): atualizar a página reconstrói tudo a partir do banco.
 */
export function LiveIngestFeed({ initial, speakers }: { initial: LiveState; speakers: Record<string, SpeakerInfo> }) {
  const [state, setState] = useState(initial);
  const [segments, setSegments] = useState<TranscriptSegment[]>(initial.segments);
  const [cls, setCls] = useState<Map<string, SpeechClassification>>(() => new Map(initial.classifications.map((c) => [c.segmentId, c])));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const cursor = useRef(initial.lastSeq);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const res = await fetch(`/api/debates/${encodeURIComponent(initial.debateId)}/live?after=${cursor.current}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = (await res.json()) as LiveState;
        if (!alive) return;
        if (next.segments.length) {
          cursor.current = next.lastSeq;
          setSegments((prev) => {
            const seen = new Set(prev.map((s) => s.id));
            return [...prev, ...next.segments.filter((s) => !seen.has(s.id))];
          });
        }
        if (next.classifications.length) setCls((prev) => new Map([...prev, ...next.classifications.map((c) => [c.segmentId, c] as const)]));
        setState(next);
        setFetchError(null);
      } catch (e) {
        if (alive) setFetchError(e instanceof Error ? e.message : String(e));
      }
      if (alive) timer = setTimeout(tick, POLL_MS);
    }
    timer = setTimeout(tick, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [initial.debateId]);

  const isReplay = state.sourceMode === "replay" || state.control?.sourceMode === "replay";
  const isTrulyLive = state.sourceMode === "live" && state.connection === "online";
  const conn = CONNECTION[state.connection];
  const ordered = [...segments].sort((a, b) => b.seq - a.seq);

  return (
    <div className="space-y-4">
      <section aria-label="Estado da ingestão" className="rounded-[var(--radius-md)] border border-border bg-surface p-4" data-testid="live-status">
        <div className="flex flex-wrap items-center gap-3">
          {isTrulyLive ? (
            <LiveDot />
          ) : isReplay ? (
            <span className="inline-flex items-center gap-1.5 text-2xs font-semibold tracking-wider text-info" data-testid="replay-badge">
              <span className="size-1.5 rounded-full bg-info" aria-hidden />
              REPLAY{state.control?.speed ? ` ${state.control.speed}×` : ""}
            </span>
          ) : (
            <span className="text-2xs font-semibold tracking-wider text-fg-3">FONTE: {state.sourceMode === "file" ? "ARQUIVO" : "DESCONHECIDA"}</span>
          )}
          <h2 className="text-sm font-semibold text-fg">{state.title}</h2>
        </div>
        {isReplay && (
          <p className="mt-2 text-[12px] text-fg-3" data-testid="replay-note">
            Reprodução de transcrição já importada, entregue progressivamente pelo mesmo pipeline de produção. Horários são sintéticos (gerados para o replay) — não é transmissão ao vivo e não são horários históricos.
          </p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-[family-name:var(--font-data)] text-[12.5px] sm:grid-cols-4">
          <div>
            <dt className="text-fg-3">Conexão</dt>
            <dd data-testid="live-connection">
              <Tag tone={conn.tone} dot>
                {conn.label}
              </Tag>
            </dd>
          </div>
          <div>
            <dt className="text-fg-3" title="Da coleta do segmento até a análise gravada no banco (mediana dos últimos segmentos)">
              Latência de processamento
            </dt>
            <dd className="text-fg tnum" data-testid="live-latency">
              {fmtSeconds(state.latency.processingS)}
            </dd>
          </div>
          <div>
            <dt className="text-fg-3">Segmentos</dt>
            <dd className="text-fg tnum" data-testid="live-segments">
              {fmtInt(state.totals.segments)}
            </dd>
          </div>
          <div>
            <dt className="text-fg-3">Analisados</dt>
            <dd className="text-fg tnum" data-testid="live-analyzed">
              {fmtInt(state.totals.analyzed)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[11.5px] text-fg-3">
          Ingestão {fmtSeconds(state.latency.ingestionS)} · análise {fmtSeconds(state.latency.analysisS)} · captura {fmtSeconds(state.latency.captureS)}
          {isReplay ? " (não se aplica a replay)" : ""} · ponta a ponta {fmtSeconds(state.latency.endToEndS)}
        </p>
        {state.control?.lastError && state.connection !== "online" && <p className="mt-2 text-[12px] text-warn">Último erro: {state.control.lastError}</p>}
        {fetchError && (
          <p className="mt-2 text-[12px] text-warn" role="status">
            Falha ao atualizar ({fetchError}). Tentando novamente…
          </p>
        )}
      </section>

      {ordered.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-border p-6 text-center text-[13px] text-fg-3" data-testid="live-empty">
          Nenhum segmento recebido ainda.
        </p>
      ) : (
        <ol className="space-y-3" aria-live="polite" data-testid="live-feed">
          {ordered.map((s) => {
            const c = cls.get(s.id) ?? null;
            const sp = speakers[s.speakerId];
            const status = speakerStatus(s);
            const synthetic = s.timing?.precision === "synthetic";
            return (
              <li key={s.id} id={`seg-${s.id}`} className="rounded-[var(--radius-md)] border border-border bg-surface p-4" data-testid="live-segment">
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
                  <span className="font-[family-name:var(--font-data)] tnum text-fg-2" data-testid="seg-time">
                    {fmtTime(s.capture?.sourceTime ?? null)}
                  </span>
                  {synthetic && <Tag tone="info">horário sintético</Tag>}
                  {s.startOffset === null && <Tag>{TIMING_LABEL[s.timing?.precision ?? "unknown"]}</Tag>}
                </div>
                <p className="mt-1 flex items-center gap-2 text-[13px] font-semibold text-fg" data-testid="seg-speaker">
                  {sp && <span className="size-2 rounded-full" style={{ background: sp.color }} aria-hidden />}
                  {status === "unknown" ? "Orador não identificado" : (sp?.name ?? s.speakerName ?? "Orador não identificado")}
                  {status === "uncertain" && <Tag tone="warn">identificação incerta</Tag>}
                </p>
                <blockquote className="mt-2 text-[14px] leading-relaxed text-fg">“{s.text}”</blockquote>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-6">
                  <Field k="Tema" v={c ? TOPIC_LABEL[c.topic] : "—"} />
                  <Field k="Subtema" v={c?.subtopic ?? "—"} />
                  <Field k="Tipo" v={c ? SPEECH_TYPE_LABEL[c.speechType] : "—"} />
                  <Field k="Relevância" v={c ? RELEVANCE_LABEL[c.relevance] : "—"} />
                  <Field k="Confiança" v={fmtDecimal(c?.confidence ?? null)} />
                  <Field k="Modelo" v={c ? `${c.model.model} ${c.model.version}` : "aguardando análise"} />
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-fg-3">{k}</dt>
      <dd className="text-fg-2">{v}</dd>
    </div>
  );
}
