import { defineConfig } from "vitest/config";
import path from "node:path";

/** Testes de persistência: rodam SOMENTE contra DATABASE_URL_TEST (branch Neon marcada 'test'). */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "scripts/shims/server-only.mjs") } },
  test: { include: ["src/**/*.db.test.ts"], environment: "node", testTimeout: 120_000, hookTimeout: 120_000, fileParallelism: false },
});
