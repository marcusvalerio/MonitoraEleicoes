/** Segundos em pt-BR ("2,1 s"); ausente ⇒ "—" (nunca 0). */
export function fmtSeconds(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "—";
  return `${s.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}
export function fmtDecimal(x: number | null, digits = 2): string {
  if (x === null || !Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
/** Horário (BRT) de um instante ISO; ausente ⇒ "—". */
export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
