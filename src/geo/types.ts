import type { DataMode, Provenance, TopicId } from "@/domain/types";

/**
 * Camada geoespacial — independente de UI e de tecnologia de mapa.
 * Chaves hierárquicas: "BR" · "R:SE" · "UF:RJ" · "M:RJ:rio-de-janeiro"
 */
export type GeoLevelId = "pais" | "regiao" | "uf" | "municipio" | "zona" | "local" | "secao";

export const GEO_LEVELS: GeoLevelId[] = ["pais", "regiao", "uf", "municipio", "zona", "local", "secao"];

export const GEO_LEVEL_LABEL: Record<GeoLevelId, string> = {
  pais: "Brasil",
  regiao: "Região",
  uf: "Estado",
  municipio: "Município",
  zona: "Zona eleitoral",
  local: "Local de votação",
  secao: "Seção",
};

export interface GeoRegion {
  key: string;
  level: GeoLevelId;
  name: string;
  shortName: string;
  parentKey: string | null;
  /** Peso de referência (participação populacional aproximada), usado apenas pelo gerador demo. */
  weight: number;
}

/** Contorno desenhável. `path` em coordenadas do `viewBox` do conjunto. */
export interface GeoBoundary {
  key: string;
  path: string;
}

export interface GeoBoundarySet {
  level: GeoLevelId;
  viewBox: string;
  boundaries: GeoBoundary[];
  attribution: string;
}

/** Métrica bruta por folha geográfica e janela de tempo. */
export interface GeoMetric {
  regionKey: string;
  bucketStart: number;
  bucketSize: number;
  posts: number;
  mentionsByCandidate: Record<string, number>;
  byTopic: Partial<Record<TopicId, number>>;
  provenance: Provenance;
}

export interface GeoQuery {
  debateId: string;
  /** Pai cujos filhos serão retornados (ex.: "BR" → regiões ou UFs). */
  parentKey: string;
  /** Nível dos filhos; permite pular Região (BR → UF). */
  childLevel: GeoLevelId;
  from: number;
  to: number;
  topic?: TopicId | null;
}

/** Linha agregada por território — consumida pelo mapa e pela tabela. */
export interface GeoAggregate {
  key: string;
  name: string;
  shortName: string;
  level: GeoLevelId;
  posts: number;
  /** Publicações sobre o tema filtrado (ou total quando sem filtro). */
  topicPosts: number;
  shareOfParent: number;
  mentionsByCandidate: Record<string, number>;
  predominantCandidateId: string | null;
  predominantShare: number;
  topTopic: TopicId | null;
  topTopicShare: number;
  /** Variação da última janela vs. a anterior (null = sem base). */
  trend: number | null;
  hasChildren: boolean;
}

export interface GeoResponse {
  mode: DataMode;
  parent: { key: string; name: string; level: GeoLevelId };
  breadcrumb: { key: string; name: string }[];
  childLevel: GeoLevelId;
  rows: GeoAggregate[];
  totals: { posts: number; topicPosts: number; geolocatedShare: number };
  window: { from: number; to: number; trendWindow: number };
  /** Motivo quando o nível pedido não possui granularidade para dados sociais. */
  unavailableReason: string | null;
}
