import { handle, ok, fail } from "../../_lib/respond";

export const GET = (_: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async (repo) => {
    const { id } = await ctx.params;
    const d = await repo.getDebate(id);
    if (!d) return fail(404, "not_found", "debate não encontrado");
    return ok({ debate: d, blocks: await repo.getBlocks(id), transcriptEnd: await repo.transcriptEnd(id) }, { mode: repo.mode, clock: repo.clock });
  });
