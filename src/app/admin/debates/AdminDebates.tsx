"use client";

import { useCallback, useState } from "react";
import { CONTROL_LABEL, TRANSITIONS, type DebateControl } from "@/control/debates";
import { Tag, buttonCls } from "@/components/ui/primitives";
import { fmtDateTime } from "@/lib/format";

const input = "w-full rounded-[var(--radius-sm)] border border-border bg-bg px-2 py-1.5 text-[13px] text-fg";

export function AdminDebates() {
  const [token, setToken] = useState("");
  const [items, setItems] = useState<DebateControl[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const call = useCallback(
    async (url: string, init?: RequestInit) => {
      const res = await fetch(url, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body.data;
    },
    [token],
  );
  const load = useCallback(async () => {
    try {
      setItems(await call("/api/admin/debates"));
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [call]);

  async function create(form: FormData) {
    const body = Object.fromEntries(form.entries());
    try {
      await call("/api/admin/debates", { method: "POST", body: JSON.stringify({ ...body, scheduledStart: body.scheduledStart ? new Date(String(body.scheduledStart)).toISOString() : "", candidates: String(body.candidates ?? "").split(",").map((s) => s.trim()).filter(Boolean) }) });
      setMsg(`Debate ${body.id} cadastrado.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }
  async function move(id: string, to: string) {
    try {
      await call(`/api/admin/debates/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ to, reason: "admin" }) });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[12px] text-fg-3">
          Token de administração
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className={input} aria-label="Token de administração" />
        </label>
        <button type="button" className={buttonCls("primary")} onClick={load}>
          Carregar
        </button>
      </div>
      {msg && (
        <p role="status" className="text-[12.5px] text-warn" data-testid="admin-msg">
          {msg}
        </p>
      )}
      {items && (
        <table className="w-full font-[family-name:var(--font-data)] text-[12.5px]" data-testid="admin-table">
          <thead>
            <tr className="border-b border-border text-left text-fg-3">
              <th className="py-2 pr-3 font-normal">Debate</th>
              <th className="px-3 py-2 font-normal">Fonte · modo</th>
              <th className="px-3 py-2 font-normal">Início</th>
              <th className="px-3 py-2 font-normal">Estado</th>
              <th className="py-2 pl-3 font-normal">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-border/70 align-top" data-testid={`admin-row-${c.id}`}>
                <td className="py-2 pr-3">
                  <p className="text-fg">{c.title}</p>
                  <p className="text-fg-3">
                    {c.id} · {c.officeLabel}
                    {c.candidates.length ? ` · ${c.candidates.join(", ")}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2 text-fg-2">
                  {c.sourceName} · {c.providerId} · {c.sourceMode === "replay" ? `replay ${c.replaySpeed}× de ${c.replayOf}` : c.sourceMode}
                </td>
                <td className="px-3 py-2 text-fg-2">
                  {fmtDateTime(c.scheduledStart)}
                  {c.startedAt ? ` · iniciado ${fmtDateTime(c.startedAt)}` : ""}
                  {c.endedAt ? ` · encerrado ${fmtDateTime(c.endedAt)}` : ""}
                </td>
                <td className="px-3 py-2">
                  <Tag tone={c.status === "error" ? "neg" : c.status === "live" ? "pos" : "neutral"}>{CONTROL_LABEL[c.status]}</Tag>
                  {c.error && <p className="mt-1 text-warn">{c.error}</p>}
                  {c.lastError && <p className="mt-1 text-warn">Último erro do worker: {c.lastError}</p>}
                  {c.lastHeartbeatAt && <p className="mt-1 text-fg-3">Batimento: {fmtDateTime(c.lastHeartbeatAt)}</p>}
                </td>
                <td className="py-2 pl-3">
                  <div className="flex flex-wrap gap-1">
                    {TRANSITIONS[c.status].map((to) => (
                      <button key={to} type="button" className={buttonCls("secondary")} onClick={() => move(c.id, to)} data-testid={`to-${to}`}>
                        {CONTROL_LABEL[to]}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {items && (
        <form action={create} className="grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-4 sm:grid-cols-3" data-testid="admin-form">
          <p className="text-[13px] font-semibold text-fg sm:col-span-3">Cadastrar debate</p>
          <Labeled k="Id (slug)"><input name="id" required className={input} /></Labeled>
          <Labeled k="Nome"><input name="title" required className={input} /></Labeled>
          <Labeled k="Cargo"><input name="officeLabel" required className={input} /></Labeled>
          <Labeled k="Data e horário"><input name="scheduledStart" type="datetime-local" required className={input} /></Labeled>
          <Labeled k="Fonte"><input name="sourceName" required className={input} /></Labeled>
          <Labeled k="URL (https)"><input name="sourceUrl" type="url" className={input} /></Labeled>
          <Labeled k="Provider">
            <select name="providerId" className={input} defaultValue="replay-transcript">
              <option value="replay-transcript">replay-transcript (replay temporizado)</option>
            </select>
          </Labeled>
          <Labeled k="Modo">
            <select name="sourceMode" className={input} defaultValue="replay">
              <option value="replay">replay</option>
              <option value="live">live (fonte contínua)</option>
            </select>
          </Labeled>
          <Labeled k="Replay de (id do debate)"><input name="replayOf" className={input} /></Labeled>
          <Labeled k="Velocidade">
            <select name="replaySpeed" className={input} defaultValue="1">
              {[1, 2, 5, 10].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled k="Candidatos (vírgula)"><input name="candidates" className={input} /></Labeled>
          <Labeled k="Jurisdição"><input name="jurisdiction" className={input} /></Labeled>
          <div className="sm:col-span-3">
            <button type="submit" className={buttonCls("primary")}>
              Cadastrar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Labeled({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <label className="block text-[12px] text-fg-3">
      {k}
      {children}
    </label>
  );
}
