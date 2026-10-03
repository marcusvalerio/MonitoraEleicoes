import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Rotas antigas /elections/[ano]/[uf]/… → /eleicoes?ano=&uf= (somente segmentos reconhecidos). */
export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const sp = new URLSearchParams();
  const [year, uf] = path.map(decodeURIComponent);
  if (/^(2014|2018|2022|2026)$/.test(year ?? "")) sp.set("ano", year);
  if (/^[A-Za-z]{2}$/.test(uf ?? "")) sp.set("uf", uf.toUpperCase());
  redirect(`/eleicoes${sp.size ? `?${sp}` : ""}`);
}
