import { handle, ok } from "../_lib/respond";

export const GET = () => handle(async (repo) => ok(await repo.listDebates(), { mode: repo.mode }));
