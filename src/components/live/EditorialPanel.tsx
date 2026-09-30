"use client";

import type { EditorialItem } from "@/domain/editorial";
import { EDITORIAL_EVENT_LABEL } from "@/domain/editorial";
import { CONFIDENCE_LABEL } from "@/domain/quality";
import { RELEVANCE_LABEL, TOPIC_LABEL } from "@/domain/labels";
import { agoraFromEditorial, editorialSummary, eventsByBlock } from "@/analytics/editorial";
import { fmtTime } from "@/lib/live-format";
import { Tag } from "@/components/ui/primitives";
import { EditorialTimeline } from "./EditorialTimeline";

export const SOURCE_LABEL: Record<string, string> = { "g1-live-editorial": "g1 · cobertura editorial" };

/** Cobertura editorial ao vivo — sempre identificada como tal; nunca "transcrição" nem fala literal. */
export function EditorialPanel({ items, names }: { items: EditorialItem[]; names: Record<string, string> }) {
  const name = (id: string) => names[id] ?? "Candidato não identificado";
  const visible = items.filter((i) => !i.update.removedAt);
  const agora = agoraFromEditorial(items, name);
  const summary = editorialSummary(items);
  const blocks = eventsByBlock(items);
  const ordered = [...items].sort((a, b) => (b.update.publishedAt ?? "").localeCompare(a.update.publishedAt ?? "") || b.update.collectedAt.localeCompare(a.update.collectedAt));
  const label = (i: EditorialItem) => SOURCE_LABEL[i.update.providerId] ?? `${i.update.providerId} · cobertura editorial`;
  return (
    <section aria-label="Cobertura editorial" className="space-y-3" data-testid="editorial-panel">
      {agora && (
        <div className="rounded-[var(--radius-md)] border border-border-strong bg-surface p-4" data-testid="agora">
          <p className="text-2xs font-semibold tracking-wider text-fg-3">AGORA</p>
          <p className="mt-1 font-[family-name:var(--font-data)] text-[12.5px] text-fg-2 tnum">{fmtTime(agora.item.update.publishedAt)}</p>
          {agora.sentence ? <p className="mt-1 text-[15px] text-fg" data-testid="agora-sentence">{agora.sentence}</p> : <blockquote className="mt-1 text-[14px] text-fg">“{agora.item.update.text}”</blockquote>}
          <p className="mt-1 text-[12px] text-fg-3">Fonte: {label(agora.item)} (atualização editorial, não transcrição)</p>
        </div>
      )}
      <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-semibold text-fg">Cobertura editorial</h3>
          <Tag tone="info">atualização editorial · não é transcrição</Tag>
          <span className="ml-auto text-[12px] text-fg-3 tnum" data-testid="editorial-count">
            {visible.length} atualizações
          </span>
        </div>
        <div className="mt-3">
          <EditorialTimeline items={items} names={names} />
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-[12px] sm:grid-cols-3" data-testid="editorial-analytics">
          <div>
            <dt className="text-fg-3">Candidatos citados na cobertura</dt>
            <dd className="text-fg-2">{summary.byCandidate.length ? summary.byCandidate.slice(0, 5).map((c) => `${name(c.key)} (${c.count})`).join(" · ") : "—"}</dd>
          </div>
          <div>
            <dt className="text-fg-3">Temas</dt>
            <dd className="text-fg-2">{summary.byTopic.map((t) => `${t.key === "unknown" ? "não identificado" : TOPIC_LABEL[t.key as keyof typeof TOPIC_LABEL]} (${t.count})`).join(" · ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-fg-3">Por bloco</dt>
            <dd className="text-fg-2">{blocks.map((b) => `${b.block} (${b.count})`).join(" · ") || "—"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11.5px] text-fg-3">{summary.caveat}</p>
      </div>
      <ol className="space-y-2" data-testid="editorial-feed">
        {ordered.map((i) => {
          const a = i.analysis;
          return (
            <li key={i.update.id} className={`rounded-[var(--radius-md)] border border-border bg-surface p-3 ${i.update.removedAt ? "opacity-60" : ""}`} data-testid="editorial-item">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
                <span className="font-[family-name:var(--font-data)] tnum text-fg-2" data-testid="editorial-time">
                  {fmtTime(i.update.publishedAt)}
                </span>
                <Tag>{label(i)}</Tag>
                <Tag tone="info">Atualização editorial</Tag>
                {!i.update.publishedAt && <Tag tone="warn">horário não informado pela fonte</Tag>}
                {(i.update.version ?? 1) > 1 && <Tag tone="warn">editado pela fonte (v{i.update.version})</Tag>}
                {i.update.removedAt && <Tag tone="neg">removido pela fonte</Tag>}
              </div>
              {i.update.headline && <p className="mt-1 text-[13px] font-semibold text-fg">{i.update.headline}</p>}
              <p className="mt-1 text-[13.5px] text-fg" data-testid="editorial-text">
                {i.update.text}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-5">
                <F k="Evento" v={a ? `${EDITORIAL_EVENT_LABEL[a.eventType]}${a.eventType !== "unknown" ? ` (${CONFIDENCE_LABEL[a.eventTypeConfidence]})` : ""}` : "—"} />
                <F k="Tema" v={a ? (a.topic === "unknown" ? "Não identificado" : `${TOPIC_LABEL[a.topic]} (${CONFIDENCE_LABEL[a.topicConfidence]})`) : "—"} />
                <F k="Candidatos" v={a ? (a.actorCandidateId ? `${name(a.actorCandidateId)}${a.targetCandidateId ? ` → ${name(a.targetCandidateId)}` : ""}` : a.mentionedCandidateIds.length ? `citados: ${a.mentionedCandidateIds.map(name).join(", ")}` : "Não identificado") : "—"} />
                <F k="Relevância" v={a ? `${RELEVANCE_LABEL[a.relevance]} (${a.relevanceVersion})` : "—"} />
                <F k="Origem" v={i.update.url ? "link" : "—"} href={i.update.url ?? undefined} />
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function F({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div>
      <dt className="text-fg-3">{k}</dt>
      <dd className="text-fg-2">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-info hover:underline">
            abrir no g1
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}
