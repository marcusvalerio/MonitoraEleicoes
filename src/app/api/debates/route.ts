import { handle, ok } from "../_lib/respond";

export const GET = () => handle((repo) => ok(repo.listDebates(), { mode: repo.mode }));
