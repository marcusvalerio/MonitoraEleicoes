import { redirect, notFound } from "next/navigation";
import { getRepository } from "@/repository";

/** Evento social → contexto no debate. */
export default async function SocialEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  for (const d of await repo.listDebates()) {
    const e = (await repo.getEvents(d.id)).find((x) => x.id === id);
    if (e) redirect(`/debates/${d.id}/live?seg=${e.segmentIds[0] ?? ""}`);
  }
  notFound();
}
