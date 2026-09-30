import { NextResponse } from "next/server";
import { getRepository } from "@/repository";

/**
 * Feed incremental do debate: segmentos, análises e eventos numa janela (from, to].
 * Filtragem no servidor — o browser nunca recebe o debate inteiro de uma vez.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const from = Number(sp.get("from") ?? 0);
  const to = Number(sp.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 4 * 3600) {
    return NextResponse.json({ error: "janela inválida" }, { status: 400 });
  }
  const repo = await getRepository();
  if (!repo.getDebate(id)) return NextResponse.json({ error: "debate não encontrado" }, { status: 404 });
  const win = repo.getTranscript(id, { from: from + 0.001, to });
  return NextResponse.json(
    { segments: win.segments, classifications: win.classifications, events: repo.getEvents(id, { to }), complete: win.complete, inProgress: win.inProgress },
    { headers: { "Cache-Control": "no-store" } },
  );
}
