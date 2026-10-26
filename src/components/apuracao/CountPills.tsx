import { fmtInt } from "@/lib/format";

type M = { value: number | null; status: string };
const v = (m: M | undefined) => (m && m.status === "value" && m.value !== null ? m.value : null);

/** Números da apuração em pílulas compactas (somente métricas oficiais do arquivo do TSE; ausente ⇒ "—"). */
export function CountPills({ countedPct, sectionsCounted, sectionsTotal, turnout, abstention, electorate }: { countedPct: M; sectionsCounted: M; sectionsTotal: M; turnout: M; abstention: M; electorate: M }) {
  const pct = v(countedPct);
  const items: [string, string][] = [
    ["Urnas apuradas", pct === null ? "—" : `${pct.toFixed(2).replace(".", ",")}%`],
    ["Seções", v(sectionsCounted) === null ? "—" : `${fmtInt(v(sectionsCounted)!)}${v(sectionsTotal) !== null ? ` de ${fmtInt(v(sectionsTotal)!)}` : ""}`],
    ["Comparecimento", v(turnout) === null ? "—" : fmtInt(v(turnout)!)],
    ["Abstenção", v(abstention) === null ? "—" : fmtInt(v(abstention)!)],
    ["Eleitorado", v(electorate) === null ? "—" : fmtInt(v(electorate)!)],
  ];
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" data-testid="count-pills">
      <div className="relative flex shrink-0 items-center gap-2 overflow-hidden rounded-full border border-border bg-surface px-3 py-1.5">
        <span className="absolute inset-y-0 left-0 bg-info/15 transition-[width] duration-1000" style={{ width: `${pct ?? 0}%` }} aria-hidden />
        <span className="relative text-[11px] text-fg-3">{items[0][0]}</span>
        <b className="relative font-[family-name:var(--font-num)] text-[14px] text-fg tabular-nums">{items[0][1]}</b>
      </div>
      {items.slice(1).map(([k, val]) => (
        <div key={k} className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5">
          <span className="text-[11px] text-fg-3">{k}</span>
          <b className="font-[family-name:var(--font-num)] text-[13px] text-fg tabular-nums">{val}</b>
        </div>
      ))}
    </div>
  );
}
