/**
 * Identidade visual de partidos — cor é IDENTIFICAÇÃO de entidade, nunca avaliação.
 * Fornecida por dados (provider de eleições), não por componentes.
 */
export interface PartyVisualIdentity {
  partyId: string;
  acronym: string;
  color: string;
  /** Vigência (ISO date). */
  validFrom: string;
  validTo: string | null;
  /** Origem da cor (manual de marca, TSE, curadoria editorial…). */
  source: string;
}

export const NEUTRAL_ENTITY_COLOR = "#68686e";

export function identityAt(identities: PartyVisualIdentity[], partyId: string, atIso: string): PartyVisualIdentity | null {
  const t = atIso.slice(0, 10);
  return identities.filter((i) => i.partyId === partyId && i.validFrom <= t && (i.validTo === null || i.validTo >= t)).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;
}
