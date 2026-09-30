import { NatureBadge } from "@/components/ui/primitives";
import { NATURE_DESCRIPTION } from "@/domain/labels";
import type { DataNature } from "@/domain/types";

export function NatureLegend() {
  const items: DataNature[] = ["official", "collected", "ai", "analysis"];
  return (
    <ul className="space-y-2.5">
      {items.map((n) => (
        <li key={n} className="flex items-start gap-2.5">
          <span className="w-[150px] shrink-0">
            <NatureBadge nature={n} />
          </span>
          <span className="text-[12px] leading-snug text-fg-3">{NATURE_DESCRIPTION[n]}</span>
        </li>
      ))}
    </ul>
  );
}
