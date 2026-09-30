import { handle, ok } from "../../_lib/respond";
import { platformDistribution } from "@/analytics/temporal";
import { parseQuery } from "../_shared";

export const GET = (req: Request) =>
  handle((repo) => {
    const q = parseQuery(req, repo);
    if ("error" in q) return q.error!;
    return ok(platformDistribution(repo.getSocialMetrics(q.debateId, { to: q.to })), { debateId: q.debateId, platforms: repo.platforms(), caveat: "Níveis de acesso às APIs diferem entre plataformas." }, "private, max-age=15");
  });
