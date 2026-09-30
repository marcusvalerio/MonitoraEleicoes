/** Rótulo HH:MM:SS (Brasília) de um offset — sem dependência de UI. */
export function wallClockLabel(startsAt: string, offset: number): string {
  return new Date(Date.parse(startsAt) + offset * 1000).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
}
