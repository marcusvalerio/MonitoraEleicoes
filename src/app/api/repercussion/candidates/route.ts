import { handle, ok } from "../../_lib/respond";
import { candidateMentions, partyMentions } from "@/analytics/temporal";
import { parseQuery } from "../_shared";

/** Menções por candidato e por partido (via candidato). Contagens — não são ranking nem intenção de voto. */
export const GET = (req: Request) =>
  handle(async (repo) => {
    const q = await parseQuery(req, repo);
    if ("error" in q) return q.error!;
    const m = await repo.getSocialMetrics(q.debateId, { to: q.to });
    return ok(
      { candidates: candidateMentions(m, await repo.getCandidates()), parties: partyMentions(m, await repo.getCandidates(), await repo.getParties()) },
      { debateId: q.debateId, caveat: "Menções não indicam apoio, rejeição ou preferência." },
      "private, max-age=15",
    );
  });
