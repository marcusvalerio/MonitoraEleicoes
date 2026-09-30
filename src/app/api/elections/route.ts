import { handle, ok } from "../_lib/respond";

export const GET = () =>
  handle((repo) =>
    ok(
      [{ id: "2026-geral", year: 2026, label: "Eleições Gerais 2026", candidates: repo.getCandidates().length, parties: repo.getParties().length, results: repo.getElectoralResults().status }],
      { mode: repo.mode },
    ),
  );
