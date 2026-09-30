import "server-only";
import type { DataMode } from "@/domain/types";
import type { SocialProvider, SourceRegistry, TSEProvider, TranscriptProvider } from "./types";
import { MockTranscriptProvider } from "./mock/transcript";
import { MockSocialProvider } from "./mock/social";
import { MockTSEProvider } from "./mock/tse";
import { DEMO_SOURCES } from "@/data/demo/sources";

/**
 * Composição de providers (server-only). A escolha é feita por DATA_MODE.
 * Providers reais serão registrados aqui sem alterar domínio ou UI.
 */
export function getDataMode(): DataMode {
  return process.env.DATA_MODE === "live" ? "live" : "demo";
}

export interface Providers {
  mode: DataMode;
  transcript: TranscriptProvider;
  social: SocialProvider;
  tse: TSEProvider;
  sources: SourceRegistry;
}

let instance: Providers | null = null;

export function getProviders(): Providers {
  if (instance) return instance;
  const mode = getDataMode();
  if (mode === "live") {
    // P1: RealTSEProvider, RealTranscriptProvider, providers sociais reais.
    throw new Error("DATA_MODE=live ainda não possui providers reais configurados.");
  }
  instance = {
    mode,
    transcript: new MockTranscriptProvider(),
    social: new MockSocialProvider(),
    tse: new MockTSEProvider(),
    sources: {
      list: async () => DEMO_SOURCES,
      get: async (id) => DEMO_SOURCES.find((s) => s.id === id) ?? null,
    },
  };
  return instance;
}
