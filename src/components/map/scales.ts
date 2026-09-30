import type { GeoAggregate } from "@/geo/types";

export type MapLayer = "volume" | "partido" | "candidato" | "tema" | "tendencia";

export const LAYERS: { id: MapLayer; label: string; question: string }[] = [
  { id: "volume", label: "Volume", question: "Onde existe maior volume de conversa?" },
  { id: "partido", label: "Partido", question: "Qual partido aparece com maior presença na conversa?" },
  { id: "candidato", label: "Candidato", question: "Qual candidato é mais mencionado em cada território?" },
  { id: "tema", label: "Tema", question: "Onde este tema está sendo mais discutido?" },
  { id: "tendencia", label: "Tendência", question: "Onde a conversa está crescendo ou diminuindo? (últimos 15 min vs. 15 min anteriores)" },
];

/** Rampa sequencial azul (5 classes) — validada contra o fundo escuro. */
export const SEQ = ["#1a2a44", "#1f4a86", "#2a67bd", "#4a8be6", "#8dbaf2"];
/** Divergente: queda (vermelho) ↔ neutro (cinza) ↔ alta (verde). */
export const DIV = { down2: "#b8403d", down1: "#6e3432", flat: "#34343a", up1: "#2f5e47", up2: "#3f9a6b" };
/** Opacidade por faixa de participação do predominante. */
export const SHARE_BINS = [
  { min: 0, label: "< 30%", opacity: 0.35 },
  { min: 0.3, label: "30–40%", opacity: 0.62 },
  { min: 0.4, label: "≥ 40%", opacity: 0.95 },
];

export function quantize(v: number, max: number): number {
  if (max <= 0 || v <= 0) return -1;
  return Math.min(SEQ.length - 1, Math.floor((v / max) * SEQ.length));
}

export function trendClass(t: number | null): keyof typeof DIV | null {
  if (t === null) return null;
  if (t <= -0.2) return "down2";
  if (t <= -0.05) return "down1";
  if (t < 0.05) return "flat";
  if (t < 0.2) return "up1";
  return "up2";
}

export interface Fill {
  color: string;
  opacity: number;
}

export function fillFor(row: GeoAggregate | undefined, layer: MapLayer, max: number, entityColor: (row: GeoAggregate) => string | null): Fill {
  const empty = { color: "#1a1a1d", opacity: 1 };
  if (!row || !row.posts) return empty;
  if (layer === "volume" || layer === "tema") {
    const q = quantize(row.topicPosts, max);
    return q < 0 ? empty : { color: SEQ[q], opacity: 1 };
  }
  if (layer === "tendencia") {
    const c = trendClass(row.trend);
    return c ? { color: DIV[c], opacity: 1 } : empty;
  }
  const color = entityColor(row);
  if (!color) return empty;
  const bin = [...SHARE_BINS].reverse().find((b) => row.predominantShare >= b.min)!;
  return { color, opacity: bin.opacity };
}
