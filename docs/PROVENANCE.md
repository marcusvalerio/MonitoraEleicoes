# Proveniência

```
Source ─► Provider ─► RawRecord ─► SourceRecord ─► entidade de domínio (provenance.record)
```

- **Source**: fonte lógica ("X · posts sobre o debate"), com tipo (`official`, `social`, `media`, `transcript`, `ai_analysis`), status (`connected`, `degraded`, `offline`, `not_configured`, `demo`), licença e descrição.
- **SourceRecord**: um por item recebido — `id = providerId:externalId`, `schema`, `sourceUrl`, `publishedAt` (origem), `collectedAt` (provider), `ingestedAt` (Monitora), `payloadHash` (FNV-1a do payload, detecta alterações).
- **Provenance** (em cada entidade): `nature` (`official` | `collected` | `ai` | `analysis`), `sourceId`, `mode` (`demo`|`live`) e `record` (`recordId`, `externalId`, `providerId`).

## Persistência da cadeia

```
source ─► source_record (provider_id + external_id) ─► raw_record (payload jsonb + hash, por versão) ─► ingestion_run
                  ▲                                                                                        │
     entidade.source_record_id (debate, segmento, candidato, post, matéria…)            ingestion_error (rejeições)
                  ▲
             analysis (segment_id + model/versões)
```

Qualquer segmento exibido pode ser rastreado até o payload bruto que o originou e a execução que o trouxe (consulta coberta por `npm run test:db`). Detalhes em `docs/DATABASE.md`.

## Cobertura editorial

`editorial_event` (fato: texto original, `published_at` da fonte ou NULL, URL, hash, versão, `parser_version`, `strategy`, `removed_at`) → `source_record` → `raw_record` (versões) → `ingestion_run`; `editorial_analysis` (interpretação por versão de conteúdo × classificador × metodologia). A UI identifica sempre "g1 · cobertura editorial · Atualização editorial" — nunca "transcrição".

## RAW × normalizado × análise

- O texto original (`TranscriptSegment.text`) **nunca** é alterado.
- Classificações de IA (`SpeechClassification`) ficam em estrutura separada, com `model`, `version`, `promptVersion`, `confidence`, `confidenceLevel`, `classifiedAt`, `humanReviewed`.
- Relevância não vem do modelo: é calculada por critérios objetivos (`domain/relevance.ts`), com metodologia versionada (`relevanceMethod = criteria-sum v2`) e os critérios gravados (`relevanceFeatures`).
- No banco, `analysis` nunca é sobrescrita: nova versão de modelo/prompt/metodologia = nova linha; a leitura usa a mais recente.

## Fato × medição × interpretação

Todo `DebateEvent` traz `statements[]`:

| Tipo | Exemplo |
|---|---|
| `fact` | "Helena Duarte dirigiu pergunta sobre economia a Rafael Monteiro às 21:06:39." |
| `measurement` | "Volume de publicações +18% nos 5 minutos seguintes, comparado aos 5 anteriores." |
| `interpretation` | "A variação de volume foi temporalmente associado ao período … Proximidade temporal não indica causalidade." |

`domain/statements.ts` bloqueia linguagem causal (`gerou`, `causou`, `provocou`, `por causa de`…); testes verificam todas as afirmações geradas.

## Dados ausentes

`DataValue<T>` distingue `value` (inclusive 0), `unknown`, `not_available`, `not_collected`, `not_applicable` — com `reason`. A UI mostra "—" com o motivo, nunca 0. No banco, o enum `value_status` acompanha cada medida (`CHECK`: valor NULL ⇔ status ≠ `value`); offsets de fala desconhecidos são `NULL` + `timestamp_precision`. Resultados eleitorais sem importação retornam `status: not_collected`.

## Confiança

`high | medium | low | unknown` para localização, classificação, entidade e tópico (`confidenceLevel(score)`: ≥ 0,85 alta; ≥ 0,65 média).
