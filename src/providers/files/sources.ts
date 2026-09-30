import type { Source } from "@/domain/types";

const T = "2026-09-30T13:00:00.000Z";
const base = { timestamp: T, collectedAt: T, recordCount: 0, mode: "live" as const };

/** Fontes do perfil LIVE (dados reais). Status é recalculado a partir da ingestão. */
export const LIVE_SOURCES: Source[] = [
  { ...base, id: "src-file-transcript", name: "Transcrições importadas", type: "transcript", provider: "FileTranscriptProvider", url: null, status: "connected", providerKind: "transcript", providerId: "file-transcript", description: "Transcrições reais importadas como arquivo (VTT/SRT/TXT/JSON/CSV) quando a fonte não oferece acesso automatizado. Cobertura e precisão temporal declaradas por debate." },
  { ...base, id: "src-file-press", name: "Matérias de referência", type: "media", provider: "FilePressProvider", url: null, status: "connected", providerKind: "media", providerId: "file-press", description: "Matérias jornalísticas usadas como fonte de transcrição literal, com URL, data e hash do documento." },
  { ...base, id: "src-file-registry", name: "Registro de candidaturas", type: "official", provider: "FileRegistryElectionProvider", url: null, status: "connected", providerKind: "election", providerId: "file-registry", description: "Candidaturas, partidos e números de urna. Identificadores oficiais do TSE ainda não coletados." },
  { ...base, id: "src-ai-rules", name: "Classificador por regras", type: "ai_analysis", provider: "rule-based-classifier 0.1.0", url: null, status: "connected", providerKind: "ai", description: "Classificação determinística por palavras-chave (sem LLM configurado). Baixa cobertura temática esperada." },
  { ...base, id: "src-social-not-configured", name: "Redes sociais", type: "social", provider: "—", url: null, status: "not_configured", providerKind: "social", providerId: "social-not-configured", description: "Nenhum provider social configurado. Repercussão não disponível para este perfil." },
  { ...base, id: "src-tse", name: "TSE · Dados Abertos (resultados)", type: "official", provider: "TSEElectionProvider", url: "https://dadosabertos.tse.jus.br", status: "not_configured", providerKind: "election", description: "Fonte oficial de resultados. Importação ainda não implementada." },
  { ...base, id: "src-geo-boundaries", name: "Contornos das UFs", type: "official", provider: "@svg-maps/brazil (CC BY 4.0)", url: "https://github.com/VictorCazanave/svg-maps", status: "connected", providerKind: "geo", providerId: "svg-geo", license: "CC BY 4.0", description: "Geometria simplificada dos estados para visualização." },
];
