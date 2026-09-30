/**
 * Qualidade do dado: ausência NUNCA vira zero.
 *
 *  value          — valor medido (pode ser 0 legítimo)
 *  unknown        — deveria existir, mas não sabemos
 *  not_available  — a fonte não fornece este dado
 *  not_collected  — a fonte fornece, mas ainda não coletamos
 *  not_applicable — não faz sentido para este registro
 */
export type MissingKind = "unknown" | "not_available" | "not_collected" | "not_applicable";
export type DataValue<T> = { kind: "value"; value: T } | { kind: MissingKind; reason?: string };

export const val = <T,>(value: T): DataValue<T> => ({ kind: "value", value });
export const missing = <T,>(kind: MissingKind, reason?: string): DataValue<T> => ({ kind, reason });
export const isValue = <T,>(d: DataValue<T>): d is { kind: "value"; value: T } => d.kind === "value";
export const valueOr = <T,>(d: DataValue<T>, fallback: T): T => (d.kind === "value" ? d.value : fallback);

/** Converte número possivelmente ausente, sem transformar ausência em zero. */
export function fromNullable<T>(v: T | null | undefined, whenMissing: MissingKind = "unknown", reason?: string): DataValue<T> {
  return v === null || v === undefined ? missing(whenMissing, reason) : val(v);
}

export const MISSING_LABEL: Record<MissingKind, string> = {
  unknown: "desconhecido",
  not_available: "não disponível na fonte",
  not_collected: "ainda não coletado",
  not_applicable: "não se aplica",
};

/** Confiança qualitativa para inferências (localização, classificação, entidade…). */
export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { high: "alta", medium: "média", low: "baixa", unknown: "desconhecida" };

export function confidenceLevel(score: number | null | undefined): ConfidenceLevel {
  if (score === null || score === undefined || !Number.isFinite(score)) return "unknown";
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "medium";
  return "low";
}
