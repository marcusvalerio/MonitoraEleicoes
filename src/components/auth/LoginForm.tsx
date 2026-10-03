"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { safeNext } from "@/auth/roles";
import { inputCls, labelCls, submitCls } from "./AuthFrame";

export function LoginForm({ next }: { next: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
    if (error || !data) {
      setBusy(false);
      setError(error?.status === 429 ? "Muitas tentativas. Aguarde um minuto." : "E-mail ou senha incorretos.");
      return;
    }
    const role = (data.user as { role?: string }).role;
    window.location.assign(safeNext(next, role === "admin"));
  }
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="login-form">
      <div>
        <label htmlFor="email" className={labelCls}>E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required className={inputCls} />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className={labelCls}>Senha</label>
          <Link href="/recuperar-senha" className="text-[11.5px] text-fg-3 hover:text-fg">Esqueci a senha</Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputCls} />
      </div>
      {error && <p role="alert" className="text-[12.5px] text-neg" data-testid="login-error">{error}</p>}
      <button type="submit" disabled={busy} className={submitCls}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
