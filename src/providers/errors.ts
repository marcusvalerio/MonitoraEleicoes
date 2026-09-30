/**
 * Modelo de erros comum a todos os providers. A UI traduz `code` em estados
 * (provider_unavailable, offline, partial…) sem conhecer a API externa.
 */
export type ProviderErrorCode =
  | "provider_unavailable"
  | "authentication_required"
  | "rate_limited"
  | "invalid_response"
  | "normalization_error"
  | "data_unavailable";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly providerId: string;
  readonly retryable: boolean;
  constructor(code: ProviderErrorCode, providerId: string, message: string, opts: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = "ProviderError";
    this.code = code;
    this.providerId = providerId;
    this.retryable = opts.retryable ?? false;
  }
}

export class ProviderUnavailable extends ProviderError {
  constructor(providerId: string, message = "Provider indisponível", cause?: unknown) {
    super("provider_unavailable", providerId, message, { retryable: true, cause });
  }
}
export class AuthenticationRequired extends ProviderError {
  constructor(providerId: string, message = "Credenciais ausentes ou inválidas") {
    super("authentication_required", providerId, message);
  }
}
export class RateLimited extends ProviderError {
  /** Segundos sugeridos pela origem até nova tentativa. */
  readonly retryAfter: number | null;
  constructor(providerId: string, retryAfter: number | null = null) {
    super("rate_limited", providerId, `Limite de requisições atingido${retryAfter ? ` (aguardar ${retryAfter}s)` : ""}`, { retryable: true });
    this.retryAfter = retryAfter;
  }
}
export class InvalidResponse extends ProviderError {
  constructor(providerId: string, message: string) {
    super("invalid_response", providerId, message);
  }
}
export class NormalizationError extends ProviderError {
  readonly recordId: string;
  readonly field: string | null;
  constructor(providerId: string, recordId: string, message: string, field: string | null = null) {
    super("normalization_error", providerId, message);
    this.recordId = recordId;
    this.field = field;
  }
}
export class DataUnavailable extends ProviderError {
  constructor(providerId: string, message: string) {
    super("data_unavailable", providerId, message);
  }
}

/** Estado de UI sugerido para cada erro. */
export function uiStateFor(e: unknown): "provider_unavailable" | "error" | "partial" | "no_data" {
  if (!(e instanceof ProviderError)) return "error";
  switch (e.code) {
    case "provider_unavailable":
    case "authentication_required":
    case "rate_limited":
      return "provider_unavailable";
    case "normalization_error":
      return "partial";
    case "data_unavailable":
      return "no_data";
    default:
      return "error";
  }
}
