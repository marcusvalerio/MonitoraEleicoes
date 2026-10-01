import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
/** Alias: /candidato/[id] → /candidatos/[id] (perfil por pessoa, vínculo oficial de identidade). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/candidatos/${encodeURIComponent((await params).id)}`);
}
