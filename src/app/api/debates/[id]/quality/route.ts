import { handle, ok, fail } from "../../../_lib/respond";

/** Relatório de qualidade da transcrição (recebidos, oradores, horários, confiança). */
export const GET = (_: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async (repo) => {
    const { id } = await ctx.params;
    if (!await repo.getDebate(id)) return fail(404, "not_found", "debate não encontrado");
    return ok(await repo.getTranscriptQuality(id), { debateId: id });
  });
