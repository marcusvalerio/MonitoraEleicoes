import { log } from "@/infrastructure/log";

/**
 * E-mail de recuperação de senha. Com RESEND_API_KEY + AUTH_EMAIL_FROM, envia pelo Resend.
 * Sem provedor de e-mail: fora de produção registra o link no log do servidor (desenvolvimento/teste);
 * em produção recusa, com mensagem clara — nunca finge que enviou.
 */
export async function sendPasswordResetEmail(to: string, url: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (key && from) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject: "Monitora Eleições · redefinição de senha", text: `Para definir uma nova senha, acesse (válido por 1 hora):\n\n${url}\n\nSe você não pediu, ignore este e-mail.` }),
    });
    if (!r.ok) throw new Error(`envio de e-mail falhou (HTTP ${r.status})`);
    return;
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("recuperação de senha indisponível: provedor de e-mail não configurado");
  log("info", "auth.password_reset_link", { to, url });
}
