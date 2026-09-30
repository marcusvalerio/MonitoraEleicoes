import { handle, ok } from "../../_lib/respond";
import { topicTrend } from "@/analytics/temporal";
import { parseQuery } from "../_shared";

export const GET = (req: Request) =>
  handle(async (repo) => {
    const q = await parseQuery(req, repo);
    if ("error" in q) return q.error!;
    return ok(topicTrend(await repo.getSocialMetrics(q.debateId, { to: q.to }), q.granularity, q.to), { debateId: q.debateId, granularity: q.granularity, nature: "ai" }, "private, max-age=15");
  });
