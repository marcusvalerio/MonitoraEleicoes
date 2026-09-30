import { NextResponse } from "next/server";
import { search } from "@/services/search";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length > 120) return NextResponse.json({ error: "consulta muito longa" }, { status: 400 });
  return NextResponse.json({ hits: await search(q) });
}
