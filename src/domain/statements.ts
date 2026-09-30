/**
 * FATO × MEDIÇÃO × INTERPRETAÇÃO
 *
 * fact           — ocorrido verificável no registro ("X mencionou emprego às 23:14")
 * measurement    — número calculado sobre dados ("volume +32% nos 5 min seguintes")
 * interpretation — leitura do sistema; só pode expressar ASSOCIAÇÃO, nunca causalidade
 */
export type StatementKind = "fact" | "measurement" | "interpretation";

export interface Statement {
  kind: StatementKind;
  text: string;
  /** Registros/fontes que sustentam a afirmação. */
  basis: string[];
}

export const STATEMENT_LABEL: Record<StatementKind, string> = { fact: "Fato", measurement: "Medição", interpretation: "Interpretação" };

/** Linguagem causal proibida quando só há proximidade temporal. */
export const CAUSAL_PATTERNS: RegExp[] = [
  /\bgerou\b/i,
  /\bcausou\b/i,
  /\bprovocou\b/i,
  /\bfez (aumentar|crescer|cair|subir)\b/i,
  /\bpor causa d[aeo]\b/i,
  /\bem raz[ãa]o d[aeo]\b/i,
  /\bresultou em\b/i,
  /\bdevido [àa]\b/i,
];

export function hasCausalLanguage(text: string): boolean {
  return CAUSAL_PATTERNS.some((r) => r.test(text));
}

/** Formulação padrão de associação temporal. */
export function temporalAssociation(what: string, period: string): string {
  return `${what} foi temporalmente associado ao período ${period}. Proximidade temporal não indica causalidade.`;
}
