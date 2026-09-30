import { NextResponse } from "next/server";
import { queryGeo } from "@/services/geo";
import { TOPICS, type TopicId } from "@/domain/types";
import { GEO_LEVELS, type GeoLevelId } from "@/geo/types";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const debateId = sp.get("debate") ?? "";
  const parentKey = sp.get("parent") ?? "BR";
  const level = sp.get("level") as GeoLevelId | null;
  const topic = sp.get("topic") as TopicId | null;
  const from = Number(sp.get("from") ?? 0);
  const to = Number(sp.get("to"));
  if (!Number.isFinite(to) || !Number.isFinite(from) || from > to) return NextResponse.json({ error: "janela inválida" }, { status: 400 });
  if (level && !GEO_LEVELS.includes(level)) return NextResponse.json({ error: "nível inválido" }, { status: 400 });
  if (topic && !TOPICS.includes(topic)) return NextResponse.json({ error: "tema inválido" }, { status: 400 });
  const r = await queryGeo({ debateId, parentKey, childLevel: level ?? undefined, from, to, topic });
  if (!r) return NextResponse.json({ error: "território não encontrado" }, { status: 404 });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
