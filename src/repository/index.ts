import "server-only";
import { ingest } from "@/ingestion/pipeline";
import { getProfile, type ProviderProfile } from "@/providers/registry";
import { MemoryRepository } from "./memory";
import { PostgresRepository } from "./postgres";
import type { QueryContext } from "./queries";
import type { Repository } from "./types";

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

export async function getRepository(): Promise<Repository> {
  const p = getProfile();
  if (p.persistence === "postgres") {
    if (!postgres) postgres = PostgresRepository.fromEnv(queryContext(p, "pg"));
    return postgres;
  }
  if (!memory) {
    memory = ingest({ mode: p.mode, election: p.election, transcript: p.transcript, social: p.social, media: p.media, classifier: p.classifier, aiSourceId: p.aiSourceId }).then((store) => new MemoryRepository(store, queryContext(p)));
  }
  return memory;
}
