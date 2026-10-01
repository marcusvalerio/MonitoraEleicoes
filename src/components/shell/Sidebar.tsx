"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { MOBILE_PRIMARY, navGroups, navItems } from "./nav";
import { LogoMark } from "./Logo";

export function Sidebar({ currentDebateId }: { currentDebateId: string | null }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[208px] shrink-0 flex-col border-r border-border bg-bg lg:flex">
      <Link href="/overview" className="flex items-center gap-2.5 px-5 pt-5 pb-7" aria-label="Monitora Eleições — início">
        <LogoMark size={20} />
        <span className="font-display text-[12.5px] leading-[1.05] font-bold tracking-[0.08em] text-fg">
          MONITORA
          <br />
          <span className="text-fg-3">ELEIÇÕES</span>
        </span>
      </Link>
      <nav aria-label="Principal" className="flex-1 space-y-6 px-3">
        {navGroups(currentDebateId).map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 px-2 text-[10px] font-medium tracking-[0.12em] text-fg-3 uppercase">{g.label}</p>
            <ul>
              {g.items.map((it) => {
                const active = it.match(path);
                return (
                  <li key={it.label}>
                    <Link
                      href={it.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-[30px] items-center gap-2.5 rounded-[var(--radius-sm)] px-2 text-[12.5px] transition-colors duration-150",
                        active ? "text-fg" : "text-fg-3 hover:text-fg-2",
                      )}
                    >
                      <span className={cn("absolute top-2 bottom-2 -left-3 w-[2px] rounded-r-full bg-info transition-opacity", active ? "opacity-100" : "opacity-0")} aria-hidden />
                      <it.icon size={14} strokeWidth={active ? 2 : 1.6} aria-hidden />
                      <span className="flex-1">{it.label}</span>
                      {it.label === "Ao Vivo" && currentDebateId && <span className="size-1.5 animate-pulse-dot rounded-full bg-neg" aria-label="transmissão ativa" />}
                      {it.phase && <span className="font-mono text-[9.5px] text-fg-3/70">{it.phase}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <p className="px-5 pb-5 font-display text-[11.5px] leading-snug text-fg-3">
        O que foi dito.
        <br />O que repercutiu.
        <br />O que os dados mostram.
      </p>
    </aside>
  );
}

export function MobileNav({ currentDebateId }: { currentDebateId: string | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = navItems(currentDebateId).filter((i) => MOBILE_PRIMARY.includes(i.label));
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <nav className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[var(--radius-lg,12px)] border-t border-border bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] motion-safe:animate-[sheet-in_220ms_ease-out]" aria-label="Navegação completa">
            {navGroups(currentDebateId).map((g) => (
              <div key={g.label} className="mb-3">
                <p className="mb-1 px-2 text-[10.5px] font-medium tracking-[0.08em] text-fg-3 uppercase">{g.label}</p>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.href}>
                      <Link href={it.href} onClick={() => setOpen(false)} aria-current={it.match(path) ? "page" : undefined} className={cn("flex h-10 items-center gap-2.5 rounded-[var(--radius-sm)] px-2 text-[14px]", it.match(path) ? "bg-elevated text-fg" : "text-fg-2")}>
                        <it.icon size={16} aria-hidden />
                        {it.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      )}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {items.map((it) => {
            const active = it.match(path);
            return (
              <li key={it.label}>
                <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[10.5px]", active ? "text-fg" : "text-fg-3")}>
                  <it.icon size={17} strokeWidth={active ? 2 : 1.6} aria-hidden />
                  {it.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className="flex h-14 w-full flex-col items-center justify-center gap-1 text-[10.5px] text-fg-3" data-testid="mobile-menu">
              <Menu size={17} strokeWidth={1.6} aria-hidden />
              Menu
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
