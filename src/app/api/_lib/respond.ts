import { NextResponse } from "next/server";
import { ProviderError } from "@/providers/errors";
import { getRepository, type Repository } from "@/repository";
import { log, newRequestId } from "@/infrastructure/log";

/** Envelope comum das APIs: `data` + `meta` (modo, cobertura, proveniência). */
export function ok<T>(data: T, meta: Record<string, unknown> = {}, cache = "no-store") {
  return NextResponse.json({ data, meta }, { headers: { "Cache-Control": cache } });
}

export function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const STATUS: Record<string, number> = { provider_unavailable: 503, authentication_required: 503, rate_limited: 429, invalid_response: 502, normalization_error: 502, data_unavailable: 404 };

/** Executa um handler com o repositório e traduz erros de provider em HTTP. */
export async function handle(fn: (repo: Repository) => Promise<Response> | Response) {
  try {
    return await fn(await getRepository());
  } catch (e) {
    const requestId = newRequestId();
    log("error", "api.error", { request_id: requestId, code: e instanceof ProviderError ? e.code : "internal_error", error: e instanceof Error ? e.message : String(e) });
    if (e instanceof ProviderError) return fail(STATUS[e.code] ?? 500, e.code, e.message);
    return fail(500, "internal_error", `Erro interno (request_id ${requestId})`);
  }
}

export function num(v: string | null, fallback?: number): number | undefined {
  if (v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
