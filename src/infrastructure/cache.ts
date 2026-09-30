/**
 * Cache em memória com TTL para agregações (mapas, timelines, séries).
 * Em produção: substituir por Redis/unstable_cache mantendo a mesma interface.
 */
interface Entry<T> {
  value: T;
  expires: number;
}
const store = new Map<string, Entry<unknown>>();
const MAX = 500;

export function cached<T>(key: string, ttlMs: number, compute: () => T): T {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;
  const value = compute();
  if (store.size >= MAX) store.delete(store.keys().next().value as string);
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

export function clearCache(prefix = "") {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
