import Link from "next/link";
import type { Debate } from "@/domain/types";
import { fmtDate } from "@/lib/format";
import { SearchTrigger } from "./CommandPalette";
import { LogoMark } from "./Logo";
import { DataStatus, type DataStatusInfo } from "./DataStatus";

export function Topbar({ debate, status }: { debate: Debate | null; status: DataStatusInfo }) {
  const live = debate?.status === "live";
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="flex h-12 items-center gap-4 px-4 md:px-8">
        <Link href="/overview" className="lg:hidden" aria-label="Monitora Eleições — início">
          <LogoMark size={22} />
        </Link>
        {debate ? (
          <Link href={live ? `/debates/${debate.id}/live` : `/debates/${debate.id}`} className="flex min-w-0 items-baseline gap-3 hover:[&_.t]:text-white">
            <span className="t truncate font-display text-[13px] font-semibold tracking-[0.04em] text-fg uppercase">{debate.title}</span>
            <span className="hidden font-mono text-[11px] text-fg-3 md:inline">{fmtDate(debate.startsAt)}</span>
            {live && (
              <span className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.1em] text-neg">
                <span className="size-1.5 translate-y-[-1px] animate-pulse-dot rounded-full bg-neg" aria-hidden />
                <span className="hidden sm:inline">AO VIVO</span>
              </span>
            )}
          </Link>
        ) : (
          <span className="text-[12.5px] text-fg-3">Nenhum evento em andamento</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden w-[300px] md:block">
            <SearchTrigger hotkey />
          </div>
          <div className="md:hidden">
            <SearchTrigger compact />
          </div>
          <DataStatus status={status} live={!!live} />
        </div>
      </div>
    </header>
  );
}
