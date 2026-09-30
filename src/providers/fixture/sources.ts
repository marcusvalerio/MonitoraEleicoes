import type { Source } from "@/domain/types";

const T = "2026-10-02T00:00:00.000Z";
const base = { timestamp: T, collectedAt: T, url: null, recordCount: 0, mode: "demo" as const };

/** Fontes do perfil FIXTURE (testes de desacoplamento — fictício). */
export const FIXTURE_SOURCES: Source[] = [
  { ...base, id: "src-fixture-captions", name: "Legendas (fixture)", type: "transcript", provider: "FixtureTranscriptProvider", status: "demo", description: "Legendas em formato alternativo (ms, orador por nome).", providerKind: "transcript", providerId: "fixture-captions" },
  { ...base, id: "src-fixture-ai", name: "Classificador por regras", type: "ai_analysis", provider: "rule-based-classifier 0.1.0", status: "demo", description: "Classificação determinística por palavras-chave.", providerKind: "ai" },
  { ...base, id: "src-fixture-listening", name: "Social listening (fixture)", type: "social", provider: "FixtureSocialProvider", status: "demo", description: "Contagens por plataforma e por UF/município, referências por nome.", providerKind: "social", providerId: "fixture-listening" },
  { ...base, id: "src-fixture-registry", name: "Registro de candidaturas (fixture)", type: "official", provider: "FixtureElectionProvider", status: "demo", description: "Partidos, candidaturas e identidade visual em formato alternativo.", providerKind: "election", providerId: "fixture-registry" },
  { ...base, id: "src-fixture-media", name: "Imprensa (fixture)", type: "media", provider: "FixtureMediaProvider", status: "not_configured", description: "Provider sem credenciais — demonstra o estado 'não configurado'.", providerKind: "media", providerId: "fixture-media" },
  { ...base, id: "src-geo-boundaries", name: "Contornos das UFs", type: "official", provider: "@svg-maps/brazil (CC BY 4.0)", url: "https://github.com/VictorCazanave/svg-maps", status: "connected", mode: "live", description: "Geometria simplificada dos estados para visualização.", providerKind: "geo", providerId: "svg-geo", license: "CC BY 4.0" },
];
