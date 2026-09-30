import type { Candidate, Debate, DebateBlock, Party } from "@/domain/types";

/**
 * DEMO DATA — candidatos, partidos e emissora são FICTÍCIOS.
 * Qualquer semelhança com pessoas ou organizações reais é coincidência.
 */
export const DEMO_PARTIES: Party[] = [
  { id: "pda", acronym: "PDA", name: "Partido Demo Aurora", number: 91 },
  { id: "pdh", acronym: "PDH", name: "Partido Demo Horizonte", number: 92 },
  { id: "pdr", acronym: "PDR", name: "Partido Demo Ribeira", number: 93 },
  { id: "pdc", acronym: "PDC", name: "Partido Demo Cerrado", number: 94 },
];

/** Cores de identificação validadas para daltonismo (sem significado político). */
export const DEMO_CANDIDATES: Candidate[] = [
  { id: "cand-a", name: "Helena Duarte", ballotName: "Helena Duarte", partyId: "pda", officeId: "presidente", swatch: "#6B8EF0", initials: "HD" },
  { id: "cand-b", name: "Rafael Monteiro", ballotName: "Rafael Monteiro", partyId: "pdh", officeId: "presidente", swatch: "#C8842E", initials: "RM" },
  { id: "cand-c", name: "Carla Nogueira", ballotName: "Carla Nogueira", partyId: "pdr", officeId: "presidente", swatch: "#1FA89A", initials: "CN" },
  { id: "cand-d", name: "Otávio Brandão", ballotName: "Otávio Brandão", partyId: "pdc", officeId: "presidente", swatch: "#B872D6", initials: "OB" },
];

export const MODERATOR_ID = "moderador";

export const DEMO_DEBATE_ID = "debate-presidencial-2026-1t";

export const DEMO_DEBATE: Debate = {
  id: DEMO_DEBATE_ID,
  title: "Debate Presidencial",
  broadcaster: "Emissora Demo",
  officeLabel: "Presidente da República",
  electionYear: 2026,
  round: 1,
  startsAt: "2026-10-02T00:00:00.000Z", // 01/10/2026 21:00 (BRT)
  endsAt: "2026-10-02T02:00:00.000Z",
  status: "live",
  participantIds: DEMO_CANDIDATES.map((c) => c.id),
  sourceIds: ["src-demo-transcript", "src-demo-ai", "src-demo-social"],
  mode: "demo",
};

export const DEMO_PAST_DEBATE: Debate = {
  id: "debate-presidencial-2026-sabatina",
  title: "Encontro de Candidatos — Sabatina",
  broadcaster: "Emissora Demo",
  officeLabel: "Presidente da República",
  electionYear: 2026,
  round: 1,
  startsAt: "2026-09-18T23:00:00.000Z",
  endsAt: "2026-09-19T01:00:00.000Z",
  status: "ended",
  participantIds: DEMO_CANDIDATES.map((c) => c.id),
  sourceIds: [],
  mode: "demo",
};

export const DEMO_BLOCK_DEFS: Omit<DebateBlock, "startOffset" | "endOffset">[] = [
  { id: "b0", label: "Abertura" },
  { id: "b1", label: "Bloco 1 · Tema livre" },
  { id: "b2", label: "Bloco 2 · Temas sorteados" },
  { id: "b3", label: "Bloco 3 · Confronto direto" },
  { id: "b4", label: "Considerações finais" },
];
