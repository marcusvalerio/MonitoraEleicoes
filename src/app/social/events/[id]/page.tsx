import { redirect, notFound } from "next/navigation";
import { getProviders } from "@/providers/registry";

/** Evento social → contexto no debate (P1 terá página própria com posts relacionados). */
export default async function SocialEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProviders();
  for (const d of await p.transcript.listDebates()) {
    const e = (await p.transcript.getEvents(d.id)).find((x) => x.id === id);
    if (e) redirect(`/debates/${d.id}/live?seg=${e.segmentIds[0] ?? ""}`);
  }
  notFound();
}
