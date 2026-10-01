import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Database, FlaskConical, ShieldCheck, Sigma, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DataNature } from "@/domain/types";
import { MISSING_LABEL, type DataValue } from "@/domain/quality";
import { NATURE_DESCRIPTION, NATURE_LABEL } from "@/domain/labels";

/**
 * Bloco editorial. Padrão: seção com filete superior (sem caixa).
 * `variant="card"` apenas quando a moldura tem função (ex.: painéis roláveis ao vivo).
 */
export function Panel({
  title,
  question,
  actions,
  nature,
  children,
  className,
  bodyClassName,
  id,
  index,
  variant = "section",
}: {
  title?: ReactNode;
  /** Pergunta que o bloco responde — explicita o propósito do gráfico. */
  question?: string;
  actions?: ReactNode;
  nature?: DataNature;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  /** Numeração editorial (01, 02…). */
  index?: string;
  variant?: "section" | "card";
}) {
  const card = variant === "card";
  return (
    <section id={id} className={cn("scroll-mt-20 motion-safe:animate-[enter_320ms_cubic-bezier(.2,.7,.2,1)_both]", card ? "rounded-[var(--radius-lg)] border border-border bg-surface" : "border-t border-border pt-4", className)}>
      {(title || actions) && (
        <header className={cn("flex items-start justify-between gap-3", card ? "border-b border-border px-4 py-3" : "mb-4")}>
          <div className="min-w-0">
            <h2 className={cn("flex items-baseline gap-2.5 text-fg", card ? "text-[13px] font-medium" : "font-display text-[17px] font-semibold tracking-tight")}>
              {index && <span className="font-mono text-[11px] font-normal text-fg-3">{index}</span>}
              {title}
            </h2>
            {question && <p className={cn("mt-0.5 text-[12.5px] text-fg-3", index && !card && "pl-[26px]")}>{question}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {nature && <NatureBadge nature={nature} compact />}
            {actions}
          </div>
        </header>
      )}
      <div className={cn(card && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Rótulo de seção editorial numerada, ex.: "01 — AGORA". */
export function SectionLabel({ index, children, className }: { index?: string; children: ReactNode; className?: string }) {
  return (
    <p className={cn("eyebrow flex items-center gap-2", className)}>
      {index && <span className="font-mono text-fg-3">{index}</span>}
      {index && <span className="h-px w-4 bg-border-strong" aria-hidden />}
      <span className="text-fg-2">{children}</span>
    </p>
  );
}

/** Variação percentual com seta; cor semântica apenas para direção (nunca para candidatos). */
export function Delta({ value: input, className, neutral }: { value: number | null | DataValue<number>; className?: string; neutral?: boolean }) {
  const value = input !== null && typeof input === "object" ? (input.kind === "value" ? input.value : null) : input;
  const reason = input !== null && typeof input === "object" && input.kind !== "value" ? (input.reason ?? MISSING_LABEL[input.kind]) : "sem base de comparação";
  if (value === null || !Number.isFinite(value))
    return (
      <span className={cn("text-fg-3", className)} title={reason} aria-label={reason}>
        —
      </span>
    );
  const pct = Math.round(value * 100);
  const dir = Math.abs(pct) < 5 ? "flat" : pct > 0 ? "up" : "down";
  const tone = neutral || dir === "flat" ? "text-fg-2" : dir === "up" ? "text-pos" : "text-neg";
  const arrow = dir === "flat" ? "→" : dir === "up" ? "↑" : "↓";
  return (
    <span className={cn("tnum whitespace-nowrap", tone, className)} aria-label={dir === "flat" ? "estável" : `${pct > 0 ? "alta" : "queda"} de ${Math.abs(pct)}%`}>
      {arrow} {dir === "flat" ? "estável" : `${Math.abs(pct)}%`}
    </span>
  );
}

/** Sparkline (uma série, sem eixos). Última observação marcada. */
export function Sparkline({ values, width = 88, height = 24, color = "#a4a4a8", className }: { values: number[]; width?: number; height?: number; color?: string; className?: string }) {
  if (values.length < 2) return <span className={cn("inline-block", className)} style={{ width, height }} />;
  const max = Math.max(1, ...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={`${d}L${x(values.length - 1)},${height}L${x(0)},${height}Z`} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r={2} fill={color} />
    </svg>
  );
}

const NATURE_STYLE: Record<DataNature, { cls: string; Icon: typeof Database }> = {
  official: { cls: "text-info border-info/30 bg-info-bg", Icon: ShieldCheck },
  collected: { cls: "text-fg-2 border-border-strong bg-elevated", Icon: Database },
  ai: { cls: "text-warn border-warn/30 bg-warn-bg", Icon: Sparkles },
  analysis: { cls: "text-fg-2 border-dashed border-border-strong", Icon: Sigma },
};

/** Identifica a natureza do dado: oficial, coletado, IA ou análise. */
export function NatureBadge({ nature, compact }: { nature: DataNature; compact?: boolean }) {
  const { cls, Icon } = NATURE_STYLE[nature];
  return (
    <span
      title={`${NATURE_LABEL[nature]} — ${NATURE_DESCRIPTION[nature]}`}
      className={cn("inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-px text-2xs font-medium whitespace-nowrap", cls)}
    >
      <Icon size={11} strokeWidth={2} aria-hidden />
      {compact ? SHORT[nature] : NATURE_LABEL[nature]}
    </span>
  );
}
const SHORT: Record<DataNature, string> = { official: "Oficial", collected: "Coletado", ai: "IA", analysis: "Análise" };

export function DemoBadge({ className, label = "DEMO DATA" }: { className?: string; label?: string }) {
  return (
    <span
      title="Dados fictícios para demonstração. Não representam fatos reais."
      className={cn("demo-stripes inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-warn/40 px-1.5 py-px text-2xs font-semibold tracking-wide text-warn", className)}
    >
      <FlaskConical size={11} aria-hidden />
      {label}
    </span>
  );
}

export function Tag({ children, tone = "neutral", className, dot }: { children: ReactNode; tone?: "neutral" | "pos" | "neg" | "warn" | "info" | "strong"; className?: string; dot?: boolean }) {
  const map = {
    neutral: "border-border-strong text-fg-2",
    strong: "border-border-strong text-fg bg-elevated",
    pos: "border-pos/30 text-pos bg-pos-bg",
    neg: "border-neg/30 text-neg bg-neg-bg",
    warn: "border-warn/30 text-warn bg-warn-bg",
    info: "border-info/30 text-info bg-info-bg",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-px text-2xs font-medium uppercase tracking-wide whitespace-nowrap", map[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function LiveDot({ className, label = "AO VIVO" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-2xs font-semibold tracking-wider text-neg", className)}>
      <span className="size-1.5 animate-pulse-dot rounded-full bg-neg" aria-hidden />
      {label}
    </span>
  );
}

export function Kpi({ label, value, unit, hint, question, href }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; question?: string; href?: string }) {
  const body = (
    <>
      <span className="eyebrow flex items-center gap-1">
        {label}
        {href && <ArrowUpRight size={11} className="opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </span>
      <span className="mt-1.5 flex items-baseline gap-1">
        <span className="tnum font-display text-[24px] leading-none font-semibold tracking-tight text-fg">{value}</span>
        {unit && <span className="text-[12px] text-fg-3">{unit}</span>}
      </span>
      {hint && <span className="mt-1 block text-[11.5px] text-fg-3">{hint}</span>}
    </>
  );
  const cls = "group block py-3 pr-4 pl-4 first:pl-0";
  return href ? (
    <Link href={href} title={question} className={cn(cls, "hover:[&_.font-display]:text-white")}>
      {body}
    </Link>
  ) : (
    <div title={question} className={cls}>
      {body}
    </div>
  );
}

/** Trilho de números: divisórias verticais, sem caixas. */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid divide-border border-y border-border [&>*]:border-border sm:divide-x", className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--radius-md)] bg-elevated", className)} aria-hidden />;
}

export function PageHeader({ eyebrow, title, description, actions, meta }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div>}
        <h1 className="font-display text-[26px] leading-tight font-semibold tracking-tight text-fg md:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] text-fg-2">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ButtonLink({ href, children, variant = "secondary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return (
    <Link href={href} className={cn(buttonCls(variant), className)}>
      {children}
    </Link>
  );
}

export function buttonCls(variant: "primary" | "secondary" | "ghost" = "secondary") {
  return cn(
    "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-[12.5px] font-medium transition-colors whitespace-nowrap disabled:opacity-40",
    variant === "primary" && "bg-fg text-bg hover:bg-white",
    variant === "secondary" && "border border-border-strong bg-elevated text-fg hover:bg-hover",
    variant === "ghost" && "text-fg-2 hover:bg-elevated hover:text-fg",
  );
}

export function Legend({ items }: { items: { label: string; color: string; pattern?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11.5px] text-fg-2">
          <span className="size-2 rounded-[2px]" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function Avatar({ initials, color, size = 28 }: { initials: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-bg"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
