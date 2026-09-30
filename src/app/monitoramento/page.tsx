import type { Metadata } from "next";
import Link from "next/link";
import { intelSql, filtersFrom } from "@/services/intelligence";
import { byUf, candidateTable, feed, funnel, kpis, series, type Bucket, type SeriesDim } from "@/analytics/social-listening";
import { toSearchParams } from "@/domain/filters";
import { MENTION_LABEL, SENTIMENT_LABEL, type MentionType, type Sentiment } from "@/domain/social";
import { TOPIC_LABEL } from "@/domain/labels";
import { Kpi, KpiStrip, PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { BarList } from "@/components/charts/BarList";
import { FilterBar } from "@/components/intel/FilterBar";
import { SeriesChart } from "@/components/intel/SeriesChart";
import { PLATFORM_COLOR } from "@/components/intel/palette";
import { fmtInt, fmtPct } from "@/lib/format";
import { fmtTime } from "@/lib/live-format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Monitoramento" };

const PLATFORM: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", x: "X", tiktok: "TikTok", reddit: "Reddit", bluesky: "Bluesky", threads: "Threads", news: "Notícias" };
const ACCESS: Record<string, { l: string; t: "pos" | "warn" | "neg" | "info" | "neutral" }> = {
  active: { l: "ativa", t: "pos" },
  configured: { l: "configurada", t: "info" },
  requires_authorization: { l: "requer autorização", t: "neutral" },
  unsupported: { l: "sem API adequada", t: "neutral" },
  limited: { l: "limitada", t: "warn" },
  error: { l: "com erro", t: "neg" },
  disabled: { l: "desativada", t: "neutral" },
};
const TYPE: Record<string, string> = { post: "Post", comment: "Comentário", reply: "Resposta", news: "Notícia", video: "Vídeo", live: "Live" };
const NC = "Não coletado";
const topicLabel = (t: string) => (t === "unknown" ? "Não identificado" : (TOPIC_LABEL[t as keyof typeof TOPIC_LABEL] ?? t));

/**
 * MONITORAMENTO — social listening das FONTES CONECTADAS (não "toda a internet").
 * Todo número vem com a cobertura de coleta: "Não coletado" ≠ 0. Menção ≠ apoio. Volume ≠ popularidade eleitoral.
 */
