// Carrega .env.local (se existir) sem sobrescrever variáveis já definidas. Sem dependências.
import { existsSync, readFileSync } from "node:fs";
export function loadLocalEnv(file = ".env.local") {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
/** Variável de conexão por ambiente. */
export const URL_VAR = { development: "DATABASE_URL", test: "DATABASE_URL_TEST", production: "DATABASE_URL_PRODUCTION" };
