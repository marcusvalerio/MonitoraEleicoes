import { handle, ok, fail } from "../../../_lib/respond";
import { debateTimeline, timingSummary, type SpeechGranularity } from "@/analytics/timeline";

const G: Record<string, SpeechGranularity> = { "60": 60, "300": 300, "900": 900, "1800": 1800, total: "total" };

/** DebateTimeline — volume de fala por janela (1, 5, 15, 30 min ou total). Sem horários ⇒ not_available. */
export const GET = (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async (repo) => {
    const { id } = await ctx.params;
    if (!repo.getDebate(id)) return fail(404, "not_found", "debate não encontrado");
    const g = G[new URL(req.url).searchParams.get("granularity") ?? "60"];
    if (!g) return fail(400, "bad_request", "granularity ∈ 60|300|900|1800|total");
    const { segments } = repo.getTranscript(id);
    return ok(debateTimeline(segments, g), { granularity: g, timing: timingSummary(segments) });
  });