export default async function Monitoramento({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sql = intelSql();
  const { filter, errors } = filtersFrom(sp);
  const dim = (["platform", "candidate", "party", "topic", "total"].includes(String(sp.serie)) ? sp.serie : "platform") as SeriesDim;
  const bucket: Bucket = filter.period.preset === "30d" ? "day" : filter.period.preset === "7d" ? "day" : "hour";
  const header = <PageHeader eyebrow="Social listening" title="Monitoramento" description="O que aparece nas fontes conectadas sobre as eleições. Métricas observadas — não indicam apoio, preferência ou intenção de voto." />;
  if (!sql)
    return (
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 md:px-6">
        {header}
        <Panel>
          <StateView state="provider_unavailable" title="Indisponível neste perfil">
            O monitoramento social lê dados persistidos (perfil com banco, DATA_MODE=live). Nenhum número é exibido nos perfis de demonstração.
          </StateView>
        </Panel>
      </div>
    );
  const [k, fn, ser, cands, geo, items] = await Promise.all([kpis(sql, filter), funnel(sql, filter), series(sql, filter, bucket, dim), candidateTable(sql, filter), byUf(sql, filter), feed(sql, filter, typeof sp.cursor === "string" ? sp.cursor : null, 20)]);
  const ids = [...new Set(ser.filter(() => dim === "candidate").map((p) => p.key))];
  const names = ids.length ? Object.fromEntries(((await sql.query("select id::text as id, ballot_name from candidacy where id = any($1::int[])", [ids.map(Number)])) as { id: string; ballot_name: string }[]).map((r) => [r.id, r.ballot_name])) : {};
  const labels = dim === "platform" ? PLATFORM : dim === "topic" ? Object.fromEntries(ser.map((p) => [p.key, topicLabel(p.key)])) : names;
  const v = (x: number | null) => (x === null ? NC : fmtInt(x));
  const link = (o: Record<string, string>) => `/monitoramento?${new URLSearchParams({ ...Object.fromEntries(toSearchParams(filter)), ...o }).toString()}`;
  const byPlatform = new Map<string, number>();
  for (const p of ser.filter(() => dim === "platform")) byPlatform.set(p.key, (byPlatform.get(p.key) ?? 0) + p.count);
  const active = k.coverage.filter((c) => c.accessStatus === "active" || c.accessStatus === "configured");
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 md:px-6">
      {header}
      <FilterBar filter={filter} fields={["period", "platform", "type", "sentiment", "topic", "region", "uf", "office", "party"]} />
      {errors.length > 0 && <p className="text-[12px] text-warn">Filtros ignorados: {errors.join("; ")}</p>}

      <section aria-label="Fontes monitoradas" className="flex flex-wrap items-center gap-2 text-[12px]" data-testid="coverage">
        <span className="text-fg-3">Fontes:</span>
        {k.coverage.map((c) => (
          <span key={c.platform} className="inline-flex items-center gap-1" data-testid={`coverage-${c.platform}`}>
            <span className="size-2 rounded-full" style={{ background: PLATFORM_COLOR[c.platform] ?? "#68686e" }} aria-hidden />
            <span className="text-fg-2">{PLATFORM[c.platform] ?? c.platform}</span>
            <Tag tone={ACCESS[c.accessStatus]?.t ?? "neutral"}>{ACCESS[c.accessStatus]?.l ?? c.accessStatus}</Tag>
            {c.periodStatus === "partial" && <Tag tone="warn">coleta parcial</Tag>}
            {c.periodStatus === "not_collected" && <Tag tone="warn">não coletado no período</Tag>}
          </span>
        ))}
      </section>
      {!active.length && (
        <Panel>
          <StateView state="provider_unavailable" title="Nenhuma fonte social conectada">
            As plataformas exigem credenciais ou autorização (ver /admin/debates → Fontes sociais). Sem fonte conectada, nenhuma métrica é exibida.
          </StateView>
        </Panel>
      )}

      <KpiStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="kpis">
        <Kpi label="Conteúdos" value={v(k.contents)} hint={k.contentsChange === null ? "variação: sem base comparável" : `${k.contentsChange >= 0 ? "+" : ""}${fmtPct(k.contentsChange)} vs período anterior`} />
        <Kpi label="Menções" value={v(k.mentions)} hint="vínculos conteúdo × candidato/partido" />
        <Kpi label="Candidatos mencionados" value={v(k.candidatesMentioned)} />
        <Kpi label="Comentários e respostas" value={v(k.comments)} />
        <Kpi label="Curtidas (onde fornecidas)" value={k.engagement.likes === null ? (k.collected ? "Não fornecido" : NC) : fmtInt(k.engagement.likes)} hint={k.engagement.likesFrom ? `em ${fmtInt(k.engagement.likesFrom)} conteúdos com métrica` : undefined} />
        <Kpi label="Redes com dados" value={k.platformsWithData === null ? NC : `${k.platformsWithData} de ${k.platformsConnected}`} hint="conectadas" />
      </KpiStrip>

      <Panel title="Volume de conteúdos ao longo do tempo" question={`Horário de publicação na plataforma · por ${bucket === "hour" ? "hora" : "dia"}`} actions={
        <div className="flex gap-1 text-[12px]" role="tablist" aria-label="Série">
          {(["platform", "candidate", "party", "topic"] as const).map((d) => (
            <Link key={d} href={link({ serie: d })} role="tab" aria-selected={dim === d} className={`rounded px-2 py-0.5 ${dim === d ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg"}`}>
              {{ platform: "Plataforma", candidate: "Candidato", party: "Partido", topic: "Tema" }[d]}
            </Link>
          ))}
        </div>
      }>
        {k.collected ? <SeriesChart points={ser} labels={labels} colors={dim === "platform" ? PLATFORM_COLOR : undefined} bucket={bucket} /> : <StateView state="no_data" title={NC} compact>Nenhuma janela de coleta no período selecionado.</StateView>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Funil de conteúdos" question="Contagens reais do período, em cada etapa">
          {k.collected ? (
            <ol className="space-y-2" data-testid="funnel">
              {fn.map((s) => (
                <li key={s.key}>
                  <div className="flex justify-between text-[12.5px]">
                    <span className="text-fg-2">{s.label}</span>
                    <span className="text-fg tnum">
                      {fmtInt(s.count)} {fn[0].count > 0 && <span className="text-fg-3">· {fmtPct(s.count / fn[0].count)}</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-r-[4px] bg-info/80" style={{ width: `${fn[0].count ? Math.max(1, (s.count / fn[0].count) * 100) : 0}%` }} aria-hidden />
                </li>
              ))}
            </ol>
          ) : (
            <StateView state="no_data" title={NC} compact />
          )}
        </Panel>
        <Panel title="Temas" question="Classificação por termos fortes; 'não identificado' quando não há evidência">
          {k.collected ? <BarList items={Object.entries(ser.filter(() => dim === "topic").reduce<Record<string, number>>((a, p) => ((a[p.key] = (a[p.key] ?? 0) + p.count), a), {})).map(([id, value]) => ({ id, label: topicLabel(id), value })).sort((a, b) => b.value - a.value)} /> : <StateView state="no_data" title={NC} compact />}
          {dim !== "topic" && k.collected && (
            <Link href={link({ serie: "topic" })} className="text-[12px] text-info hover:underline">
              ver por tema
            </Link>
          )}
        </Panel>
        <Panel title="Estados mencionados" question={geo.note}>
          {k.collected ? (
            <>
              <BarList items={geo.byUf.map((g) => ({ id: g.uf, label: g.uf, value: g.count }))} />
              <p className="mt-2 text-[12px] text-fg-3" data-testid="geo-unknown">
                Localização desconhecida: {fmtInt(geo.unknown)} conteúdos
              </p>
            </>
          ) : (
            <StateView state="no_data" title={NC} compact />
          )}
        </Panel>
      </div>

      <Panel title="Candidatos nas conversas" question="Métricas observadas lado a lado. Menção não é apoio; volume não é intenção de voto." bodyClassName="overflow-x-auto">
        {cands.length ? (
          <table className="w-full min-w-[860px] font-[family-name:var(--font-data)] text-[12.5px]" data-testid="candidates-table">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] text-fg-3">
                <th className="py-2 pr-3 font-normal">Candidatura</th>
                <th className="px-3 py-2 text-right font-normal">Menções</th>
                <th className="px-3 py-2 text-right font-normal">Variação</th>
                <th className="px-3 py-2 font-normal">Sentimento sobre a candidatura (+ / − / indef.)</th>
                <th className="px-3 py-2 text-right font-normal">Apoio explícito</th>
                <th className="px-3 py-2 text-right font-normal">Crítica explícita</th>
                <th className="px-3 py-2 text-right font-normal">Curtidas</th>
                <th className="py-2 pl-3 font-normal">Temas</th>
              </tr>
            </thead>
            <tbody>
              {cands.map((c) => (
                <tr key={c.candidacyId} className="border-b border-border/60">
                  <td className="py-2 pr-3">
                    <Link href={`/comparar?c=${c.candidacyId}`} className="text-fg hover:underline">
                      {c.name}
                    </Link>{" "}
                    <span className="text-fg-3">{c.party ?? ""}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-fg tnum">{fmtInt(c.mentions)}</td>
                  <td className="px-3 py-2 text-right text-fg-2 tnum">{c.change === null ? "—" : `${c.change >= 0 ? "+" : ""}${fmtPct(c.change)}`}</td>
                  <td className="px-3 py-2 text-fg-2 tnum">
                    {c.sentiment.positivo} / {c.sentiment.negativo} / {c.sentiment.indefinido}
                  </td>
                  <td className="px-3 py-2 text-right tnum">{c.explicitSupport}</td>
                  <td className="px-3 py-2 text-right tnum">{c.explicitCritique}</td>
                  <td className="px-3 py-2 text-right tnum">{c.likes === null ? "—" : fmtInt(c.likes)}</td>
                  <td className="py-2 pl-3 text-fg-2">{c.topics.map(topicLabel).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <StateView state="no_data" title={k.collected ? "Nenhuma candidatura mencionada no período" : NC} compact>
            {k.collected ? "Houve coleta, mas nenhum conteúdo citou candidaturas monitoradas." : undefined}
          </StateView>
        )}
      </Panel>

      <Panel title="Conteúdos recentes" question="Texto original da plataforma; interpretação separada">
        {items.items.length ? (
          <ol className="divide-y divide-border" data-testid="social-feed">
            {items.items.map((it) => {
              const ents = (it.entities as { type: string; id: string; mention: MentionType; sentiment: Sentiment }[] | null) ?? [];
              return (
                <li key={it.id as string} className="py-3 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
                    <span className="size-2 rounded-full" style={{ background: PLATFORM_COLOR[it.platform as string] }} aria-hidden />
                    <span>{PLATFORM[it.platform as string]}</span>
                    <Tag>{TYPE[it.content_type as string]}</Tag>
                    <span className="tnum">{fmtTime(it.published_at ? new Date(it.published_at as string).toISOString() : null)}</span>
                    {it.content_sentiment ? <span>sentimento do conteúdo: {SENTIMENT_LABEL[it.content_sentiment as Sentiment]}</span> : null}
                    {it.geo_uf ? <Tag tone="info">UF mencionada: {it.geo_uf as string}</Tag> : null}
                    {it.permalink ? (
                      <a href={it.permalink as string} target="_blank" rel="noreferrer" className="ml-auto text-info hover:underline">
                        original
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-fg">{String(it.text).slice(0, 400)}</p>
                  {ents.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1 text-[12px]">
                      {ents.map((e) => (
                        <Tag key={`${e.type}${e.id}`} tone={e.mention === "apoio_explicito" ? "pos" : e.mention === "critica_explicita" ? "neg" : "neutral"}>
                          {e.type === "party" ? e.id : `#${e.id}`} · {MENTION_LABEL[e.mention]} · {SENTIMENT_LABEL[e.sentiment]}
                        </Tag>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <StateView state="no_data" title={k.collected ? "Nenhum conteúdo para os filtros" : NC} compact />
        )}
        {items.nextCursor && (
          <Link href={link({ cursor: items.nextCursor })} className="mt-3 inline-block text-[12px] text-info hover:underline">
            mais antigos →
          </Link>
        )}
      </Panel>
    </div>
  );
}
