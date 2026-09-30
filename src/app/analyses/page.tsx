import type { Metadata } from "next";
import { PageHeader, Panel, Tag } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";

export const metadata: Metadata = { title: "Análises" };

export default function AnalysesPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow={<>Análises <Tag tone="info">P2</Tag></>} title="Debate × Eleição" description="Cruzamento entre presença de temas nos debates, distribuição eleitoral e histórico — sem afirmar causalidade." />
      <Panel>
        <StateView state="empty" title="Disponível após a importação de dados oficiais">
          Este módulo depende do Explorador eleitoral (P1). Ele mostrará lado a lado a presença de um tema no debate e a distribuição de resultados por região, sempre com as fontes.
        </StateView>
      </Panel>
      <Panel title="O que este módulo nunca fará">
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-fg-2">
          <li>Afirmar que um tema “fez um candidato ganhar ou perder votos”.</li>
          <li>Prever vencedores ou recomendar voto.</li>
          <li>Apresentar correlação como causalidade.</li>
        </ul>
      </Panel>
    </div>
  );
}
