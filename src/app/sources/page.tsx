import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getRepository } from "@/repository";
import { SOURCE_TYPE_LABEL } from "@/domain/labels";
import type { SourceStatus, SourceType } from "@/domain/types";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { fmtSeconds, fmtTime } from "@/lib/live-format";
import { CONFIDENCE_LABEL } from "@/domain/quality";
import { TIMING_LABEL } from "@/domain/labels";
import { DemoBadge, PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { Notice } from "@/components/ui/states";
import { intelSql } from "@/services/intelligence";
import { operationsStatus } from "@/analytics/operations";
import { OpsBoard } from "@/components/intel/OpsBoard";

export const metadata: Metadata = { title: "Fontes" };

const STATUS: Record<SourceStatus, { label: string; tone: "pos" | "warn" | "neg" | "neutral" | "info" }> = {
  connected: { label: "Conectada", tone: "pos" },
  degraded: { label: "Degradada", tone: "warn" },
  offline: { label: "Offline", tone: "neg" },
  not_configured: { label: "Não configurada", tone: "info" },
  demo: { label: "Demo", tone: "warn" },
};

const ORDER: SourceType[] = ["official", "transcript", "ai_analysis", "social", "media"];

export default async function SourcesPage() {
  const repo = await getRepository();
  const sources = await repo.getSources();
  const platforms = repo.platforms();
  const reports = await repo.getReports();
  const p = { mode: repo.mode };
  const status = await repo.getDataStatus();
  const editorialSources = await repo.getEditorialSources();
  const isql = await intelSql();
  const ops = isql ? await operationsStatus(isql).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Fontes" title="De onde vem cada dado" description="Toda informação exibida aponta para uma fonte registrada, com tipo, provider, data de referência, data de coleta e status." />
      {ops ? (
        <Panel title="Estado operacional" question="Cada fonte e worker, a partir do que foi registrado — nada é presumido">
          <OpsBoard rows={ops} showErrors={false} />
        </Panel>
      ) : (
        p.mode !== "demo" && <Notice state="partial">Estado operacional indisponível: base de dados não configurada ou não provisionada neste ambiente.</Notice>
      )}
      {p.mode === "demo" && (
        <Notice state="partial">
          Modo demonstração: fontes marcadas <DemoBadge /> produzem dados fictícios. Fontes oficiais (TSE) aparecem como não configuradas — nenhum número eleitoral é exibido até a importação oficial.
        </Notice>
      )}
      <Panel title="Debates" question="Proveniência e qualidade da transcrição de cada debate ingerido.">
        <div className="space-y-6">
          {(await Promise.all((await repo.listDebates()).map(async (d) => {
            const q = await repo.getTranscriptQuality(d.id);
            const seg = (await repo.getTranscript(d.id)).segments[0];
            const rec = seg?.provenance.record ? await repo.getSourceRecord(seg.provenance.record.recordId) : null;
            const art = (await repo.getArticles(d.id))[0];
            const precision = seg?.timing?.precision ?? (seg && seg.startOffset !== null ? "exact" : "—");
            const rows: [string, string][] = [
              ["Debate", `${d.title} · ${d.broadcaster} · ${fmtDateTime(d.startsAt)}`],
              ["Fonte da transcrição", art ? `${art.outlet} — ${art.title}` : (rec?.sourceUrl ?? seg?.provenance.sourceId ?? "—")],
              ["Coletado em", rec ? fmtDateTime(rec.collectedAt) : "—"],
              ["Segmentos", `${fmtInt(q.received)} recebidos · ${fmtInt(q.normalized)} normalizados · ${fmtInt(q.rejected)} rejeitados`],
              ["Oradores", `${q.speakersResolved} resolvidos · ${q.speakersUnresolved} não resolvidos · confiança ${Object.entries(q.speakerConfidence).map(([k, v]) => `${CONFIDENCE_LABEL[k as keyof typeof CONFIDENCE_LABEL] ?? k}: ${v}`).join(", ") || "—"}`],
              ["Cobertura temporal", `${q.timestampsAvailable} com horário · ${q.timestampsMissing} sem horário · precisão: ${TIMING_LABEL[precision as keyof typeof TIMING_LABEL] ?? precision}`],
              ["Classificação", `${q.classificationHigh} alta · ${q.classificationMedium} média · ${q.classificationLow} baixa confiança${q.unclassified ? ` · ${q.unclassified} sem classificação` : ""}`],
            ];
            return (
              <div key={d.id} id={`debate-${d.id}`} className="scroll-mt-20">
                <dl className="grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-[180px_1fr]">
                  {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-fg-3">{k}</dt>
                      <dd className="text-fg">{v}</dd>
                    </div>
                  ))}
                  {rec?.sourceUrl && (
                    <div className="contents">
                      <dt className="text-fg-3">URL</dt>
                      <dd>
                        <a href={rec.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-info hover:underline">
                          {rec.sourceUrl.replace("https://", "")} <ExternalLink size={11} aria-hidden />
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            );
          })))}
        </div>
      </Panel>
      {ORDER.map((type) => {
        const list = sources.filter((s) => s.type === type);
        if (!list.length) return null;
        return (
          <Panel key={type} title={SOURCE_TYPE_LABEL[type]} question={`${list.length} fonte(s)`} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] font-[family-name:var(--font-data)] text-[12.5px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11.5px] text-fg-3">
                    <th className="px-4 py-2 font-normal">Fonte</th>
                    <th className="px-3 py-2 font-normal">Provider</th>
                    <th className="px-3 py-2 font-normal">Referência</th>
                    <th className="px-3 py-2 font-normal">Coleta</th>
                    <th className="px-3 py-2 text-right font-normal">Registros</th>
                    <th className="px-3 py-2 text-right font-normal">Rejeitados</th>
                    <th className="px-4 py-2 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id} id={s.id} className="scroll-mt-20 border-b border-border align-top last:border-0 target:bg-elevated">
                      <td className="max-w-[340px] px-4 py-2.5">
                        <p className="text-fg">{s.name}</p>
                        <p className="mt-0.5 text-[11.5px] text-fg-3">{s.description}</p>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-info hover:underline">
                            {s.url.replace("https://", "")} <ExternalLink size={11} aria-hidden />
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11.5px] text-fg-2">{s.provider}</td>
                      <td className="px-3 py-2.5 text-fg-2 tnum">{fmtDateTime(s.timestamp)}</td>
                      <td className="px-3 py-2.5 text-fg-2 tnum">{s.status === "not_configured" || s.status === "offline" ? "—" : fmtDateTime(s.collectedAt)}</td>
                      <td className="px-3 py-2.5 text-right text-fg tnum">{s.recordCount ? fmtInt(s.recordCount) : "—"}</td>
                      <td className={`px-3 py-2.5 text-right tnum ${s.ingestion?.rejected ? "text-warn" : "text-fg-3"}`}>{s.ingestion ? fmtInt(s.ingestion.rejected) : "—"}</td>
                      <td className="px-4 py-2.5">
                        <Tag tone={STATUS[s.status].tone} dot>{STATUS[s.status].label}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
      {editorialSources.length > 0 && (
        <Panel title="Fontes editoriais ao vivo" question="Cobertura jornalística em tempo real (não é transcrição). Sem coleta, os campos mostram “Não coletado” — nunca 0." bodyClassName="overflow-x-auto">
          <table className="w-full min-w-[820px] font-[family-name:var(--font-data)] text-[12.5px]" data-testid="editorial-sources">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] text-fg-3">
                <th className="py-2 pr-3 font-normal">Fonte · debate</th>
                <th className="px-3 py-2 font-normal">Estado</th>
                <th className="px-3 py-2 font-normal">Última coleta</th>
                <th className="px-3 py-2 font-normal">Última atualização</th>
                <th className="px-3 py-2 text-right font-normal">Registros</th>
                <th className="px-3 py-2 text-right font-normal">Rejeitados</th>
                <th className="py-2 pl-3 text-right font-normal">Latência de coleta</th>
              </tr>
            </thead>
            <tbody>
              {editorialSources.map((e) => {
                const nc = "Não coletado";
                const st = !e.sourceUrl ? { l: "URL pendente", t: "info" as const } : !e.enabled ? { l: "Desativada", t: "neutral" as const } : e.lastError ? { l: "Com erro", t: "neg" as const } : e.lastCollectedAt ? { l: "Conectado", t: "pos" as const } : { l: "Aguardando 1ª coleta", t: "info" as const };
                return (
                  <tr key={e.id} className="border-b border-border/70 align-top last:border-0" data-testid={`editorial-source-${e.id}`}>
                    <td className="py-2 pr-3">
                      <p className="text-fg">{e.providerId === "g1-live-editorial" ? "g1 · cobertura editorial" : e.providerId}</p>
                      <p className="text-[11.5px] text-fg-3">{e.debateId}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Tag tone={st.t} dot>{st.l}</Tag>
                      {e.lastError && <p className="mt-1 text-[11.5px] text-warn">{e.lastError}</p>}
                    </td>
                    <td className="px-3 py-2 text-fg-2 tnum">{e.lastCollectedAt ? fmtTime(e.lastCollectedAt) : nc}</td>
                    <td className="px-3 py-2 text-fg-2 tnum">{e.lastUpdateAt ? fmtTime(e.lastUpdateAt) : e.lastCollectedAt ? "Sem atualizações publicadas" : nc}</td>
                    <td className="px-3 py-2 text-right text-fg tnum">{e.records === null ? nc : fmtInt(e.records)}</td>
                    <td className="px-3 py-2 text-right text-fg-2 tnum">{e.rejected === null ? nc : fmtInt(e.rejected)}</td>
                    <td className="py-2 pl-3 text-right text-fg-2 tnum">{e.collectionLatencyS === null ? (e.lastCollectedAt ? "—" : nc) : fmtSeconds(e.collectionLatencyS)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-fg-3">Latência de coleta: mediana entre o horário publicado pela fonte e a coleta pelo Monitora (inclui o intervalo de polling).</p>
        </Panel>
      )}
      <Panel title="Ingestão" question="Cada provider: registros recebidos, normalizados e rejeitados. Rejeições nunca são corrigidas silenciosamente." bodyClassName="overflow-x-auto">
        <p className="mb-3 text-[12px] text-fg-3" data-testid="storage">
          Armazenamento: {status.persistence === "postgres" ? "PostgreSQL (Neon) — última execução por provider" : "memória do processo (perfil de demonstração/teste)"} · ingerido em {fmtDateTime(status.ingestedAt)}
        </p>
        <table className="w-full min-w-[720px] font-[family-name:var(--font-data)] text-[12px]">
          <thead>
            <tr className="border-b border-border text-left text-[11.5px] text-fg-3">
              <th className="py-2 pr-3 font-normal">Provider · etapa</th>
              <th className="px-3 py-2 text-right font-normal">Recebidos</th>
              <th className="px-3 py-2 text-right font-normal">Normalizados</th>
              <th className="px-3 py-2 text-right font-normal">Rejeitados</th>
              <th className="py-2 pl-3 font-normal">Primeira rejeição</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={`${r.providerId}-${r.kind}`} className="border-b border-border/70 last:border-0">
                <td className="py-1.5 pr-3 font-mono text-[11px] text-fg-2">
                  {r.providerId} · {r.kind}
                </td>
                <td className="px-3 py-1.5 text-right tnum">{fmtInt(r.fetched)}</td>
                <td className="px-3 py-1.5 text-right tnum">{fmtInt(r.normalized)}</td>
                <td className={`px-3 py-1.5 text-right tnum ${r.rejected ? "text-warn" : "text-fg-3"}`}>{fmtInt(r.rejected)}</td>
                <td className="max-w-[320px] truncate py-1.5 pl-3 text-fg-3" title={r.issues[0]?.message}>
                  {r.status === "failed" ? `Falha: ${r.message}` : r.issues[0] ? `${r.issues[0].externalId}: ${r.issues[0].message}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Acesso por plataforma" question="As plataformas não oferecem o mesmo nível de acesso — volumes não são diretamente comparáveis entre elas.">
        <ul className="grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {platforms.map((pl) => (
            <li key={pl.id} className="bg-surface p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-fg">{pl.name}</span>
                <Tag tone={pl.access === "full" ? "pos" : pl.access === "none" ? "neg" : "warn"}>{{ full: "Amplo", limited: "Limitado", restricted: "Restrito", none: "Sem acesso" }[pl.access]}</Tag>
              </div>
              <p className="mt-1.5 text-[11.5px] text-fg-3">{pl.notes}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
