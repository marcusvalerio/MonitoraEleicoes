#!/usr/bin/env node
/**
 * Cria o PRIMEIRO ADMIN a partir de ADMIN_EMAIL e ADMIN_INITIAL_PASSWORD (variáveis de ambiente / secret).
 * Uso: node scripts/auth-bootstrap.mjs --env development|test|production [--confirm-production]
 * Requer também BETTER_AUTH_SECRET. Nada é impresso além do resultado (nunca a senha).
 */
import path from "node:path";
import { createJiti } from "jiti";
import { loadLocalEnv, URL_VAR } from "./env.mjs";

loadLocalEnv();
const args = process.argv.slice(2);
const env = args.includes("--env") ? args[args.indexOf("--env") + 1] : null;
if (!env || !URL_VAR[env]) throw new Error("uso: --env development|test|production");
if (env === "production" && !args.includes("--confirm-production")) throw new Error("produção exige --confirm-production (autorização explícita)");
if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET não definida");
process.env.DATABASE_URL = process.env[URL_VAR[env]];
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "scripts/shims/server-only.mjs") } });
const { createSql } = await jiti.import("@/persistence/db");
const { getAuth } = await jiti.import("@/auth/server");
const { bootstrapAdmin } = await jiti.import("@/auth/bootstrap");
const r = await bootstrapAdmin(await getAuth(), createSql(process.env.DATABASE_URL, URL_VAR[env]), process.env);
console.log(JSON.stringify({ msg: "auth.bootstrap", env, status: r.status }));
process.exit(0);
