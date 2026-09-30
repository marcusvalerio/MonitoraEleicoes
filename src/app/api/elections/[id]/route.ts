import { handle, ok, fail } from "../../_lib/respond";

export const GET = (_: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async (repo) => {
    const { id } = await ctx.params;
    if (id !== "2026-geral") return fail(404, "not_found", "eleição não encontrada");
    return ok({ id, candidates: await repo.getCandidates(), parties: await repo.getParties(), partyIdentities: await repo.getPartyIdentities() }, { mode: repo.mode });
  });
