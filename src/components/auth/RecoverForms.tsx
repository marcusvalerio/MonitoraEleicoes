"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { authClient } from "@/auth/client";
import { changePasswordAction } from "@/auth/actions";
import { inputCls, labelCls, submitCls } from "./AuthFrame";

/** Pedido de recuperação: resposta SEMPRE neutra (não revela se o e-mail existe). */
export function RequestResetForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (sent) return <p className="text-[13px] text-fg-2" role="status">Se houver uma conta com esse e-mail, enviaremos um link para definir uma nova senha (válido por 1 hora).</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await authClient.requestPasswordReset({ email: String(new FormData(e.currentTarget).get("email")), redirectTo: "/redefinir-senha" }).catch(() => {});
        setSent(true);
      }}
    >
      <div>
        <label htmlFor="email" className={labelCls}>E-mail da conta</label>
        <input id="email" name="email" type="email" required autoComplete="username" className={inputCls} />
      </div>
      <button type="submit" disabled={busy} className={submitCls}>Enviar link</button>
    </form>
  );
}

export function ResetForm({ token }: { token: string | null }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  if (!token) return <p className="text-[13px] text-fg-2">Link inválido ou expirado. <Link className="underline" href="/recuperar-senha">Peça um novo</Link>.</p>;
  if (state === "done") return <p className="text-[13px] text-fg-2" role="status">Senha redefinida. <Link className="underline" href="/login">Entrar</Link></p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const pw = String(f.get("next"));
        if (pw.length < 12) return setState("A senha precisa ter ao menos 12 caracteres.");
        if (pw !== String(f.get("confirm"))) return setState("A confirmação não confere.");
        setState("busy");
        const { error } = await authClient.resetPassword({ newPassword: pw, token });
        setState(error ? "Link inválido ou expirado." : "done");
      }}
    >
      <PasswordFields />
      {state !== "idle" && state !== "busy" && <p role="alert" className="text-[12.5px] text-neg">{state}</p>}
      <button type="submit" disabled={state === "busy"} className={submitCls}>Definir senha</button>
    </form>
  );
}

function PasswordFields() {
  return (
    <>
      <div>
        <label htmlFor="next" className={labelCls}>Nova senha <span className="text-fg-3">(mín. 12 caracteres)</span></label>
        <input id="next" name="next" type="password" required minLength={12} autoComplete="new-password" className={inputCls} />
      </div>
      <div>
        <label htmlFor="confirm" className={labelCls}>Confirmar nova senha</label>
        <input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" className={inputCls} />
      </div>
    </>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="change-password-form">
      <div>
        <label htmlFor="current" className={labelCls}>Senha atual</label>
        <input id="current" name="current" type="password" required autoComplete="current-password" className={inputCls} />
      </div>
      <PasswordFields />
      {state?.error && <p role="alert" className="text-[12.5px] text-neg">{state.error}</p>}
      <button type="submit" disabled={pending} className={submitCls}>{pending ? "Salvando…" : "Trocar senha"}</button>
    </form>
  );
}
