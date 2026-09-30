import type { ReactNode } from "react";
import { AlertTriangle, CircleDashed, CloudOff, Inbox, Loader2, PlugZap, SearchX, SplitSquareHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export type ViewState = "loading" | "empty" | "error" | "offline" | "no_data" | "provider_unavailable" | "processing" | "partial";

const META: Record<ViewState, { Icon: typeof Inbox; title: string; tone: string }> = {
  loading: { Icon: Loader2, title: "Carregando", tone: "text-fg-3" },
  empty: { Icon: Inbox, title: "Nada por aqui ainda", tone: "text-fg-3" },
  error: { Icon: AlertTriangle, title: "Não foi possível carregar", tone: "text-neg" },
  offline: { Icon: CloudOff, title: "Você está offline", tone: "text-warn" },
  no_data: { Icon: SearchX, title: "Sem dados para este recorte", tone: "text-fg-3" },
  provider_unavailable: { Icon: PlugZap, title: "Fonte indisponível", tone: "text-warn" },
  processing: { Icon: CircleDashed, title: "Processando", tone: "text-info" },
  partial: { Icon: SplitSquareHorizontal, title: "Dados parciais", tone: "text-warn" },
};

/** Estado explicativo — nenhuma tela fica vazia sem explicação. */
export function StateView({ state, title, children, action, className, compact }: { state: ViewState; title?: string; children?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  const m = META[state];
  return (
    <div role={state === "error" ? "alert" : "status"} className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-1.5 py-6" : "gap-2 py-14", className)}>
      <m.Icon size={compact ? 16 : 20} className={cn(m.tone, (state === "loading" || state === "processing") && "animate-spin [animation-duration:2.4s]")} aria-hidden />
      <p className="text-[13px] font-medium text-fg">{title ?? m.title}</p>
      {children && <div className="max-w-sm text-[12px] text-fg-3">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Aviso inline (dados parciais, demo, indisponibilidade). */
export function Notice({ state, children, className }: { state: ViewState; children: ReactNode; className?: string }) {
  const m = META[state];
  return (
    <div className={cn("flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-elevated/60 px-3 py-2 text-[12px] text-fg-2", className)}>
      <m.Icon size={14} className={cn("mt-0.5 shrink-0", m.tone)} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
