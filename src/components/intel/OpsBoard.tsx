import { AlertTriangle, CheckCircle2, CircleDashed, CircleOff, Clock3, Lock } from "lucide-react";
import { OPS_LABEL, type OpsRow, type OpsState } from "@/analytics/operations";
import { fmtDateTime } from "@/lib/format";

const META: Record<OpsState, { Icon: typeof Clock3; cls: string }> = {
  operacional: { Icon: CheckCircle2, cls: "text-pos" },
  atrasado: { Icon: Clock3, cls: "text-warn" },
  com_erro: { Icon: AlertTriangle, cls: "text-neg" },
  sem_sinal: { Icon: CircleDashed, cls: "text-fg-3" },
  nao_configurada: { Icon: CircleOff, cls: "text-fg-3" },
  sem_acesso: { Icon: Lock, cls: "text-fg-3" },
};
const GROUPS: OpsRow["group"][] = ["Dado oficial", "Cobertura", "Conversação", "Pesquisas"];

/** Quadro operacional: estado de cada fonte/worker (ícone + rótulo; nunca só cor). */
export function OpsBoard({ rows, showErrors = true }: { rows: OpsRow[]; showErrors?: boolean }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border md:grid-cols-2 xl:grid-cols-4" data-testid="ops-board">
      {GROUPS.map((g) => (
        <section key={g} className="bg-surface p-3" aria-label={g}>
          <h3 className="mb-2 text-[10.5px] font-medium tracking-[0.08em] text-fg-3 uppercase">{g}</h3>
          <ul className="space-y-2">
            {rows.filter((r) => r.group === g).map((r) => {
              const m = META[r.state];
              return (
                <li key={r.id} className="text-[12.5px]" data-testid={`ops-${r.id}`} data-state={r.state}>
                  <p className="flex items-center gap-1.5">
                    <m.Icon size={13} className={m.cls} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-fg">{r.name}</span>
                    <span className={`shrink-0 text-[11.5px] ${m.cls}`}>{OPS_LABEL[r.state]}</span>
                  </p>
                  <p className="pl-[19px] text-[11px] text-fg-3">
                    {r.lastSuccessAt ? `último sucesso ${fmtDateTime(r.lastSuccessAt)}` : "sem sucesso registrado"}
                    {r.lastRun ? ` · ${r.lastRun.received} lidos, ${r.lastRun.changed} alterados, ${r.lastRun.errors} erros` : ""}
                  </p>
                  {showErrors && r.lastError && r.state === "com_erro" && <p className="pl-[19px] text-[11px] text-neg/80 line-clamp-2">{r.lastError}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
