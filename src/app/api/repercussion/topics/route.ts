import { handle, ok } from "../../_lib/respond";
import { topicTrend } from "@/analytics/temporal";
import { parseQuery } from "../_shared";

export const GET = (req: Request) =>
  handle((repo) => {
    const q = parseQuery(req, repo);
    if ("error" in q) return q.error!;
    return ok(topicTrend(repo.getSocialMetrics(q.debateId, { to: q.to }), q.granularity, q.to), { debateId: q.debateId, granularity: q.granularity, nature: "ai" }, "private, max-age=15");
  });
