/**
 * Relógio de reprodução. Providers com capability `replay` (demo/fixture) são
 * reproduzidos em loop a partir de `minOffset`; providers ao vivo usam o relógio real.
 * Compartilhado entre servidor e cliente.
 */
export type ClockSpec = { kind: "replay"; minOffset: number } | { kind: "realtime" };

export function replayOffset(nowMs: number, duration: number, minOffset = 1800): number {
  const span = Math.max(1, duration - minOffset);
  return minOffset + (Math.floor(nowMs / 1000) % span);
}

/** Instante atual do evento (s desde o início). */
export function currentOffset(clock: ClockSpec, nowMs: number, startsAtIso: string, duration: number): number {
  if (clock.kind === "replay") return replayOffset(nowMs, duration, clock.minOffset);
  return Math.max(0, (nowMs - Date.parse(startsAtIso)) / 1000);
}
