import { handle, ok, fail } from "../../_lib/respond";

export const GET = (_: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async (repo) => {
    const { id } = await ctx.params;
    const d = repo.getDebate(id);
    if (!d) return fail(404, "not_found", "debate não encontrado");
    return ok({ debate: d, blocks: repo.getBlocks(id), transcriptEnd: repo.transcriptEnd(id) }, { mode: repo.mode, clock: repo.clock });
  });
