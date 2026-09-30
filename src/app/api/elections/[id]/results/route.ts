import { handle, ok, fail } from "../../../_lib/respond";

/** Resultados oficiais. Sem importação: status explícito `not_collected` — nunca zeros. */
export const GET = (_: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async (repo) => {
    const { id } = await ctx.params;
    if (id !== "2026-geral") return fail(404, "not_found", "eleição não encontrada");
    const r = await repo.getElectoralResults();
    return ok(r.rows, { status: r.status, reason: r.reason, nature: "official" });
  });
