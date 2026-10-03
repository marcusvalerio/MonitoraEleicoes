import type { ReactNode } from "react";
import { LogoMark } from "@/components/shell/Logo";

/** Moldura das telas de acesso: marca, subtítulo institucional e cartão escuro sóbrio. */
export function AuthFrame({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-[calc(100dvh-3rem)] items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(57,135,229,0.10),transparent_70%)]" aria-hidden />
      <div className="relative w-full max-w-[380px] motion-safe:animate-[enter_400ms_ease-out_both]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={30} />
          <p className="mt-4 font-[family-name:var(--font-display)] text-[15px] font-bold tracking-[0.18em] text-fg">MONITORA ELEIÇÕES</p>
          <p className="mt-1.5 text-[12.5px] text-fg-3">Inteligência eleitoral baseada em dados oficiais.</p>
        </div>
        <div className="rounded-[14px] border border-border bg-surface/80 p-6 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)] backdrop-blur">
          <h1 className="mb-5 font-[family-name:var(--font-display)] text-[19px] font-semibold text-fg">{title}</h1>
          {children}
        </div>
        {footer && <div className="mt-5 text-center text-[12px] text-fg-3">{footer}</div>}
      </div>
    </div>
  );
}

export const inputCls =
  "h-11 w-full rounded-[10px] border border-border-strong bg-bg px-3 text-[14px] text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-fg/50 focus-visible:ring-2 focus-visible:ring-info/40";
export const labelCls = "mb-1.5 block text-[12px] font-medium text-fg-2";
export const submitCls = "h-11 w-full rounded-[10px] bg-fg text-[14px] font-semibold text-bg transition-colors hover:bg-white disabled:opacity-50";
