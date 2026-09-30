import { handle, ok } from "../_lib/respond";

export const GET = () =>
  handle(async (repo) =>
    ok(
      [{ id: "2026-geral", year: 2026, label: "Eleições Gerais 2026", candidates: (await repo.getCandidates()).length, parties: (await repo.getParties()).length, results: (await repo.getElectoralResults()).status }],
      { mode: repo.mode },
    ),
  );
