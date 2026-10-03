"use client";
import { useActionState, useState, useTransition } from "react";
import { createCampaignAction, searchCandidaciesAction } from "@/app/admin/actions";
import { fieldCls, labelCls, primaryBtn } from "./ui";

type Cand = Awaited<ReturnType<typeof searchCandidaciesAction>>[number];

/** Busca de candidatura OFICIAL (TSE) para vincular — opcional; o cruzamento com resultados depende dela. */
export function CandidacyPicker({ name = "candidacyId" }: { name?: string }) {
  const [year, setYear] = useState(2026);
  const [items, setItems] = useState<Cand[]>([]);
  const [chosen, setChosen] = useState<Cand | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <label className={labelCls} htmlFor="cand-q">Candidatura oficial (TSE) <span className="text-fg-3">— opcional</span></label>
      <input type="hidden" name={name} value={chosen?.id ?? ""} />
      {chosen ? (
        <div className="flex items-center justify-between rounded-[8px] border border-border bg-bg px-3 py-2 text-[13px]">
          <span>{chosen.ballot_name} · {chosen.office}{chosen.uf && chosen.uf !== "BR" ? ` (${chosen.uf})` : ""} · {chosen.party_acronym ?? "—"} · {chosen.year}</span>
          <button type="button" className="text-[12px] text-fg-3 hover:text-fg" onClick={() => setChosen(null)}>trocar</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <select aria-label="Ano da eleição" value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${fieldCls} w-24`}>
            {[2026, 2022, 2018, 2014].map((y) => <option key={y}>{y}</option>)}
          </select>
          <input id="cand-q" placeholder="Nome de urna (mín. 3 letras)" className={fieldCls} onChange={(e) => { const q = e.target.value; start(async () => setItems(q.trim().length >= 3 ? await searchCandidaciesAction(q, year) : [])); }} />
        </div>
      )}
      {!chosen && items.length > 0 && (
        <ul className="mt-1 max-h-56 overflow-auto rounded-[8px] border border-border bg-surface text-[12.5px]" role="listbox">
          {items.map((c) => (
            <li key={c.id}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-elevated" onClick={() => setChosen(c)}>
                <span className="text-fg">{c.ballot_name}</span> <span className="text-fg-3">· {c.office}{c.uf && c.uf !== "BR" ? ` (${c.uf})` : ""} · {c.party_acronym ?? "—"} · {c.year}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending && <p className="mt-1 text-[11px] text-fg-3">buscando…</p>}
    </div>
  );
}

export function NewCampaignForm() {
  const [state, action, pending] = useActionState(createCampaignAction, {});
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2" data-testid="new-campaign-form">
      <div>
        <label className={labelCls} htmlFor="c-name">Nome da campanha</label>
        <input id="c-name" name="name" required minLength={2} maxLength={120} className={fieldCls} placeholder="Ex.: Campanha Presidencial 2026" />
      </div>
      <div>
        <label className={labelCls} htmlFor="c-slug">Identificador <span className="text-fg-3">(opcional, gerado do nome)</span></label>
        <input id="c-slug" name="slug" maxLength={60} className={fieldCls} placeholder="campanha-presidencial-2026" />
      </div>
      <div className="md:col-span-2"><CandidacyPicker key={state.ok ?? "novo"} /></div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button disabled={pending} className={primaryBtn}>{pending ? "Criando…" : "Criar campanha"}</button>
        {state.error && <p role="alert" className="text-[12.5px] text-neg">{state.error}</p>}
        {state.ok && <p role="status" className="text-[12.5px] text-pos">{state.ok}</p>}
      </div>
    </form>
  );
}
