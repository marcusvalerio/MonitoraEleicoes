"use client";

import Link from "next/link";
import { Check, Minus, Sparkles } from "lucide-react";
import type { SpeechClassification, TranscriptSegment } from "@/domain/types";
import { FACT_CHECK_LABEL, RELEVANCE_LABEL, SPEECH_TYPE_LABEL, TONE_LABEL, TOPIC_LABEL } from "@/domain/labels";
import { RELEVANCE_WEIGHTS } from "@/domain/relevance";
import { Tag, NatureBadge } from "@/components/ui/primitives";
import { FACT_TAG, TONE_TAG } from "./tags";
import { fmtDateTime, wallClock } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Person {
  id: string;
  name: string;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className="text-[13px] text-fg">{children}</dd>
    </div>
  );
}

/** Análise do segmento selecionado — IA sempre identificada e com critérios expostos. */
export function AnalysisPanel({ segment, c, people, startsAt, following }: { segment: TranscriptSegment | null; c: SpeechClassification | null; people: Person[]; startsAt: string; following: boolean }) {
  if (!segment || !c) {
    return <p className="py-8 text-center text-[12px] text-fg-3">Selecione uma fala para ver a classificação.</p>;
  }
  const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? "Moderação") : "—");
  const f = c.relevanceFeatures;
  const criteria = [
    { label: "Afirmação verificável", on: f.verifiableClaim, w: RELEVANCE_WEIGHTS.verifiableClaim },
    { label: "Medida concreta", on: f.concreteProposal, w: RELEVANCE_WEIGHTS.concreteProposal },
    { label: "Menciona participante", on: f.mentionsOther, w: RELEVANCE_WEIGHTS.mentionsOther },
    { label: "Gerou resposta direta", on: f.triggersReply, w: RELEVANCE_WEIGHTS.triggersReply },
    { label: `Variação social (${Math.round(f.socialLift * 100)}%)`, on: f.socialLift > 0, w: Math.round(RELEVANCE_WEIGHTS.socialLift * f.socialLift * 100) / 100 },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-fg-3">
          {following ? "Fala mais recente" : "Fala selecionada"} · <span className="font-mono">{wallClock(startsAt, segment.startOffset)}</span> · {name(segment.speakerId)}
        </span>
        <NatureBadge nature="ai" compact />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <Field label="Tema">
          <span className="font-display text-[18px] font-semibold tracking-tight uppercase">{TOPIC_LABEL[c.topic]}</span>
        </Field>
        <Field label="Subtema">
          <span className="font-display text-[18px] font-semibold tracking-tight uppercase text-fg-2">{c.subtopic ?? "—"}</span>
        </Field>
        <Field label="Tipo">
          <Tag tone="strong">{SPEECH_TYPE_LABEL[c.speechType]}</Tag>
        </Field>
        <Field label="Tom">
          <Tag tone={TONE_TAG[c.tone]} dot>
            {TONE_LABEL[c.tone]}
          </Tag>
        </Field>
        <Field label="Relevância">
          <span className="flex items-baseline gap-1.5">
            <span className="font-medium uppercase">{RELEVANCE_LABEL[c.relevance]}</span>
            <span className="text-[11.5px] text-fg-3 tnum">{c.relevanceScore.toFixed(2)}</span>
          </span>
        </Field>
        <Field label="Fact-check">
          <Tag tone={FACT_TAG[c.factCheck]}>{FACT_CHECK_LABEL[c.factCheck]}</Tag>
        </Field>
        <Field label="Alvo">{name(c.targetId)}</Field>
        <Field label="Menções">{c.mentions.length ? c.mentions.map((m) => name(m)).join(", ") : "—"}</Field>
        <Field label="Confiança do modelo" className="col-span-2">
          <div className="flex items-center gap-2">
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
              <span className="absolute inset-y-0 left-0 rounded-full bg-fg-2" style={{ width: `${c.confidence * 100}%` }} />
            </span>
            <span className="tnum w-10 text-right text-[12.5px]">{c.confidence.toFixed(2)}</span>
          </div>
          {c.confidence < 0.7 && <p className="mt-1 text-[11.5px] text-warn">Confiança baixa — trate a classificação com cautela.</p>}
        </Field>
      </dl>

      <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
        <p className="eyebrow mb-2">Por que esta relevância?</p>
        <ul className="space-y-1">
          {criteria.map((k) => (
            <li key={k.label} className="flex items-center gap-2 text-[12px]">
              {k.on ? <Check size={12} className="text-fg" aria-label="atende" /> : <Minus size={12} className="text-fg-3" aria-label="não atende" />}
              <span className={k.on ? "text-fg-2" : "text-fg-3"}>{k.label}</span>
              <span className="ml-auto tnum text-fg-3">{k.on ? `+${k.w.toFixed(2)}` : "0"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-fg-3">
          Relevância mede potencial informativo, não mérito político. <Link href="/methodology#relevancia" className="underline decoration-border-strong underline-offset-2 hover:text-fg-2">Critérios</Link>
        </p>
      </div>

      <div className="space-y-1 border-t border-border pt-3 text-[11.5px] text-fg-3">
        <p className="flex items-center gap-1.5 text-fg-2">
          <Sparkles size={12} className="text-warn" aria-hidden /> Transparência da IA
        </p>
        <p className="font-mono text-[11px]">
          {c.model.model} v{c.model.version} · prompt {c.model.promptVersion}
        </p>
        <p>Classificado em {fmtDateTime(c.classifiedAt)} · revisão humana: {c.humanReviewed ? "sim" : "não"}</p>
        <p>Texto original (RAW) preservado e exibido sem alteração na transcrição.</p>
      </div>
    </div>
  );
}
