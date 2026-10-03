import { CheckCircle2, CircleDashed, CircleOff, Clock3, Loader, SplitSquareHorizontal } from "lucide-react";
import { Tag } from "@/components/ui/primitives";
import { COUNT_STATE_LABEL, type CountState } from "@/analytics/apuracao";

const META: Record<CountState, { tone: "neutral" | "pos" | "warn" | "info"; Icon: typeof Clock3; hint: string }> = {
  nao_coletada: { tone: "neutral", Icon: CircleDashed, hint: "Nenhuma coleta registrada para este recorte." },
  indisponivel: { tone: "warn", Icon: CircleOff, hint: "Arquivo ainda não publicado pelo TSE ou falha na última coleta." },
  nao_iniciada: { tone: "neutral", Icon: Clock3, hint: "Arquivo oficial publicado; a totalização ainda não começou. Zeros do arquivo não são votos." },
  em_apuracao: { tone: "info", Icon: Loader, hint: "Totalização em curso; coleta em dia." },
  parcial: { tone: "warn", Icon: SplitSquareHorizontal, hint: "Números parciais; a coleta está atrasada ou falhou — podem estar desatualizados." },
  totalizada: { tone: "pos", Icon: CheckCircle2, hint: "O TSE marcou a totalização como concluída." },
};

/** Estado da apuração: sempre ícone + rótulo (nunca só cor). */
export function CountStateTag({ state }: { state: CountState }) {
  const m = META[state];
  return (
    <span data-testid="count-state" data-state={state} title={m.hint}>
      <Tag tone={m.tone} className="normal-case">
        <m.Icon size={11} aria-hidden />
        {COUNT_STATE_LABEL[state]}
      </Tag>
    </span>
  );
}
export const countStateHint = (s: CountState) => META[s].hint;
