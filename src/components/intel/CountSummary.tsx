import type { CountView } from "@/analytics/apuracao";
import { CountStateTag } from "./CountStateTag";
import { SERIES } from "./palette";
import { fmtInt } from "@/lib/format";

const mval = (m: { value: number | null; status: string }) => (m.status === "value" && m.value !== null ? fmtInt(m.value) : m.status === "not_collected" ? "Não coletado" : "Indisponível");

/** Resumo de apuração (estado, seções, eleitorado, comparecimento, candidaturas com votos). Ausência ≠ 0. */
export function CountSummary({ view: br, limit = 6 }: { view: CountView; limit?: number }) {
  const s = br.snapshot;
  const started = br.state === "em_apuracao" || br.state === "parcial" || br.state === "totalizada";
  const top = started ? br.candidates.filter((c) => c.votes.status === "value").slice(0, limit) : [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2" data-testid="home-count">
        <CountStateTag state={br.state} />
        {s && (
          <>
            <Metric label="Seções totalizadas" value={s.countedPct.status === "value" && s.countedPct.value !== null ? `${s.countedPct.value.toFixed(2).replace(".", ",")}%` : "—"} />
            <Metric label="Eleitorado" value={mval(s.electorate)} />
            <Metric label="Comparecimento" value={mval(s.turnout)} />
          </>
        )}
      </div>
      {s && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-elevated" role="progressbar" aria-label="Seções totalizadas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.countedPct.value ?? 0}>
          <div className="h-full rounded-full bg-fg transition-[width] duration-700 ease-out" style={{ width: `${s.countedPct.status === "value" ? (s.countedPct.value ?? 0) : 0}%` }} />
        </div>
      )}
      {top.length > 0 ? (
        <ul className="space-y-2" data-testid="home-count-candidates">
          {top.map((c, i) => (
            <li key={c.sqCandidato} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              <span className="truncate text-[13px] text-fg">
                <span className="mr-2 inline-block size-2 rounded-full" style={{ background: SERIES[i] }} aria-hidden />
                {c.name} <span className="text-fg-3">{c.party}</span>
              </span>
              <span className="text-right font-display text-[15px] font-semibold text-fg tnum">{c.pct.status === "value" && c.pct.value !== null ? `${c.pct.value.toFixed(2).replace(".", ",")}%` : "—"}</span>
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-elevated"><span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${c.pct.value ?? 0}%`, background: SERIES[i] }} /></span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[var(--radius-sm)] border border-dashed border-border p-4 text-[12.5px] text-fg-3" data-testid="home-count-empty">
          {br.state === "nao_iniciada"
            ? "Dados ainda não publicados pelo TSE: a totalização não começou. Os zeros dos arquivos oficiais não são votos."
            : br.state === "nao_coletada"
              ? "Apuração ainda não coletada neste ambiente (worker do TSE não executado)."
              : "Arquivo oficial indisponível no momento."}
        </p>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[12px] text-fg-3">
      {label} <span className="ml-1 font-display text-[14px] font-semibold text-fg tnum">{value}</span>
    </span>
  );
}
