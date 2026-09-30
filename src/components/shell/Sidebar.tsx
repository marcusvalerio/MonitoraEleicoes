"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { navItems } from "./nav";
import { LogoMark, Wordmark } from "./Logo";
import { DemoBadge } from "@/components/ui/primitives";

export function Sidebar({ currentDebateId, mode }: { currentDebateId: string | null; mode: "demo" | "live" }) {
  const path = usePathname();
  const items = navItems(currentDebateId);
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-border bg-bg lg:flex">
      <Link href="/overview" className="flex items-center gap-2.5 px-4 pt-5 pb-6">
        <LogoMark />
        <Wordmark />
      </Link>
      <nav aria-label="Principal" className="flex-1 px-2">
        <ul className="space-y-0.5">
          {items.map((it) => {
            const active = it.match(path);
            return (
              <li key={it.label}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-8 items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 text-[13px] transition-colors",
                    active ? "bg-elevated text-fg" : "text-fg-2 hover:bg-surface hover:text-fg",
                  )}
                >
                  {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-fg" aria-hidden />}
                  <it.icon size={15} strokeWidth={1.75} className={active ? "text-fg" : "text-fg-3 group-hover:text-fg-2"} aria-hidden />
                  <span className="flex-1">{it.label}</span>
                  {it.label === "Ao Vivo" && currentDebateId && <span className="size-1.5 animate-pulse-dot rounded-full bg-neg" aria-label="transmissão ativa" />}
                  {it.phase && <span className="text-2xs text-fg-3">{it.phase}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="m-3 space-y-2 rounded-[var(--radius-md)] border border-border bg-surface p-3">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Modo de dados</span>
          {mode === "demo" && <DemoBadge label="DEMO" />}
        </div>
        <p className="text-[11.5px] leading-snug text-fg-3">
          {mode === "demo" ? "Todos os dados exibidos são fictícios. Nenhuma API externa conectada." : "Dados reais conectados."}
        </p>
      </div>
      <p className="px-4 pb-4 text-[11px] leading-snug text-fg-3">O que foi dito. O que repercutiu. O que os dados mostram.</p>
    </aside>
  );
}

export function MobileNav({ currentDebateId }: { currentDebateId: string | null }) {
  const path = usePathname();
  const items = navItems(currentDebateId).filter((i) => ["Overview", "Ao Vivo", "Debates", "Fontes", "Metodologia"].includes(i.label));
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.match(path);
          return (
            <li key={it.label}>
              <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[10.5px]", active ? "text-fg" : "text-fg-3")}>
                <it.icon size={17} strokeWidth={1.75} aria-hidden />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
