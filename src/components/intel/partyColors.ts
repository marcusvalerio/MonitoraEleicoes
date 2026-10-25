import { OTHER, SERIES } from "./palette";

/**
 * Cor por PARTIDO (identidade visual reconhecível; não indica ideologia nem desempenho). Os dois polos do 2º turno
 * (vermelho × azul) seguem distinguíveis para daltonismo; partidos sem cor própria caem na paleta categórica fixa.
 */
export const PARTY_COLOR: Record<string, string> = {
  PT: "#d6333a",
  PL: "#1e5bbf",
  PSD: "#d9921a",
  NOVO: "#0f8f8a",
  "MISSÃO": "#7a4cc2",
  AVANTE: "#c2417f",
  UP: "#8c2232",
  PSTU: "#a8321f",
  PCB: "#b5552c",
  DC: "#3c8a3f",
  DEMOCRATA: "#4f6fb3",
  PCO: "#8a5a12",
  PSOL: "#e0a100",
  MDB: "#2f9e4f",
  "UNIÃO": "#2b7fd4",
  PP: "#3d6fd6",
  REPUBLICANOS: "#2a8f7a",
  PSB: "#e3672b",
  PDT: "#c93a5e",
  PSDB: "#2f74c0",
};

/** Cor do partido; sem cor cadastrada ⇒ paleta fixa pela ordem dada (estável), nunca por posição/ranking. */
export function partyColor(party: string | null | undefined, fallbackIndex = 0) {
  return (party && PARTY_COLOR[party.toUpperCase()]) || SERIES[fallbackIndex % SERIES.length] || OTHER;
}
