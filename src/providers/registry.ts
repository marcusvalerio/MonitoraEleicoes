import "server-only";
import type { DataMode, Source } from "@/domain/types";
import type { SpeechClassifier } from "@/ai/classifier";
import { RuleBasedSpeechClassifier } from "@/ai/classifiers";
import { DemoSpeechClassifier } from "./demo/classifier";
import type { DataStore } from "@/ingestion/store";
import type { ElectionProvider, GeoProvider, MediaProvider, SocialProvider, TranscriptProvider } from "./contracts";
import { DemoElectionProvider, DemoMediaProvider, DemoSocialProvider, DemoTranscriptProvider } from "./demo";
import { FixtureElectionProvider, FixtureMediaProvider, FixtureSocialProvider, FixtureTranscriptProvider } from "./fixture";
import { SvgGeoProvider } from "./geo/svg";
import { FilePressProvider, FileRegistryElectionProvider, FileTranscriptProvider, UnconfiguredSocialProvider } from "./files";
import { LIVE_SOURCES } from "./files/sources";
import { ReplayLiveTranscriptProvider, type ReplaySpeed } from "./replay";
import { G1LiveEditorialProvider, G1_PROVIDER_ID } from "./g1";
import { XProvider } from "./x";
import { YouTubeProvider } from "./youtube";
import { PLATFORM_MATRIX, UnavailableSocialProvider } from "./social/catalog";
import type { SocialListeningProvider } from "./contracts";
import { paginate, type TranscriptProvider as TranscriptProviderT } from "./contracts";
import { DEMO_SOURCES } from "@/data/demo/sources";
import { FIXTURE_SOURCES } from "./fixture/sources";

/**
 * ÚNICO ponto de seleção de providers. Nenhuma outra camada testa "é demo?".
 *
 *   DATA_MODE=live     → dados reais (PADRÃO — única opção da aplicação real)
 *   DATA_MODE=demo     → providers DEMO (dados fictícios) — SOMENTE testes automatizados
 *   DATA_MODE=fixture  → providers alternativos (prova de desacoplamento) — SOMENTE testes automatizados
 *
 * Perfis sintéticos exigem MONITORA_ALLOW_SYNTHETIC=1 (ou NODE_ENV=test) e são SEMPRE recusados em produção
 * (VERCEL_ENV=production ou MONITORA_ENV=production): nesses casos o perfil efetivo é "live".
 */
export type { ProfileId } from "./profile-guard";
import type { ProfileId } from "./profile-guard";

export type { ClockSpec } from "@/lib/clock";
import type { ClockSpec } from "@/lib/clock";

export interface ProviderProfile {
  id: ProfileId;
  label: string;
  /** Natureza dos dados servidos (fictícios ou reais). */
  mode: DataMode;
  election: ElectionProvider;
  transcript: TranscriptProvider;
  social: SocialProvider;
  media: MediaProvider;
  geo: GeoProvider;
  classifier: (store: DataStore) => SpeechClassifier;
  aiSourceId: string;
  sources: Source[];
  clock: ClockSpec;
  /** Onde o domínio é armazenado/lido: memória (demo/fixture) ou PostgreSQL/Neon (live). */
  persistence: "memory" | "postgres";
}

export { getProfileId, syntheticAllowed } from "./profile-guard";
import { getProfileId } from "./profile-guard";

export function buildProfile(id: ProfileId): ProviderProfile {
  if (id === "fixture") {
    return {
      id,
      label: "Fixture (teste de desacoplamento)",
      mode: "demo",
      election: new FixtureElectionProvider(),
      transcript: new FixtureTranscriptProvider(),
      social: new FixtureSocialProvider(),
      media: new FixtureMediaProvider(),
      geo: new SvgGeoProvider(),
      classifier: (store) => new RuleBasedSpeechClassifier(() => [...store.candidates.values()]),
      aiSourceId: "src-fixture-ai",
      sources: FIXTURE_SOURCES,
      clock: { kind: "replay", minOffset: 1800 },
      persistence: "memory",
    };
  }
  if (id === "live") {
    // Dados reais. Hoje: arquivos importados (data/real). Futuro: TSE, YouTube, X… (credenciais via env).
    return {
      id,
      label: "Dados reais",
      mode: "live",
      election: new FileRegistryElectionProvider(),
      transcript: new FileTranscriptProvider(),
      social: new UnconfiguredSocialProvider(),
      media: new FilePressProvider(),
      geo: new SvgGeoProvider(),
      classifier: (store) => new RuleBasedSpeechClassifier(() => [...store.candidates.values()]),
      aiSourceId: "src-ai-rules",
      sources: LIVE_SOURCES,
      clock: { kind: "replay", minOffset: 0 },
      persistence: "postgres",
    };
  }
  return {
    id,
    label: "Demonstração",
    mode: "demo",
    election: new DemoElectionProvider(),
    transcript: new DemoTranscriptProvider(),
    social: new DemoSocialProvider(),
    media: new DemoMediaProvider(),
    geo: new SvgGeoProvider(),
    classifier: () => new DemoSpeechClassifier(),
    aiSourceId: "src-demo-ai",
    sources: DEMO_SOURCES,
    clock: { kind: "replay", minOffset: 1800 },
    persistence: "memory",
  };
}

