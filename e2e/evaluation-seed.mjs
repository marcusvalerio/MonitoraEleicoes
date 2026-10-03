#!/usr/bin/env node
// Prepara o banco de TESTE para o E2E da Avaliação: fixtures oficiais (formato TSE, dataset 'fixture' ⇒ DEMONSTRAÇÃO)
// e o 1º ADMIN via bootstrap com credenciais ALEATÓRIAS desta execução (gravadas só em .monitora/, ignorado pelo git).
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { createJiti } from "jiti";
import { loadLocalEnv } from "../scripts/env.mjs";

loadLocalEnv();
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "scripts/shims/server-only.mjs") } });
const { createSql, assertTestDatabase } = await jiti.import("@/persistence/db");
const { resetTestDatabase } = await jiti.import("@/persistence/testing");
const { importCandidacies, importResults, resolveIdentities } = await jiti.import("@/elections/tse/importer");
const { candCsv, voteCsv, FX_CANDIDACIES, FX_VOTES } = await jiti.import("@/elections/tse/fixtures");
const { getAuth } = await jiti.import("@/auth/server");
const { bootstrapAdmin } = await jiti.import("@/auth/bootstrap");

const sql = createSql(process.env.DATABASE_URL_TEST, "DATABASE_URL_TEST");
await assertTestDatabase(sql);
await resetTestDatabase(sql);
const opt = { datasetId: "e2e-tse", datasetKind: "fixture", hmacKey: "chave-de-teste-nao-secreta" };
for (const y of [2018, 2022, 2026]) await importCandidacies(sql, y, candCsv(FX_CANDIDACIES.filter((c) => c.year === y)), opt);
await importResults(sql, 2022, [voteCsv(FX_VOTES.filter((v) => v.year === 2022))], opt);
await resolveIdentities(sql);
const admin = { email: `admin-${randomBytes(3).toString("hex")}@teste.invalid`, password: randomBytes(16).toString("base64url") };
await bootstrapAdmin(await getAuth(), sql, { ADMIN_EMAIL: admin.email, ADMIN_INITIAL_PASSWORD: admin.password });
mkdirSync(path.join(root, ".monitora"), { recursive: true });
writeFileSync(path.join(root, ".monitora", "e2e-admin.json"), JSON.stringify(admin));
console.log(JSON.stringify({ msg: "e2e.evaluation.seeded", admin: admin.email }));
process.exit(0);
