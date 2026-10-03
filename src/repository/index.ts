import "server-only";
import { ingest } from "@/ingestion/pipeline";
import { getProfile, type ProviderProfile } from "@/providers/registry";
import { MemoryRepository } from "./memory";
import { PostgresRepository } from "./postgres";
import type { QueryContext } from "./queries";
import type { Repository } from "./types";
import { createSql } from "@/persistence/db";
import { log } from "@/infrastructure/log";

export type { Repository } from "./types";

/**
 * Seleção do repositório segue o perfil (registry é o único seletor):
 *   demo / fixture → memória (ingestão no processo; nunca toca o banco)
 *   live           → PostgreSQL/Neon (somente leitura aqui; ingestão é feita pelo worker)
 */
export function queryContext(p: ProviderProfile, cacheKey = "mem"): QueryContext {
  return {
    profileId: p.id,
    profileLabel: p.label,
    mode: p.mode,
    clock: p.clock,
    sources: p.sources,
    platforms: () => p.social.platforms(),
    socialProviderName: p.social.info.name,
    socialSourceId: p.social.info.sourceId,
    providers: [p.election, p.transcript, p.social, p.media, p.geo].map((x) => ({ id: x.info.id, name: x.info.name, kind: x.info.kind, configured: x.info.config.configured })),
    persistence: p.persistence,
    cacheKey,
  };
}

let memory: Promise<MemoryRepository> | null = null;
let postgres: PostgresRepository | null = null;
/** Schema mínimo que o repositório PostgreSQL lê (debate_control, editorial, apuração, pesquisas). */
export const REPOSITORY_SCHEMA = "0009";
let pgReady: { at: number; ok: boolean } | null = null;

/** Banco configurado E com schema atualizado? (cacheado 60 s; falha de conexão ⇒ false). */
async function postgresReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (pgReady && Date.now() - pgReady.at < 60_000) return pgReady.ok;
  let ok = false;
  try {
    const sql = createSql(process.env.DATABASE_URL, "DATABASE_URL");
    const [r] = (await sql`select max(version) as v from schema_migrations`) as { v: string | null }[];
    ok = !!r?.v && r.v >= REPOSITORY_SCHEMA;
  } catch {
    ok = false;
  }
  if (!ok && (!pgReady || pgReady.ok)) log("warn", "repository.postgres.unavailable", { reason: process.env.DATABASE_URL ? `schema < ${REPOSITORY_SCHEMA} ou banco inacessível` : "DATABASE_URL ausente", fallback: "arquivos reais (data/real)" });
  pgReady = { at: Date.now(), ok };
  return ok;
}

export async function getRepository(): Promise<Repository> {
  const p = getProfile();
  if (p.persistence === "postgres") {
    // Rede de segurança: sem banco pronto, o perfil REAL lê os arquivos reais (data/real) em memória —
    // nunca dados de demonstração e nunca uma página quebrada.
    if (await postgresReady()) {
      if (!postgres) postgres = PostgresRepository.fromEnv(queryContext(p, "pg"));
      return postgres;
    }
    return (memory ??= ingest({ mode: p.mode, election: p.election, transcript: p.transcript, social: p.social, media: p.media, classifier: p.classifier, aiSourceId: p.aiSourceId }).then((store) => new MemoryRepository(store, queryContext({ ...p, persistence: "memory" }))));
  }
  if (!memory) {
    memory = ingest({ mode: p.mode, election: p.election, transcript: p.transcript, social: p.social, media: p.media, classifier: p.classifier, aiSourceId: p.aiSourceId }).then((store) => new MemoryRepository(store, queryContext(p)));
  }
  return memory;
}
