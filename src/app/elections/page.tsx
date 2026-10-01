import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Rota antiga: /elections → /eleicoes (filtros preservados). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") sp.set(k, v);
  redirect(`/eleicoes${sp.size ? `?${sp}` : ""}`);
}
