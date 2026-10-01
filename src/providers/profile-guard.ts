/** Seleção do perfil de dados (sem dependências de servidor; usada pelo registry e pelos testes). */
export type ProfileId = "demo" | "fixture" | "live";

/** Dados sintéticos (demo/fixture) só em testes automatizados — nunca em produção. */
export function syntheticAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV === "production" || env.MONITORA_ENV === "production") return false;
  return env.MONITORA_ALLOW_SYNTHETIC === "1" || env.NODE_ENV === "test";
}

export function getProfileId(env: Record<string, string | undefined> = process.env): ProfileId {
  const v = env.DATA_MODE;
  if ((v === "demo" || v === "fixture") && syntheticAllowed(env)) return v;
  return "live";
}
