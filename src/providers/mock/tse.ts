import type { TSEProvider } from "../types";
import { DEMO_CANDIDATES, DEMO_PARTIES } from "@/data/demo/entities";

/**
 * TSE mock. Não fabrica resultados: `results` retorna vazio até a importação
 * oficial (P1). Candidatos/partidos são os fictícios do DEMO.
 */
export class MockTSEProvider implements TSEProvider {
  readonly id = "mock-tse";
  readonly mode = "demo" as const;
  async candidates() {
    return DEMO_CANDIDATES;
  }
  async parties() {
    return DEMO_PARTIES;
  }
  async results() {
    return [];
  }
  async importBatches() {
    return [];
  }
  async health() {
    return { status: "unavailable" as const, checkedAt: new Date().toISOString(), message: "Importação TSE prevista para P1." };
  }
}