let profile: ProviderProfile | null = null;
export function getProfile(): ProviderProfile {
  if (!profile) profile = buildProfile(getProfileId());
  return profile;
}

/** Compat: modo de dados (demo|live) para rótulos. */
export function getDataMode(): DataMode {
  return getProfile().mode;
}

/**
 * Providers de um debate cadastrado (debate_control). Também é seleção de provider — por isso fica aqui.
 * Hoje: "replay-transcript" (replay temporizado de transcrição importada). Fontes realmente ao vivo
 * (legenda oficial, STT) entram como novos `provider_id` implementando LiveTranscriptProvider.
 */
export function buildControlProviders(
  c: { id: string; title: string; providerId: string; sourceMode: string; replayOf: string | null; replaySpeed: number | null; startedAt: string | null },
  now: () => number = Date.now,
  editorialSources: { providerId: string; sourceUrl: string }[] = [],
  fetchImpl: typeof fetch = fetch,
) {
  const base = buildProfile("live");
  // Fontes editoriais (ex.: g1) — cobertura, não transcrição; mesmas etapas do pipeline.
  const editorial = editorialSources.map((s) => {
    if (s.providerId === G1_PROVIDER_ID) return new G1LiveEditorialProvider({ debateId: c.id, sourceUrl: s.sourceUrl }, fetchImpl, now);
    throw new Error(`fonte editorial não suportada: ${s.providerId}`);
  });
  if (c.providerId === "replay-transcript") {
    if (c.sourceMode !== "replay" || !c.replayOf || !c.replaySpeed || !c.startedAt) throw new Error(`debate ${c.id}: replay exige origem, velocidade e início`);
    const transcript = new ReplayLiveTranscriptProvider(new FileTranscriptProvider(), { id: c.id, title: c.title, replayOf: c.replayOf, speed: c.replaySpeed as ReplaySpeed, startedAt: c.startedAt }, now);
    return { ...base, transcript, editorial };
  }
  if (c.providerId === "manifest-only") {
    // Metadados do debate vêm do manifesto (data/real/<id>/manifest.json), sem transcrição; cobertura via fontes editoriais.
    const files = new FileTranscriptProvider();
    const transcript: TranscriptProviderT = {
      info: files.info,
      health: () => files.health(),
      listEvents: async (page) => {
        const all = await files.listEvents({ limit: 500 });
        return paginate(all.items.filter((r) => r.externalId === c.id), page);
      },
      fetchSegments: async (id, page) => (id === c.id ? files.fetchSegments(id, page) : paginate([], page)),
    };
    return { ...base, transcript, editorial };
  }
  throw new Error(`provider não suportado para debate ao vivo: ${c.providerId}`);
}

/**
 * Providers de social listening (seleção de provider — por isso aqui). YouTube com chave via env;
 * as demais plataformas entram como "sem acesso" (requires_authorization / unsupported), nunca fingindo coleta.
 */
export function buildSocialProviders(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): SocialListeningProvider[] {
  const yt = new YouTubeProvider({ apiKey: env.YOUTUBE_API_KEY, hashKey: env.IDENTITY_HASH_KEY, budget: Number(env.YOUTUBE_QUOTA_PER_RUN ?? 1500) }, fetchImpl, now);
  const x = new XProvider({ bearerToken: env.X_API_BEARER_TOKEN, hashKey: env.IDENTITY_HASH_KEY, maxPosts: Number(env.X_MAX_POSTS_PER_RUN ?? 500) }, fetchImpl, now);
  return [x, yt, ...PLATFORM_MATRIX.filter((e) => e.platform !== "youtube" && e.platform !== "x").map((e) => new UnavailableSocialProvider(e))];
}
