import { handle, ok, fail, num } from "../../../_lib/respond";

/** Transcrição paginada por cursor: cada item traz RAW (segmento), análise de IA e registro de origem. */
export const GET = (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async (repo) => {
    const { id } = await ctx.params;
    if (!await repo.getDebate(id)) return fail(404, "not_found", "debate não encontrado");
    const sp = new URL(req.url).searchParams;
    const limit = num(sp.get("limit"), 50)!;
    const to = num(sp.get("to"));
    if (Number.isNaN(limit) || Number.isNaN(to as number)) return fail(400, "bad_request", "parâmetros inválidos");
    try {
      const page = await repo.getTranscriptPage(id, { cursor: sp.get("cursor"), limit, to });
      return ok(page.items, { nextCursor: page.nextCursor, hasMore: page.hasMore, mode: repo.mode });
    } catch {
      return fail(400, "bad_request", "cursor inválido");
    }
  });
