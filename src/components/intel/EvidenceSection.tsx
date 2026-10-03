import type { ReactNode } from "react";
import { ClipboardList, Landmark, MessagesSquare, Mic2, Newspaper } from "lucide-react";

/**
 * Seção rotulada pelo TIPO DE EVIDÊNCIA — dado oficial (TSE), cobertura editorial (g1), transcrição e conversação (redes)
 * nunca aparecem como a mesma coisa. Ícone + rótulo + filete de cor (cor nunca sozinha).
 */
const META = {
  oficial: { label: "Dado oficial", Icon: Landmark, color: "var(--color-pos)" },
  cobertura: { label: "Cobertura editorial", Icon: Newspaper, color: "var(--color-info)" },
  transcricao: { label: "Transcrição", Icon: Mic2, color: "var(--color-fg-3)" },
  conversacao: { label: "Conversação pública", Icon: MessagesSquare, color: "var(--color-warn)" },
  registro: { label: "Registro oficial", Icon: ClipboardList, color: "var(--color-fg-2)" },
} as const;

/** Selo compacto do tipo de evidência (para cabeçalhos de página). */
export function EvidenceBadge({ kind, source }: { kind: keyof typeof META; source: string }) {
  const m = META[kind];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[4px] border px-1.5 py-0.5 text-[10.5px] font-medium tracking-[0.08em] uppercase" style={{ color: m.color, borderColor: "currentColor" }} data-testid={`evidence-badge-${kind}`}>
      <m.Icon size={11} aria-hidden /> {m.label} · {source}
    </span>
  );
}

export function EvidenceSection({ kind, source, title, aside, children, id }: { kind: keyof typeof META; source: string; title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  const m = META[kind];
  return (
    <section id={id} aria-label={`${m.label} · ${source} · ${title}`} className="border-l-2 pl-4" style={{ borderColor: m.color }} data-testid={`evidence-${kind}`}>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.1em] uppercase" style={{ color: m.color }}>
          <m.Icon size={12} aria-hidden /> {m.label} · {source}
        </p>
        <h2 className="font-display text-[17px] font-semibold tracking-tight text-fg">{title}</h2>
        {aside && <div className="ml-auto text-[12px] text-fg-3">{aside}</div>}
      </header>
      {children}
    </section>
  );
}
