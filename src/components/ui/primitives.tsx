import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Database, FlaskConical, ShieldCheck, Sigma, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DataNature } from "@/domain/types";
import { NATURE_DESCRIPTION, NATURE_LABEL } from "@/domain/labels";

export function Panel({
  title,
  question,
  actions,
  nature,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  /** Pergunta que o painel responde — explicita o propósito do gráfico. */
  question?: string;
  actions?: ReactNode;
  nature?: DataNature;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-[var(--radius-lg)] border border-border bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-medium text-fg">{title}</h2>
            {question && <p className="mt-0.5 text-[12px] text-fg-3">{question}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {nature && <NatureBadge nature={nature} compact />}
            {actions}
          </div>
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
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
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {href && <ArrowUpRight size={13} className="text-fg-3 transition-colors group-hover:text-fg" aria-hidden />}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="tnum font-display text-[26px] leading-none font-semibold tracking-tight text-fg">{value}</span>
        {unit && <span className="text-[12px] text-fg-3">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-[11.5px] text-fg-3">{hint}</div>}
    </>
  );
  const cls = "group block bg-surface px-4 py-3.5 transition-colors";
  return href ? (
    <Link href={href} title={question} className={cn(cls, "hover:bg-elevated")}>
      {body}
    </Link>
  ) : (
    <div title={question} className={cls}>
      {body}
    </div>
  );
}

/** Linha de KPIs com divisórias de 1px (evita “cards repetitivos”). */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border", className)}>{children}</div>;
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
