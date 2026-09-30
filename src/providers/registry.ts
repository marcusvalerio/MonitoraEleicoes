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
import { DEMO_SOURCES } from "@/data/demo/sources";
import { FIXTURE_SOURCES } from "./fixture/sources";

/**
 * ÚNICO ponto de seleção de providers. Nenhuma outra camada testa "é demo?".
 *
 *   DATA_MODE=demo     → providers DEMO (padrão)
 *   DATA_MODE=fixture  → providers alternativos (formatos diferentes; prova de desacoplamento)
 *   DATA_MODE=live     → providers reais (ainda não configurados → erro explícito)
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
}

export function getProfileId(): ProfileId {
  const v = process.env.DATA_MODE;
  return v === "live" || v === "fixture" ? v : "demo";
}

function build(id: ProfileId): ProviderProfile {
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
    };
  }
  if (id === "live") {
    // Providers reais (TSE, YouTube, X…) serão registrados aqui, lendo credenciais do ambiente.
    throw new Error("DATA_MODE=live: nenhum provider real configurado ainda (ver docs/PROVIDERS.md).");
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
  };
}

let profile: ProviderProfile | null = null;
export function getProfile(): ProviderProfile {
  if (!profile) profile = build(getProfileId());
  return profile;
}

/** Compat: modo de dados (demo|live) para rótulos. */
export function getDataMode(): DataMode {
  return getProfile().mode;
}
