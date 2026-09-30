/** RAW do g1 · cobertura editorial ao vivo (um post). Versão do parser registrada no próprio payload. */
export interface G1LivePostV1 {
  debate_id: string;
  page_url: string;
  post_id: string;
  headline: string | null;
  /** Texto original do post (limpo de tags; nunca reescrito). */
  text: string;
  published_at: string | null;
  modified_at: string | null;
  url: string | null;
  strategy: "json-ld" | "microdata";
  parser_version: string;
  /** Fragmento original relevante (JSON do BlogPosting ou HTML), até 20 KB. */
  fragment: string;
}
