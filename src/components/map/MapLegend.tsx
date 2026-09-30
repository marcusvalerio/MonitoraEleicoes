import { fmtCompact } from "@/lib/format";
import { DIV, SEQ, SHARE_BINS, type MapLayer } from "./scales";
import type { MapEntity } from "./MapCanvas";

export function MapLegend({ layer, max, entities, topicLabel, byParty }: { layer: MapLayer; max: number; entities: MapEntity[]; topicLabel?: string; byParty?: boolean }) {
  if (layer === "volume" || layer === "tema") {
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] text-fg-3">{layer === "tema" ? `Publicações sobre ${topicLabel?.toLowerCase()}` : "Publicações geolocalizadas"}</p>
        <div className="flex items-center gap-[2px]">
          {SEQ.map((c) => (
            <span key={c} className="h-2 w-8 first:rounded-l-[2px] last:rounded-r-[2px]" style={{ background: c }} />
          ))}
        </div>
        <div className="flex w-[168px] justify-between text-[10.5px] text-fg-3 tnum">
          <span>0</span>
          <span>{fmtCompact(max)}</span>
        </div>
      </div>
    );
  }
  if (layer === "tendencia") {
    const items: [keyof typeof DIV, string][] = [
      ["down2", "≤ −20%"],
      ["down1", "−20 a −5%"],
      ["flat", "estável"],
      ["up1", "+5 a +20%"],
      ["up2", "≥ +20%"],
    ];
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] text-fg-3">Variação do volume · últimos 15 min</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {items.map(([k, l]) => (
            <li key={k} className="flex items-center gap-1.5 text-[11px] text-fg-2">
              <span className="size-2.5 rounded-[2px]" style={{ background: DIV[k] }} />
              {l}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {entities.map((e) => (
          <li key={e.id} className="flex items-center gap-1.5 text-[11px] text-fg-2">
            <span className="size-2.5 rounded-[2px]" style={{ background: e.color }} />
            {byParty ? e.partyAcronym : e.name}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 text-[10.5px] text-fg-3">
        <span>Participação nas menções:</span>
        {SHARE_BINS.map((b) => (
          <span key={b.label} className="flex items-center gap-1">
            <span className="size-2.5 rounded-[2px] bg-fg" style={{ opacity: b.opacity }} />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
