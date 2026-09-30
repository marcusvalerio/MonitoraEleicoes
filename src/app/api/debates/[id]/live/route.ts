import { NextResponse } from "next/server";
import { getRepository } from "@/repository";

/**
 * Estado ao vivo INCREMENTAL: `?after=<seq>` devolve só segmentos novos (+ totais, latência, conexão).
 * Tudo vem do Repository (PostgreSQL no perfil live) — nunca de provider, arquivo ou fixture.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const after = Number(sp.get("after") ?? 0);
  const limit = Number(sp.get("limit") ?? 200);
  if (!Number.isInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    return NextResponse.json({ error: "parâmetros inválidos (after ≥ 0 inteiro; 1 ≤ limit ≤ 500)" }, { status: 400 });
  }
  const state = await (await getRepository()).getLiveState(id, after, limit);
  if (!state) return NextResponse.json({ error: "debate não encontrado" }, { status: 404 });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
