"use client";
import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { saveInvestmentAction, territorySearchAction } from "@/app/avaliacao/actions";
import { FREQUENCIES, FREQUENCY_LABEL, fmtBRL, fmtDateBR, occurrences, parseMoneyToCents, type Frequency } from "@/evaluation/model";

const field = "h-11 w-full rounded-[10px] border border-border-strong bg-bg px-3 text-[14px] text-fg placeholder:text-fg-3 outline-none focus:border-fg/50 focus-visible:ring-2 focus-visible:ring-info/40";
const lab = "mb-1.5 block text-[12px] font-medium text-fg-2";
const LEVEL = { pais: "País", regiao: "Região", uf: "UF", municipio: "Município" } as Record<string, string>;

export interface FormInitial {
  id?: string;
  name: string;
  category: string;
  amount: string;
  frequency: Frequency;
  start: string;
  end: string;
  territory: { id: number; name: string; level: string; uf: string | null } | null;
  notes: string;
}

/** Registro de investimento: UMA regra; a prévia mostra as ocorrências derivadas e o total acumulado no período. */
export function InvestmentForm({ campaign, categories, initial }: { campaign: string; categories: string[]; initial: FormInitial }) {
  const [state, action, pending] = useActionState(saveInvestmentAction, {});
  const [freq, setFreq] = useState<Frequency>(initial.frequency);
  const [amount, setAmount] = useState(initial.amount);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [territory, setTerritory] = useState(initial.territory);
  const [options, setOptions] = useState<NonNullable<FormInitial["territory"]>[]>([]);
  const [searching, startSearch] = useTransition();
  const err = state.errors ?? {};
  const preview = useMemo(() => {
    const cents = parseMoneyToCents(amount);
    const occ = occurrences({ frequency: freq, start, end: freq === "once" ? start : end });
    return { cents, occ, total: cents !== null ? cents * occ.length : null };
  }, [amount, freq, start, end]);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="investment-form">
      <input type="hidden" name="campaign" value={campaign} />
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="space-y-5">
        <div>
          <label htmlFor="f-name" className={lab}>Nome da ação</label>
          <input id="f-name" name="name" required defaultValue={initial.name} placeholder="Ex.: Material de campanha" className={field} aria-invalid={!!err.name} />
          {err.name && <p className="mt-1 text-[12px] text-neg">{err.name}</p>}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="f-cat" className={lab}>Categoria <span className="text-fg-3">(interna de gestão)</span></label>
            <input id="f-cat" name="category" required list="cats" defaultValue={initial.category} className={field} aria-invalid={!!err.category} />
            <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            {err.category && <p className="mt-1 text-[12px] text-neg">{err.category}</p>}
          </div>
          <div>
            <label htmlFor="f-amount" className={lab}>Valor por ocorrência (R$)</label>
            <input id="f-amount" name="amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.500,00" className={`${field} font-[family-name:var(--font-num)] tabular-nums`} aria-invalid={!!err.amount} />
            {err.amount && <p className="mt-1 text-[12px] text-neg">{err.amount}</p>}
          </div>
        </div>
        <fieldset>
          <legend className={lab}>Frequência</legend>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="radiogroup">
            {FREQUENCIES.map((f) => (
              <label key={f} className={`flex h-10 cursor-pointer items-center justify-center rounded-[8px] border text-[12.5px] transition-colors ${freq === f ? "border-fg/60 bg-elevated text-fg" : "border-border text-fg-3 hover:text-fg-2"}`}>
                <input type="radio" name="frequency" value={f} checked={freq === f} onChange={() => setFreq(f)} className="sr-only" />
                {FREQUENCY_LABEL[f]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="f-start" className={lab}>{freq === "once" ? "Data" : "Data inicial"}</label>
            <input id="f-start" name="start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={field} aria-invalid={!!err.start} />
            {err.start && <p className="mt-1 text-[12px] text-neg">{err.start}</p>}
          </div>
          {freq !== "once" && (
            <div>
              <label htmlFor="f-end" className={lab}>Data final</label>
              <input id="f-end" name="end" type="date" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} className={field} aria-invalid={!!err.end} />
              {err.end && <p className="mt-1 text-[12px] text-neg">{err.end}</p>}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="f-terr" className={lab}>Território <span className="text-fg-3">(Brasil, UF ou município — base oficial do Monitora)</span></label>
          <input type="hidden" name="territoryId" value={territory?.id ?? ""} />
          {territory ? (
            <div className="flex h-11 items-center justify-between rounded-[10px] border border-border-strong bg-bg px-3 text-[14px]">
              <span>{territory.name}{territory.uf && territory.level === "municipio" ? ` · ${territory.uf}` : ""} <span className="text-[12px] text-fg-3">· {LEVEL[territory.level] ?? territory.level}</span></span>
              <button type="button" onClick={() => setTerritory(null)} className="text-[12px] text-fg-3 hover:text-fg">trocar</button>
            </div>
          ) : (
            <>
              <input id="f-terr" placeholder="Busque: Brasil, São Paulo, Campinas…" autoComplete="off" className={field} aria-invalid={!!err.territory} onChange={(e) => { const q = e.target.value; startSearch(async () => setOptions(q.trim().length >= 2 ? await territorySearchAction(q, null) : [])); }} />
              {options.length > 0 && (
                <ul className="mt-1 max-h-60 overflow-auto rounded-[10px] border border-border bg-surface text-[13px]" role="listbox" data-testid="territory-options">
                  {options.map((o) => (
                    <li key={o.id}>
                      <button type="button" className="w-full px-3 py-2 text-left hover:bg-elevated" onClick={() => { setTerritory(o); setOptions([]); }}>
                        {o.name}{o.level === "municipio" && o.uf ? ` · ${o.uf}` : ""} <span className="text-fg-3">· {LEVEL[o.level] ?? o.level}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {searching && <p className="mt-1 text-[11px] text-fg-3">buscando…</p>}
            </>
          )}
          {err.territory && <p className="mt-1 text-[12px] text-neg">{err.territory}</p>}
        </div>
        <div>
          <label htmlFor="f-notes" className={lab}>Observação</label>
          <textarea id="f-notes" name="notes" rows={3} maxLength={2000} defaultValue={initial.notes} className={`${field} h-auto py-2.5`} />
        </div>
        {state.error && <p role="alert" className="text-[13px] text-neg">{state.error}</p>}
        <div className="flex items-center gap-3">
          <button disabled={pending} className="h-11 rounded-[10px] bg-fg px-5 text-[14px] font-semibold text-bg hover:bg-white disabled:opacity-50">{pending ? "Salvando…" : initial.id ? "Salvar alterações" : "Registrar investimento"}</button>
          <Link href={initial.id ? `/avaliacao/investimentos/${initial.id}` : "/avaliacao"} className="text-[13px] text-fg-3 hover:text-fg">Cancelar</Link>
        </div>
      </div>
      <aside className="h-fit rounded-[14px] border border-border bg-surface/60 p-5 lg:sticky lg:top-16" aria-label="Prévia da regra" data-testid="investment-preview">
        <p className="font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-[0.16em] text-fg-3">PRÉVIA DA REGRA</p>
        <p className="mt-3 text-[12px] text-fg-3">Total acumulado no período</p>
        <p className="font-[family-name:var(--font-num)] text-[30px] leading-tight font-semibold text-fg tabular-nums" data-testid="preview-total">{fmtBRL(preview.total)}</p>
        <p className="mt-1 text-[12.5px] text-fg-2">
          {preview.occ.length} {preview.occ.length === 1 ? "ocorrência" : "ocorrências"} × {fmtBRL(preview.cents)}
        </p>
        {preview.occ.length > 0 && (
          <ol className="mt-4 max-h-56 space-y-1 overflow-auto border-t border-border pt-3 text-[12px] text-fg-2 tabular-nums">
            {preview.occ.slice(0, 60).map((d) => <li key={d} className="flex justify-between"><span>{fmtDateBR(d)}</span><span className="text-fg-3">{fmtBRL(preview.cents)}</span></li>)}
            {preview.occ.length > 60 && <li className="text-fg-3">… mais {preview.occ.length - 60}</li>}
          </ol>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-fg-3">Um único registro com regra de recorrência. Ocorrências são calculadas dentro do período informado — nada é gerado além da data final.</p>
      </aside>
    </form>
  );
}
