import { NextResponse } from "next/server";
import { getBoundaries } from "@/services/geo";
import type { GeoLevelId } from "@/geo/types";

export async function GET(req: Request) {
  const level = (new URL(req.url).searchParams.get("level") ?? "uf") as GeoLevelId;
  const set = await getBoundaries(level);
  if (!set) return NextResponse.json({ boundaries: null }, { headers: { "Cache-Control": "public, max-age=86400" } });
  return NextResponse.json(set, { headers: { "Cache-Control": "public, max-age=86400, immutable" } });
}
