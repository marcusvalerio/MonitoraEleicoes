import Link from "next/link";
import { Settings2 } from "lucide-react";
import type { Debate } from "@/domain/types";
import { fmtDate } from "@/lib/format";
import { DemoBadge, LiveDot } from "@/components/ui/primitives";
import { SearchTrigger } from "./CommandPalette";
import { LogoMark } from "./Logo";

export function Topbar({ debate, mode }: { debate: Debate | null; mode: "demo" | "live" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="flex h-12 items-center gap-3 px-4 md:px-6">
        <Link href="/overview" className="lg:hidden" aria-label="Monitora Eleições — início">
          <LogoMark size={24} />
        </Link>
        {debate ? (
          <Link href={debate.status === "live" ? `/debates/${debate.id}/live` : `/debates/${debate.id}`} className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] px-1.5 py-1 hover:bg-surface">
            <span className="eyebrow hidden sm:inline">Evento atual</span>
            <span className="truncate text-[12.5px] font-medium text-fg">{debate.title}</span>
            <span className="hidden text-[12px] text-fg-3 tnum md:inline">{fmtDate(debate.startsAt)}</span>
            {debate.status === "live" && (
              <span className="hidden sm:block">
                <LiveDot label={mode === "demo" ? "AO VIVO · REPLAY" : "AO VIVO"} />
              </span>
            )}
            {debate.status === "live" && <span className="size-1.5 animate-pulse-dot rounded-full bg-neg sm:hidden" aria-label="ao vivo" />}
          </Link>
        ) : (
          <span className="text-[12.5px] text-fg-3">Nenhum evento em andamento</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden w-[340px] md:block">
            <SearchTrigger hotkey />
          </div>
          <div className="md:hidden">
            <SearchTrigger compact />
          </div>
          {mode === "demo" && (
            <span className="hidden sm:block">
              <DemoBadge />
            </span>
          )}
          <Link href="/methodology#configuracao" aria-label="Configurações e modo de dados" className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-fg-3 hover:bg-surface hover:text-fg">
            <Settings2 size={15} aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
