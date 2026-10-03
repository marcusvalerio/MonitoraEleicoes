import Link from "next/link";
import type { Debate } from "@/domain/types";
import { SearchTrigger } from "./CommandPalette";
import { LogoMark } from "./Logo";
import { DataStatus, type DataStatusInfo } from "./DataStatus";

export function Topbar({ debate, status }: { debate: Debate | null; status: DataStatusInfo }) {
  void debate;
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="flex h-12 items-center gap-4 px-4 md:px-8">
        <Link href="/overview" className="lg:hidden" aria-label="Monitora Eleições — início">
          <LogoMark size={22} />
        </Link>
        <Link href="/apuracao" className="flex min-w-0 items-baseline gap-3 hover:[&_.t]:text-white">
          <span className="t truncate font-display text-[13px] font-semibold tracking-[0.04em] text-fg uppercase">Eleições 2026 · Apuração ao vivo</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden w-[300px] md:block">
            <SearchTrigger hotkey />
          </div>
          <div className="md:hidden">
            <SearchTrigger compact />
          </div>
          <DataStatus status={status} live={false} />
        </div>
      </div>
    </header>
  );
}
