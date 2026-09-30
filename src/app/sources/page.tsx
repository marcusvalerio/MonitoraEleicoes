import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getProviders } from "@/providers/registry";
import { getDemoDataset } from "@/data/demo/generate";
import { SOURCE_TYPE_LABEL } from "@/domain/labels";
import type { SourceStatus, SourceType } from "@/domain/types";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { DemoBadge, PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { Notice } from "@/components/ui/states";

export const metadata: Metadata = { title: "Fontes" };

const STATUS: Record<SourceStatus, { label: string; tone: "pos" | "warn" | "neg" | "neutral" | "info" }> = {
  active: { label: "Ativa", tone: "pos" },
  degraded: { label: "Degradada", tone: "warn" },
  unavailable: { label: "Indisponível", tone: "neg" },
  pending: { label: "Pendente (P1)", tone: "info" },
  demo: { label: "Demo", tone: "warn" },
};

const ORDER: SourceType[] = ["official", "transcript", "ai_analysis", "social", "media"];

export default async function SourcesPage() {
  const p = getProviders();
  const sources = await p.sources.list();
  const ds = getDemoDataset();
  const counts: Record<string, number> = {
    "src-demo-transcript": ds.segments.length,
    "src-demo-ai": ds.classifications.length,
    "src-demo-social": ds.posts.length,
  };
  for (const m of ds.metrics) counts[m.provenance.sourceId] = (counts[m.provenance.sourceId] ?? 0) + 1;
  const platforms = p.social.platforms();

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Fontes" title="De onde vem cada dado" description="Toda informação exibida aponta para uma fonte registrada, com tipo, provider, data de referência, data de coleta e status." />
      {p.mode === "demo" && (
        <Notice state="partial">
          Modo demonstração: fontes marcadas <DemoBadge /> produzem dados fictícios. Fontes oficiais (TSE) aparecem como pendentes — nenhum número eleitoral é exibido até a importação oficial.
        </Notice>
      )}
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
                      <td className="px-3 py-2.5 text-fg-2 tnum">{s.status === "pending" || s.status === "unavailable" ? "—" : fmtDateTime(s.collectedAt)}</td>
                      <td className="px-3 py-2.5 text-right text-fg tnum">{counts[s.id] ? fmtInt(counts[s.id]) : "—"}</td>
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
