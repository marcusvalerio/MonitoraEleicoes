import type { Metadata } from "next";
import { getCurrentDebate } from "@/services/debates";
import { getMapBootstrap } from "@/services/geo";
import { MapExplorer } from "@/components/map/MapExplorer";
import { LAYERS, type MapLayer } from "@/components/map/scales";
import { PageHeader } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { TOPICS, type TopicId } from "@/domain/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mapa de repercussão" };

export default async function MapPage({ searchParams }: { searchParams: Promise<{ territorio?: string; camada?: string; tema?: string }> }) {
  const sp = await searchParams;
  const debate = await getCurrentDebate();
  const topic = TOPICS.includes(sp.tema as TopicId) ? (sp.tema as TopicId) : null;
  const boot = debate ? await getMapBootstrap(debate.id, { parentKey: sp.territorio, topic }) : null;
  const layer = LAYERS.some((l) => l.id === sp.camada) ? (sp.camada as MapLayer) : topic ? "tema" : "candidato";
  return (
    <div className="mx-auto max-w-[1480px] space-y-6 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        eyebrow="Explorar · Mapa"
        title="Mapa de repercussão"
        description="Onde a conversa pública sobre o debate está concentrada. Distribuição de publicações — não de votos, apoio ou intenção de voto."
      />
      {boot ? (
        <MapExplorer {...boot} initialLayer={layer} />
      ) : (
        <StateView state="empty" title="Nenhum evento com repercussão geolocalizada">Quando houver um debate monitorado, a distribuição territorial aparecerá aqui.</StateView>
      )}
    </div>
  );
}
