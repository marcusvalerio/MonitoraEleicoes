"use client";

import { useCallback, useState } from "react";
import { Tag, buttonCls } from "@/components/ui/primitives";
import { fmtDateTime, fmtInt } from "@/lib/format";

const input = "w-full rounded-[var(--radius-sm)] border border-border bg-bg px-2 py-1.5 text-[13px] text-fg";
type R = Record<string, unknown>;
interface State {
  sources: R[];
  monitors: R[];
  elections: R[];
  imports: R[];
  unresolved: R[];
}
const list = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function AdminIntelligence() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<State | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const call = useCallback(
    async (init?: RequestInit) => {
      const res = await fetch("/api/admin/intelligence", { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body.data;
    },
    [token],
  );
  const load = useCallback(async () => {
    try {
      setData(await call());
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [call]);
  const act = async (body: R, ok?: string) => {
    try {
      const r = await call({ method: "POST", body: JSON.stringify(body) });
      setMsg(ok ?? (r && r.status ? `Teste: ${r.status}${r.message ? ` — ${r.message}` : ""}` : "OK"));
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[12px] text-fg-3">
          Token de administração
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className={input} aria-label="Token de administração" />
        </label>
        <button type="button" className={buttonCls("primary")} onClick={load}>Carregar</button>
        {msg && <p className="text-[12.5px] text-fg-2" role="status" data-testid="admin-msg">{msg}</p>}
      </div>
      {data && (
        <>
          <section>
            <h2 className="mb-2 text-[14px] text-fg">Fontes sociais</h2>
            <table className="w-full text-[12.5px]" data-testid="admin-sources">
              <tbody>
                {data.sources.map((s) => (
                  <tr key={String(s.id)} className="border-t border-border/60">
                    <td className="py-1.5 pr-2 text-fg">{String(s.name ?? s.id)}</td>
                    <td className="px-2"><Tag tone={s.accessStatus === "active" ? "pos" : s.accessStatus === "error" ? "neg" : "neutral"}>{String(s.accessStatus)}</Tag></td>
                    <td className="px-2 text-fg-3">{s.lastSuccessAt ? `ok ${fmtDateTime(String(s.lastSuccessAt))}` : "sem sucesso registrado"}{s.lastError ? ` · erro: ${String(s.lastError)}` : ""}</td>
                    <td className="px-2 text-right whitespace-nowrap">
                      <button type="button" className="text-fg-2 hover:text-fg" onClick={() => act({ action: "source_test", id: s.id })}>Testar</button>{" · "}
                      <button type="button" className="text-fg-2 hover:text-fg" onClick={() => act({ action: "source_enable", id: s.id, enabled: !s.enabled }, s.enabled ? "Fonte desativada." : "Fonte ativada.")}>{s.enabled ? "Desativar" : "Ativar"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2 className="mb-2 text-[14px] text-fg">Monitores</h2>
            <ul className="space-y-1 text-[12.5px]" data-testid="admin-monitors">
              {data.monitors.map((m) => (
                <li key={String(m.id)} className="flex flex-wrap items-center gap-2 border-t border-border/60 py-1.5">
                  <span className="text-fg">{String(m.name)}</span>
                  <Tag tone={m.status === "active" ? "pos" : "neutral"}>{String(m.status)}</Tag>
                  <span className="text-fg-3">{(m.terms as string[]).join(", ")} · {(m.platforms as string[]).join(", ")} · a cada {fmtInt(Number(m.intervalS))}s</span>
                  {m.lastError ? <span className="text-fg-3">erro: {String(m.lastError)}</span> : null}
                  <span className="ml-auto space-x-2">
                    {["active", "paused", "archived"].filter((s) => s !== m.status).map((s) => (
                      <button key={s} type="button" className="text-fg-2 hover:text-fg" onClick={() => act({ action: "monitor_status", id: m.id, status: s })}>{s === "active" ? "Ativar" : s === "paused" ? "Pausar" : "Arquivar"}</button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 grid gap-2 md:grid-cols-3"
              data-testid="monitor-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                act({ action: "monitor_upsert", monitor: { id: String(f.get("id")), name: String(f.get("name")), electionYear: 2026, officeIds: list(f.get("offices")).map(Number), candidacyIds: list(f.get("candidacies")).map(Number), parties: list(f.get("parties")).map((p) => p.toUpperCase()), ufs: list(f.get("ufs")).map((u) => u.toUpperCase()), terms: list(f.get("terms")), platforms: list(f.get("platforms")), intervalS: Number(f.get("interval") || 900), status: "draft", debateId: String(f.get("debate") || "") || null } }, "Monitor salvo (rascunho).");
              }}
            >
              <input name="id" placeholder="id (ex.: presidente-2026)" className={input} required />
              <input name="name" placeholder="Nome" className={input} required />
              <input name="terms" placeholder="Termos (vírgula)" className={input} required />
              <input name="platforms" placeholder="Plataformas (ex.: youtube)" className={input} defaultValue="youtube" />
              <input name="candidacies" placeholder="IDs de candidatura (vírgula)" className={input} />
              <input name="parties" placeholder="Partidos (siglas)" className={input} />
              <input name="offices" placeholder="Cargos (1,3,5…)" className={input} />
              <input name="ufs" placeholder="UFs" className={input} />
              <input name="interval" type="number" min={60} max={86400} placeholder="Intervalo (s)" className={input} />
              <input name="debate" placeholder="Debate associado (opcional)" className={input} />
              <button type="submit" className={buttonCls("primary")}>Salvar monitor</button>
            </form>
          </section>
          <section>
            <h2 className="mb-2 text-[14px] text-fg">Dados eleitorais (TSE)</h2>
            <p className="text-[12.5px] text-fg-3">{data.elections.map((e) => `${e.year}: ${e.status}, ${fmtInt(Number(e.candidacies))} candidaturas`).join(" · ")}</p>
            <table className="mt-2 w-full text-[12px]" data-testid="admin-imports">
              <tbody>
                {data.imports.map((i) => (
                  <tr key={String(i.id)} className="border-t border-border/60">
                    <td className="py-1 pr-2 text-fg">{String(i.year)} · {String(i.kind)}</td>
                    <td className="px-2"><Tag tone={i.status === "completed" ? "pos" : i.status === "failed" ? "neg" : "info"}>{String(i.status)}</Tag></td>
                    <td className="px-2 text-fg-3 tnum">lidas {fmtInt(Number(i.rows_read))} · gravadas {fmtInt(Number(i.rows_written))} · rejeitadas {fmtInt(Number(i.rows_rejected))}</td>
                    <td className="px-2 text-fg-3">{i.error ? String(i.error) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11.5px] text-fg-3">Importação via CLI: <code>npm run import:tse -- --env development --year 2022</code>.</p>
          </section>
          <section>
            <h2 className="mb-2 text-[14px] text-fg">Identidades não resolvidas ({data.unresolved.length})</h2>
            <p className="mb-2 text-[11.5px] text-fg-3">Sem identificador oficial comparável, o vínculo nunca é feito por nome. Revisão manual exige justificativa; deixe “pessoa” vazio para rejeitar.</p>
            <ul className="space-y-1 text-[12.5px]" data-testid="admin-identities">
              {data.unresolved.map((c) => (
                <li key={String(c.id)} className="border-t border-border/60 py-1.5">
                  <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); act({ action: "identity_manual", candidacyId: c.id, personId: String(f.get("person") ?? ""), note: String(f.get("note") ?? "") }, "Vínculo revisado."); }}>
                    <span className="text-fg">{String(c.ballot_name)}</span>
                    <span className="text-fg-3">{String(c.year)} · {String(c.party_acronym ?? "—")} · {String(c.uf ?? "BR")} · #{String(c.id)}</span>
                    <input name="person" placeholder="pessoa (id)" className={`${input} w-28`} />
                    <input name="note" placeholder="justificativa" className={`${input} w-56`} required />
                    <button type="submit" className="text-fg-2 hover:text-fg">Salvar</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
