import type { Repository } from "@/repository";
import { fail, num } from "../_lib/respond";
import { parseGranularity } from "@/analytics/temporal";

export async function parseQuery(req: Request, repo: Repository) {
  const sp = new URL(req.url).searchParams;
  const debates = await repo.listDebates();
  const debateId = sp.get("debate") ?? debates.find((d) => d.status === "live")?.id ?? debates[0]?.id;
  const to = num(sp.get("to"));
  if (!debateId || !(await repo.getDebate(debateId))) return { error: fail(404, "not_found", "debate não encontrado") };
  if (Number.isNaN(to as number)) return { error: fail(400, "bad_request", "`to` inválido") };
  return { debateId, to, granularity: parseGranularity(sp.get("granularity")) };
}
