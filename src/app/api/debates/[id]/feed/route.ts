import { NextResponse } from "next/server";
import { getProviders } from "@/providers/registry";

/**
 * Feed incremental do debate: segmentos, classificações e eventos numa janela (from, to].
 * Filtragem no servidor — o browser nunca recebe o debate inteiro de uma vez.
 * Em produção, este endpoint pode ser substituído por SSE/Realtime (Supabase).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const from = Number(sp.get("from") ?? 0);
  const to = Number(sp.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 4 * 3600) {
    return NextResponse.json({ error: "janela inválida" }, { status: 400 });
  }
  const p = getProviders();
  const debate = await p.transcript.getDebate(id);
  if (!debate) return NextResponse.json({ error: "debate não encontrado" }, { status: 404 });
  const win = await p.transcript.getTranscript(id, { from: from + 0.001, to });
  // eventos: recalculados com dados até `to`, retornados só os novos
  const events = await p.transcript.getEvents(id, { to });
  return NextResponse.json(
    { segments: win.segments, classifications: win.classifications, events, complete: win.complete, inProgress: win.inProgress, mode: p.mode },
    { headers: { "Cache-Control": "no-store" } },
  );
}
