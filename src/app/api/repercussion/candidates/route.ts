import { handle, ok } from "../../_lib/respond";
import { candidateMentions, partyMentions } from "@/analytics/temporal";
import { parseQuery } from "../_shared";

/** Menções por candidato e por partido (via candidato). Contagens — não são ranking nem intenção de voto. */
export const GET = (req: Request) =>
  handle((repo) => {
    const q = parseQuery(req, repo);
    if ("error" in q) return q.error!;
    const m = repo.getSocialMetrics(q.debateId, { to: q.to });
    return ok(
      { candidates: candidateMentions(m, repo.getCandidates()), parties: partyMentions(m, repo.getCandidates(), repo.getParties()) },
      { debateId: q.debateId, caveat: "Menções não indicam apoio, rejeição ou preferência." },
      "private, max-age=15",
    );
  });
