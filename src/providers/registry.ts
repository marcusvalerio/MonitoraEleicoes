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
import { DEMO_SOURCES } from "@/data/demo/sources";
import { FIXTURE_SOURCES } from "./fixture/sources";

/**
 * ÚNICO ponto de seleção de providers. Nenhuma outra camada testa "é demo?".
 *
 *   DATA_MODE=demo     → providers DEMO (padrão)
 *   DATA_MODE=fixture  → providers alternativos (formatos diferentes; prova de desacoplamento)
 *   DATA_MODE=live     → dados reais (arquivos importados em data/real; redes sociais não configuradas)
 */
export type ProfileId = "demo" | "fixture" | "live";

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

export function getProfileId(): ProfileId {
  const v = process.env.DATA_MODE;
  return v === "live" || v === "fixture" ? v : "demo";
}

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
export function buildControlProviders(c: { id: string; title: string; providerId: string; sourceMode: string; replayOf: string | null; replaySpeed: number | null; startedAt: string | null }, now: () => number = Date.now) {
  const base = buildProfile("live");
  if (c.providerId === "replay-transcript") {
    if (c.sourceMode !== "replay" || !c.replayOf || !c.replaySpeed || !c.startedAt) throw new Error(`debate ${c.id}: replay exige origem, velocidade e início`);
    const transcript = new ReplayLiveTranscriptProvider(new FileTranscriptProvider(), { id: c.id, title: c.title, replayOf: c.replayOf, speed: c.replaySpeed as ReplaySpeed, startedAt: c.startedAt }, now);
    return { ...base, transcript };
  }
  throw new Error(`provider não suportado para debate ao vivo: ${c.providerId}`);
}
