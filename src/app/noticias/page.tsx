import type { Metadata } from "next";
import Link from "next/link";
import { ELECTION_RE, NEWS_SOURCES, fetchNews } from "@/services/news";
import { StateView } from "@/components/ui/states";
import { LiveRefresh } from "@/components/intel/LiveRefresh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notícias" };

const hour = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "horário não informado");

/** NOTÍCIAS — manchetes dos portais validados (RSS público, gratuito). O texto completo fica no portal de origem. */
export default async function Noticias({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const fonte = typeof sp.fonte === "string" && NEWS_SOURCES.some((s) => s.id === sp.fonte) ? sp.fonte : null;
  const tudo = sp.todas === "1";
  const { items, failed } = await fetchNews();
  const list = items.filter((i) => (!fonte || i.source === fonte) && (tudo || ELECTION_RE.test(`${i.title} ${i.summary ?? ""}`))).slice(0, 120);
  const name = new Map(NEWS_SOURCES.map((s) => [s.id, s.name]));
  const href = (o: { fonte?: string | null; todas?: boolean }) => `?${new URLSearchParams({ ...((o.fonte ?? fonte) ? { fonte: (o.fonte ?? fonte)! } : {}), ...((o.todas ?? tudo) ? { todas: "1" } : {}) })}`;
  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-6 pb-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[26px] font-bold text-fg md:text-[32px]">Notícias</h1>
          <p className="mt-1 text-[12.5px] text-fg-3">Manchetes de g1, Folha, Estadão e UOL (feeds públicos). Clique para ler no portal.</p>
        </div>
        <LiveRefresh intervalS={300} label="Atualizado" />
      </header>
      <nav className="mb-5 flex flex-wrap gap-1.5 text-[12.5px]" aria-label="Filtrar por portal">
        <Link href={`?${tudo ? "todas=1" : ""}`} className={`h-8 rounded-full px-3 leading-8 ${!fonte ? "bg-fg text-bg" : "border border-border text-fg-2 hover:text-fg"}`}>Todos</Link>
        {NEWS_SOURCES.map((s) => (
          <Link key={s.id} href={href({ fonte: s.id })} className={`h-8 rounded-full px-3 leading-8 ${fonte === s.id ? "bg-fg text-bg" : "border border-border text-fg-2 hover:text-fg"}`}>
            {s.name}
          </Link>
        ))}
        <Link href={`?${new URLSearchParams({ ...(fonte ? { fonte } : {}), ...(!tudo ? { todas: "1" } : {}) })}`} className="ml-auto h-8 rounded-full border border-border px-3 leading-8 text-fg-2 hover:text-fg">
          {tudo ? "Só eleição" : "Ver todas as manchetes"}
        </Link>
      </nav>
      {failed.length > 0 && <p className="mb-4 text-[12px] text-warn">Indisponível agora: {failed.map((f) => name.get(f)).join(", ")}. Tentamos de novo na próxima atualização.</p>}
      {list.length ? (
        <ol className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface" data-testid="news-list">
          {list.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noreferrer" className="group block px-4 py-3.5 transition-colors hover:bg-elevated">
                <p className="text-[11.5px] text-fg-3">
                  <b className="font-semibold text-fg-2">{name.get(n.source)}</b> · {hour(n.publishedAt)}
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-display)] text-[16px] leading-snug font-semibold text-fg group-hover:underline">{n.title}</p>
                {n.summary && <p className="mt-1 line-clamp-2 text-[13px] text-fg-2">{n.summary}</p>}
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <StateView state="empty" title="Nenhuma manchete agora">Os portais não retornaram itens neste filtro.</StateView>
      )}
    </div>
  );
}
