/**
 * Relógio de REPLAY do modo demo. O debate demo é "transmitido" em loop,
 * sempre a partir de 30 min, para que as telas ao vivo tenham conteúdo.
 * Compartilhado entre servidor e cliente para manter consistência.
 */
export const DEMO_REPLAY_MIN_OFFSET = 1800;

export function demoReplayOffset(nowMs: number, duration: number): number {
  const span = Math.max(1, duration - DEMO_REPLAY_MIN_OFFSET);
  return DEMO_REPLAY_MIN_OFFSET + (Math.floor(nowMs / 1000) % span);
}
