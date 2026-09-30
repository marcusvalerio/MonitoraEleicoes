import { handle, ok } from "../_lib/respond";
import { conversationVolume } from "@/analytics/temporal";
import { parseQuery } from "./_shared";

/** Volume da conversa por janela (1, 5, 15, 30 min ou debate inteiro). */
export const GET = (req: Request) =>
  handle(async (repo) => {
    const q = await parseQuery(req, repo);
    if ("error" in q) return q.error!;
    const metrics = await repo.getSocialMetrics(q.debateId, { to: q.to });
    return ok(conversationVolume(metrics, q.granularity, q.to), { debateId: q.debateId, granularity: q.granularity, mode: repo.mode, nature: "collected" }, "private, max-age=15");
  });
