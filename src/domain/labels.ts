import type { DataNature, FactCheckStatus, Relevance, SpeechType, Tone, TopicId, SourceType, DebateEventKind } from "./types";

export const TOPIC_LABEL: Record<TopicId, string> = {
  economia: "Economia",
  emprego: "Emprego",
  seguranca: "Segurança",
  saude: "Saúde",
  educacao: "Educação",
  infraestrutura: "Infraestrutura",
  meio_ambiente: "Meio ambiente",
  impostos: "Impostos",
  previdencia: "Previdência",
  corrupcao: "Corrupção",
  justica: "Justiça",
  politica_externa: "Política externa",
  tecnologia: "Tecnologia",
  assistencia_social: "Assistência social",
  outros: "Outros",
};

export const SPEECH_TYPE_LABEL: Record<SpeechType, string> = {
  proposta: "Proposta",
  critica: "Crítica",
  resposta: "Resposta",
  defesa: "Defesa",
  ataque: "Ataque",
  informacao: "Informação",
  comparacao: "Comparação",
  promessa: "Promessa",
  pergunta: "Pergunta",
  contraponto: "Contraponto",
};

export const TONE_LABEL: Record<Tone, string> = {
  propositivo: "Propositivo",
  critico: "Crítico",
  defensivo: "Defensivo",
  confrontativo: "Confrontativo",
  neutro: "Neutro",
  informativo: "Informativo",
};

export const FACT_CHECK_LABEL: Record<FactCheckStatus, string> = {
  nao_necessario: "Não necessário",
  verificar: "Verificar",
  em_verificacao: "Em verificação",
  verificado: "Verificado",
  contexto_necessario: "Contexto necessário",
};

export const RELEVANCE_LABEL: Record<Relevance, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

export const NATURE_LABEL: Record<DataNature, string> = {
  official: "Dado oficial",
  collected: "Dado coletado",
  ai: "Classificação automática",
  analysis: "Análise",
};

export const NATURE_DESCRIPTION: Record<DataNature, string> = {
  official: "Proveniente de fonte oficial (ex.: TSE).",
  collected: "Coletado de plataforma ou fonte pública, sem alteração de conteúdo.",
  ai: "Produzido por modelo de IA. Pode conter erros; o texto original permanece disponível.",
  analysis: "Agregação ou interpretação produzida pelo sistema a partir de outros dados.",
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  official: "Official",
  social: "Social",
  media: "Media",
  transcript: "Transcript",
  ai_analysis: "AI Analysis",
};

export const EVENT_KIND_LABEL: Record<DebateEventKind, string> = {
  mention: "Menção",
  reply_chain: "Pergunta e resposta",
  topic_shift: "Mudança de tema",
  social_spike: "Aumento de volume",
  fact_check_flag: "Verificação sugerida",
};

/**
 * Agrupamento dos tipos de fala para gráficos de composição.
 * Mantém a leitura em até 5 categorias; o detalhe completo fica na tabela.
 */
export const SPEECH_GROUPS = [
  { id: "propostas", label: "Propostas", types: ["proposta", "promessa"] },
  { id: "criticas", label: "Críticas", types: ["critica", "ataque", "contraponto"] },
  { id: "respostas", label: "Respostas", types: ["resposta", "defesa"] },
  { id: "informacoes", label: "Informações", types: ["informacao", "comparacao"] },
  { id: "perguntas", label: "Perguntas", types: ["pergunta"] },
] as const satisfies readonly { id: string; label: string; types: readonly SpeechType[] }[];

export type SpeechGroupId = (typeof SPEECH_GROUPS)[number]["id"];

export function speechGroupOf(type: SpeechType): SpeechGroupId {
  const g = SPEECH_GROUPS.find((g) => (g.types as readonly SpeechType[]).includes(type));
  return g ? g.id : "informacoes";
}

export const TIMING_LABEL: Record<import("./types").TimingPrecision, string> = {
  exact: "exata (início/fim da fonte)",
  approximate: "aproximada",
  block: "apenas o bloco do debate",
  sequence: "apenas a ordem",
  unknown: "desconhecida",
  synthetic: "sintética (gerada para replay — não é horário real)",
};
