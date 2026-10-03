import type { BetterAuthOptions } from "better-auth";
import { sendPasswordResetEmail } from "./mail";

/** Opções compartilhadas (app, bootstrap e testes). Tabelas com prefixo auth_ (sem colisão com o schema eleitoral). */
export function authOptions(): Omit<BetterAuthOptions, "database" | "plugins"> {
  return {
    appName: "Monitora Eleições",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
    user: {
      modelName: "auth_user",
      additionalFields: { mustChangePassword: { type: "boolean", defaultValue: false, input: false } },
    },
    session: { modelName: "auth_session", expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => sendPasswordResetEmail(user.email, url),
    },
    rateLimit: { enabled: process.env.NODE_ENV === "production", window: 60, max: 30 },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production", cookiePrefix: "monitora" },
  };
}
