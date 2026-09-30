import { ProviderError, RateLimited } from "./errors";

/** Política de retry comum. Backoff exponencial com jitter; respeita Retry-After. */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** 0–1: fração aleatória somada ao atraso. */
  jitter: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 16_000, jitter: 0.2 };

export function backoffDelay(attempt: number, p: RetryPolicy, rand: () => number = Math.random): number {
  const exp = Math.min(p.maxDelayMs, p.baseDelayMs * 2 ** (attempt - 1));
  return Math.round(exp * (1 + p.jitter * rand()));
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY,
  deps: { sleep?: (ms: number) => Promise<void>; rand?: () => number; onRetry?: (e: ProviderError, attempt: number, delayMs: number) => void } = {},
): Promise<T> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      const retryable = e instanceof ProviderError && e.retryable;
      if (!retryable || attempt >= policy.maxAttempts) throw e;
      const delay = e instanceof RateLimited && e.retryAfter ? e.retryAfter * 1000 : backoffDelay(attempt, policy, deps.rand);
      deps.onRetry?.(e as ProviderError, attempt, delay);
      await sleep(delay);
    }
  }
}

/** Declaração de limites da origem (documental + usada por agendadores). */
export interface RateLimitInfo {
  requestsPerWindow: number | null;
  windowSeconds: number | null;
  notes?: string;
}
