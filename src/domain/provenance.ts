/**
 * PROVENIÊNCIA — toda informação importante é rastreável até um registro de origem.
 *
 *   Source (fonte lógica, ex.: "X · posts sobre o debate")
 *     └── Provider (implementação que acessa a fonte)
 *           └── SourceRecord (um registro bruto recebido: externalId, URL, datas, hash)
 *                 └── entidade de domínio normalizada (aponta para o SourceRecord)
 */
export type ProviderKind = "election" | "social" | "transcript" | "media" | "geo" | "ai";

/** Estado operacional de uma fonte/provider — consumido pelo indicador global. */
export type SourceStatus = "connected" | "degraded" | "offline" | "not_configured" | "demo";

export interface SourceRecord {
  /** ID interno estável: `${providerId}:${externalId}`. */
  id: string;
  sourceId: string;
  providerId: string;
  /** ID do registro no sistema de origem. */
  externalId: string;
  /** Esquema do payload bruto (ex.: "demo.transcript.segment/v1"). */
  schema: string;
  sourceUrl: string | null;
  /** Quando o conteúdo foi publicado/ocorreu na origem (ISO). */
  publishedAt: string | null;
  /** Quando o provider obteve o registro (ISO). */
  collectedAt: string;
  /** Quando entrou no Monitora (ISO). */
  ingestedAt: string;
  /** Hash do payload bruto, para auditoria de alterações. */
  payloadHash: string;
}

/** Referência compacta usada dentro das entidades de domínio. */
export interface RecordRef {
  recordId: string;
  externalId: string;
  providerId: string;
}

/** Hash não-criptográfico (FNV-1a) para detectar mudança de payload. */
export function payloadHash(payload: unknown): string {
  const s = JSON.stringify(payload);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
