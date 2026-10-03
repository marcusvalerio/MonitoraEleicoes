import { NextResponse } from "next/server";
import { intelSql } from "@/services/intelligence";
import { followedStatus } from "@/analytics/apuracao";

/** Situação oficial das candidaturas acompanhadas (lista de SQ_CANDIDATO; máx. 20). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const year = Number(u.searchParams.get("ano") ?? "2026");
  const round = Number(u.searchParams.get("turno") ?? "1");
  const sqs = (u.searchParams.get("sq") ?? "").split(",").filter((x) => /^\d{6,15}$/.test(x)).slice(0, 20);
  if (!Number.isInteger(year) || ![1, 2].includes(round)) return NextResponse.json({ error: "parâmetros inválidos" }, { status: 400 });
  const sql = await intelSql();
  if (!sql) return NextResponse.json({ error: "fonte indisponível" }, { status: 503 });
  return NextResponse.json({ data: await followedStatus(sql, year, round, sqs) }, { headers: { "cache-control": "no-store" } });
}
